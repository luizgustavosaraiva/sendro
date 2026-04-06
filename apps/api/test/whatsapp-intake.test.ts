import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertDb, companies, users, bonds, retailers, whatsappContactMappings, conversationStates, deliveries } from "@repo/db";
import { processIntakeMessage, setLLMExtractor, getOrCreateConversationState } from "../src/lib/whatsapp/intake";
import type { LLMExtractor, DeliveryFields } from "../src/lib/whatsapp/intake";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedCompanyAndRetailer(suffix: string) {
  const { db } = assertDb();

  const [companyUser] = await db
    .insert(users)
    .values({ id: `company-user-${suffix}`, name: "Co User", email: `co.${suffix}@test.com`, emailVerified: true, role: "company" })
    .returning();

  const [company] = await db
    .insert(companies)
    .values({ userId: companyUser.id, name: `Co ${suffix}`, slug: `co-${suffix}` })
    .returning();

  const [retailerUser] = await db
    .insert(users)
    .values({ id: `retailer-user-${suffix}`, name: "Ret User", email: `ret.${suffix}@test.com`, emailVerified: true, role: "retailer" })
    .returning();

  const [retailer] = await db
    .insert(retailers)
    .values({ userId: retailerUser.id, name: `Ret ${suffix}`, slug: `ret-${suffix}` })
    .returning();

  // Active bond
  await db.insert(bonds).values({
    companyId: company.id,
    entityId: retailer.id,
    entityType: "retailer",
    status: "active"
  });

  const contactJid = `551199999${suffix.slice(0, 4)}@s.whatsapp.net`;

  // Register contact mapping
  await db.insert(whatsappContactMappings).values({
    companyId: company.id,
    contactJid,
    userId: retailerUser.id
  });

  return { company, retailer, retailerUser, contactJid };
}

// ─── Stub extractor factory ───────────────────────────────────────────────────

