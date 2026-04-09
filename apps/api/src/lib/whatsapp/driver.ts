import { and, eq, inArray } from "drizzle-orm";
import { assertDb, whatsappContactMappings, conversationStates, drivers, bonds, deliveries, dispatchQueueEntries } from "@repo/db";
import { resolveDriverOffer, driverUpdateDeliveryStatus, completeDelivery } from "../dispatch";
import { appendConversationTurn, computeOperationalStaleAt, getOrCreateConversationState, updateConversationState } from "./conversation-memory";

// ─── Types ────────────────────────────────────────────────────────────────────

type DbInstance = ReturnType<typeof assertDb>["db"];

// ─── Resolve driver from JID ──────────────────────────────────────────────────

export const resolveDriverFromJid = async (
  db: DbInstance,
  companyId: string,
  jid: string
): Promise<{ userId: string; driverId: string; driverName: string } | null> => {
  const [mapping] = await db
    .select()
    .from(whatsappContactMappings)
    .where(
      and(
        eq(whatsappContactMappings.companyId, companyId),
        eq(whatsappContactMappings.contactJid, jid),
        eq(whatsappContactMappings.role, "driver")
      )
    )
    .limit(1);

  if (!mapping) return null;

  const [driver] = await db
    .select({ id: drivers.id, name: drivers.name })
    .from(drivers)
    .where(eq(drivers.userId, mapping.userId))
    .limit(1);

  if (!driver) return null;

  return { userId: mapping.userId, driverId: driver.id, driverName: driver.name };
};

// ─── Command parsing ──────────────────────────────────────────────────────────

const ACCEPT_KEYWORDS = ["aceitar", "aceito", "accept", "sim", "yes", "ok"];
const REFUSE_KEYWORDS = ["recusar", "recuso", "refuse", "nao", "não", "no"];
const PICKED_UP_KEYWORDS = ["coletado", "pickei", "picked up", "coletei", "coletando", "coletou"];
const IN_TRANSIT_KEYWORDS = ["em entrega", "saindo", "in transit", "saindo para entregar", "a caminho"];

const normalizeText = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

type DriverCommand =
  | { type: "accept" }
  | { type: "refuse" }
  | { type: "picked_up" }
  | { type: "in_transit" }
  | { type: "unknown" };

const parseDriverCommand = (body: string): DriverCommand => {
  const normalized = normalizeText(body);

  if (ACCEPT_KEYWORDS.some((kw) => normalized === normalizeText(kw) || normalized.includes(normalizeText(kw)))) {
    return { type: "accept" };
  }
  if (REFUSE_KEYWORDS.some((kw) => normalized === normalizeText(kw) || normalized.includes(normalizeText(kw)))) {
    return { type: "refuse" };
  }
  if (PICKED_UP_KEYWORDS.some((kw) => normalized.includes(normalizeText(kw)))) {
    return { type: "picked_up" };
  }
  if (IN_TRANSIT_KEYWORDS.some((kw) => normalized.includes(normalizeText(kw)))) {
    return { type: "in_transit" };
  }

  return { type: "unknown" };
};

// ─── Load active offer for driver ─────────────────────────────────────────────

const loadActiveOfferForDriver = async (db: DbInstance, companyId: string, driverId: string) => {
  const [entry] = await db
    .select()
    .from(dispatchQueueEntries)
    .where(
      and(
        eq(dispatchQueueEntries.companyId, companyId),
        eq(dispatchQueueEntries.phase, "offered"),
        eq(dispatchQueueEntries.offeredDriverId, driverId)
      )
    )
    .limit(1);

  return entry ?? null;
};

// ─── Main handler ─────────────────────────────────────────────────────────────