function makeProgressiveStub(steps: Array<Partial<DeliveryFields>>): LLMExtractor {
  let callCount = 0;
  return {
    async extract(_messages, existing) {
      const step = steps[Math.min(callCount++, steps.length - 1)];
      const merged = { ...existing, ...step };
      const hasAll = merged.pickupAddress && merged.dropoffAddress;
      return {
        fields: step,
        nextMessage: hasAll
          ? "Confirme sua entrega."
          : !merged.pickupAddress
            ? "Por favor, informe o endereço de coleta."
            : "Por favor, informe o endereço de entrega."
      };
    }
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.DATABASE_URL)("whatsapp intake", () => {
  const replies: string[] = [];
  let sendReply: (text: string) => Promise<void>;

  beforeAll(() => {
    sendReply = async (text: string) => {
      replies.push(text);
    };
  });

  afterAll(() => {
    // Reset LLM extractor singleton
    setLLMExtractor({
      async extract() {
        return { fields: {}, nextMessage: "Por favor, informe o endereço de coleta." };
      }
    });
  });

  it("idle → collecting: first message returns collecting state with nextMessage", async () => {
    const suffix = `${Date.now()}a`;
    const { company, contactJid } = await seedCompanyAndRetailer(suffix);
    const { db } = assertDb();

    setLLMExtractor(makeProgressiveStub([{}]));

    const localReplies: string[] = [];
    await processIntakeMessage({
      db,
      companyId: company.id,
      contactJid,
      messageId: "msg-001",
      messageText: "Olá, quero fazer uma entrega",
      sendReply: async (t) => { localReplies.push(t); }
    });

    const state = await getOrCreateConversationState(db, company.id, contactJid);
    expect(state.phase).toBe("collecting");
    expect(state.lastProcessedMessageId).toBe("msg-001");
    expect(localReplies.length).toBe(1);
    expect(localReplies[0]).toContain("endereço de coleta");
  });

  it("collecting → confirming: when LLM returns both required fields, state moves to confirming", async () => {
    const suffix = `${Date.now()}b`;
    const { company, contactJid } = await seedCompanyAndRetailer(suffix);
    const { db } = assertDb();

    setLLMExtractor(makeProgressiveStub([
      { pickupAddress: "Rua A, 100", dropoffAddress: "Rua B, 200" }
    ]));

    const localReplies: string[] = [];
    await processIntakeMessage({
      db,
      companyId: company.id,
      contactJid,
      messageId: "msg-002",
      messageText: "Coleta na Rua A, 100. Entrega na Rua B, 200.",
      sendReply: async (t) => { localReplies.push(t); }
    });

    const state = await getOrCreateConversationState(db, company.id, contactJid);
    expect(state.phase).toBe("confirming");
    const collected = state.collectedFields as Partial<DeliveryFields>;
    expect(collected.pickupAddress).toBe("Rua A, 100");
    expect(collected.dropoffAddress).toBe("Rua B, 200");
    expect(localReplies[0]).toContain("Resumo");
  });

  it("confirming → created: 'sim' reply creates delivery row in DB with status queued", async () => {
    const suffix = `${Date.now()}c`;
    const { company, retailerUser, contactJid } = await seedCompanyAndRetailer(suffix);
    const { db } = assertDb();

    // Set up state directly in confirming with required fields
    await getOrCreateConversationState(db, company.id, contactJid);
    const state = await getOrCreateConversationState(db, company.id, contactJid);

    // Manually put it in confirming state with fields
    const { updateConversationState } = await import("../src/lib/whatsapp/intake");
    await updateConversationState(db, state.id, {
      phase: "confirming",
      collectedFields: { pickupAddress: "Rua C, 300", dropoffAddress: "Rua D, 400" }
    });

    const localReplies: string[] = [];
    await processIntakeMessage({
      db,
      companyId: company.id,
      contactJid,
      messageId: "msg-003",
      messageText: "sim",
      sendReply: async (t) => { localReplies.push(t); }
    });

    const updatedState = await getOrCreateConversationState(db, company.id, contactJid);
    expect(updatedState.phase).toBe("idle");
    expect(localReplies[0]).toContain("Entrega criada");

    // Check delivery was created
    const { eq } = await import("drizzle-orm");
    const deliveryRows = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.pickupAddress, "Rua C, 300"));
    expect(deliveryRows.length).toBeGreaterThan(0);
    expect(["queued", "offered", "created", "waiting"]).toContain(deliveryRows[0].status);
  });

  it("idempotency: same messageId processed twice → only one delivery row", async () => {
    const suffix = `${Date.now()}d`;
    const { company, contactJid } = await seedCompanyAndRetailer(suffix);
    const { db } = assertDb();

    // Set up confirming state
    const state = await getOrCreateConversationState(db, company.id, contactJid);
    const { updateConversationState } = await import("../src/lib/whatsapp/intake");
    await updateConversationState(db, state.id, {
      phase: "confirming",
      collectedFields: { pickupAddress: "Rua E, 500", dropoffAddress: "Rua F, 600" }
    });

    const localReplies: string[] = [];
    const opts = {
      db,
      companyId: company.id,
      contactJid,
      messageId: "msg-dedup",
      messageText: "sim",
      sendReply: async (t: string) => { localReplies.push(t); }
    };

    await processIntakeMessage(opts);
    await processIntakeMessage(opts); // second call with same messageId

    const { eq, and: andOp } = await import("drizzle-orm");
    const deliveryRows = await db
      .select()
      .from(deliveries)
      .where(andOp(eq(deliveries.pickupAddress, "Rua E, 500"), eq(deliveries.companyId, company.id)));

    expect(deliveryRows.length).toBe(1); // only one delivery
    expect(localReplies.length).toBe(1); // reply sent only once
  });

  it("unauthorized JID: unknown contactJid → sendReply called with não autorizado, no state created", async () => {
    const suffix = `${Date.now()}e`;
    const { company } = await seedCompanyAndRetailer(suffix);
    const { db } = assertDb();
    const unknownJid = "99999999999@s.whatsapp.net";

    const localReplies: string[] = [];
    await processIntakeMessage({
      db,
      companyId: company.id,
      contactJid: unknownJid,
      messageId: "msg-unauth",
      messageText: "Olá",
      sendReply: async (t) => { localReplies.push(t); }
    });

    expect(localReplies[0]).toContain("não autorizado");
  });
});