export const processDriverMessage = async (params: {
  instanceName: string;
  companyId: string;
  contactJid: string;
  messageId: string;
  messageText: string;
  imageUrl?: string;
  sendReply: (text: string) => Promise<void>;
}): Promise<void> => {
  const { db } = assertDb();
  const { companyId, contactJid, messageId, messageText, imageUrl, sendReply } = params;

  // Resolve driver identity
  const driverInfo = await resolveDriverFromJid(db, companyId, contactJid);
  if (!driverInfo) {
    await sendReply("Acesso não autorizado. Entre em contato com a empresa.");
    return;
  }

  const { userId, driverId } = driverInfo;
  const sessionUser = { id: userId, role: "driver" as const };

  // Idempotency check
  const state = await getOrCreateConversationState(db, companyId, contactJid);
  if (state.lastProcessedMessageId === messageId) {
    console.info(`[WhatsApp/driver] idempotency skip messageId=${messageId} driverId=${driverId}`);
    return;
  }

  await updateConversationState(db, state.id, {
    roleResolution: "driver",
    conversationMode: "driver_idle",
    currentFlow: "operational",
    status: "active",
    staleAt: computeOperationalStaleAt(),
    lastUserMessageAt: new Date(),
    lastProcessedMessageId: messageId
  });
  await appendConversationTurn(db, {
    conversationStateId: state.id,
    companyId,
    contactJid,
    role: "user",
    messageText,
    normalizedText: normalizeText(messageText),
    metadata: imageUrl ? { imageUrl } : {}
  });

  // Handle photo proof
  if (imageUrl) {
    const [delivery] = await db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.companyId, companyId),
          eq(deliveries.driverId, driverId),
          inArray(deliveries.status, ["accepted", "picked_up", "in_transit"])
        )
      )
      .limit(1);

    if (!delivery) {
      const reply = "Nenhuma entrega ativa encontrada para envio de comprovante.";
      await appendConversationTurn(db, {
        conversationStateId: state.id,
        companyId,
        contactJid,
        role: "assistant",
        messageText: reply,
        detectedIntent: "unknown"
      });
      await sendReply(reply);
      return;
    }

    try {
      await completeDelivery({
        user: sessionUser,
        data: { deliveryId: delivery.id, proof: { photoUrl: imageUrl } }
      });
      const reply = "✅ Entrega concluída com comprovante! Obrigado.";
      await appendConversationTurn(db, {
        conversationStateId: state.id,
        companyId,
        contactJid,
        role: "assistant",
        messageText: reply,
        detectedIntent: "status_question"
      });
      await sendReply(reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[WhatsApp/driver] completeDelivery error driverId=${driverId}`, err);
      const reply = `Erro ao concluir entrega: ${msg}`;
      await appendConversationTurn(db, {
        conversationStateId: state.id,
        companyId,
        contactJid,
        role: "assistant",
        messageText: reply,
        metadata: { error: msg }
      });
      await sendReply(reply);
    }
    return;
  }

  const command = parseDriverCommand(messageText);

  if (command.type === "accept" || command.type === "refuse") {
    const queueEntry = await loadActiveOfferForDriver(db, companyId, driverId);
    if (!queueEntry) {
      const reply = "Nenhuma oferta pendente encontrada.";
      await appendConversationTurn(db, {
        conversationStateId: state.id,
        companyId,
        contactJid,
        role: "assistant",
        messageText: reply,
        detectedIntent: "unknown"
      });
      await sendReply(reply);
      return;
    }

    try {
      await resolveDriverOffer({
        user: sessionUser,
        data: {
          deliveryId: queueEntry.deliveryId,
          decision: command.type === "accept" ? "accept" : "reject"
        }
      });

      if (command.type === "accept") {
        const reply = `✅ Entrega aceita! Use 'coletado' quando buscar o pacote e envie uma foto ao entregar.`;
        await appendConversationTurn(db, {
          conversationStateId: state.id,
          companyId,
          contactJid,
          role: "assistant",
          messageText: reply,
          detectedIntent: "continue_draft"
        });
        await sendReply(reply);
      } else {
        const reply = `❌ Entrega recusada.`;
        await appendConversationTurn(db, {
          conversationStateId: state.id,
          companyId,
          contactJid,
          role: "assistant",
          messageText: reply,
          detectedIntent: "cancel_draft"
        });
        await sendReply(reply);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[WhatsApp/driver] resolveDriverOffer error driverId=${driverId}`, err);
      const reply = `Erro ao processar resposta: ${msg}`;
      await appendConversationTurn(db, {
        conversationStateId: state.id,
        companyId,
        contactJid,
        role: "assistant",
        messageText: reply,
        metadata: { error: msg }
      });
      await sendReply(reply);
    }
    return;
  }

  if (command.type === "picked_up" || command.type === "in_transit") {
    const expectedStatuses = (command.type === "picked_up" ? ["accepted"] : ["picked_up"]) as Array<"accepted" | "picked_up">;
    const [delivery] = await db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.companyId, companyId),
          eq(deliveries.driverId, driverId),
          inArray(deliveries.status, expectedStatuses)
        )
      )
      .limit(1);

    if (!delivery) {
      const reply =
        command.type === "picked_up"
          ? "Nenhuma entrega aceita encontrada para marcar como coletada."
          : "Nenhuma entrega coletada encontrada para marcar em trânsito.";
      await appendConversationTurn(db, {
        conversationStateId: state.id,
        companyId,
        contactJid,
        role: "assistant",
        messageText: reply,
        detectedIntent: "unknown"
      });
      await sendReply(reply);
      return;
    }

    try {
      await driverUpdateDeliveryStatus({
        user: sessionUser,
        data: { deliveryId: delivery.id, status: command.type }
      });

      const label = command.type === "picked_up" ? "📦 Pacote coletado!" : "🚗 Em trânsito!";
      const reply = `${label} Envie uma foto quando entregar ao destinatário.`;
      await appendConversationTurn(db, {
        conversationStateId: state.id,
        companyId,
        contactJid,
        role: "assistant",
        messageText: reply,
        detectedIntent: "status_question"
      });
      await sendReply(reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[WhatsApp/driver] driverUpdateDeliveryStatus error driverId=${driverId}`, err);
      const reply = `Erro ao atualizar status: ${msg}`;
      await appendConversationTurn(db, {
        conversationStateId: state.id,
        companyId,
        contactJid,
        role: "assistant",
        messageText: reply,
        metadata: { error: msg }
      });
      await sendReply(reply);
    }
    return;
  }

  // Unknown command
  const reply =
    "Comandos disponíveis:\n• 'aceitar' — aceitar entrega\n• 'recusar' — recusar entrega\n• 'coletado' — pacote coletado\n• 'em entrega' — saindo para entregar\n• [foto] — comprovante de entrega";
  await appendConversationTurn(db, {
    conversationStateId: state.id,
    companyId,
    contactJid,
    role: "assistant",
    messageText: reply,
    detectedIntent: "unknown"
  });
  await sendReply(reply);
};
