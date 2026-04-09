import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { assertDb, companies, conversationStates, conversationTurns, retailers, users } from "@repo/db";
import {
  appendConversationTurn,
  computeAcquisitionStaleAt,
  computeOperationalStaleAt,
  getOrCreateConversationState,
  isConversationStale,
  listRecentConversationTurns,
  MAX_RECENT_TURNS,
  resetConversationDraft,
  updateConversationState
} from "../src/lib/whatsapp/conversation-memory";
import { resolveWhatsAppContact } from "../src/lib/whatsapp/contact-resolver";
import { bonds, drivers, whatsappContactMappings } from "@repo/db";
import { decideRetailerConversationAction } from "../src/lib/whatsapp/conversation-engine";
import { buildUnknownContactAcquisitionResponse } from "../src/lib/whatsapp/acquisition";

async function seedConversationContext(suffix: string) {
  const { db } = assertDb();

  const [companyUser] = await db
    .insert(users)
    .values({ id: `memory-company-${suffix}`, name: "Memory Co", email: `memory.co.${suffix}@test.com`, emailVerified: true, role: "company" })
    .returning();

  const [company] = await db
    .insert(companies)
    .values({ userId: companyUser.id, name: `Memory Co ${suffix}`, slug: `memory-co-${suffix}` })
    .returning();

  const [retailerUser] = await db
    .insert(users)
    .values({ id: `memory-retailer-${suffix}`, name: "Memory Retailer", email: `memory.ret.${suffix}@test.com`, emailVerified: true, role: "retailer" })
    .returning();

  const [retailer] = await db
    .insert(retailers)
    .values({ userId: retailerUser.id, name: `Memory Retailer ${suffix}`, slug: `memory-ret-${suffix}` })
    .returning();

  return {
    db,
    company,
    retailer,
    retailerUser,
    contactJid: `55119988${suffix.slice(0, 6)}@s.whatsapp.net`
  };
}

describe.skipIf(!process.env.DATABASE_URL)("whatsapp conversation memory", () => {
  it("creates a default conversation state once and reuses it on subsequent calls", async () => {
    const suffix = `${Date.now()}a`;
    const { db, company, contactJid } = await seedConversationContext(suffix);

    const first = await getOrCreateConversationState(db, company.id, contactJid);
    const second = await getOrCreateConversationState(db, company.id, contactJid);

    expect(second.id).toBe(first.id);
    expect(first.conversationMode).toBe("idle");
    expect(first.currentFlow).toBe("operational");
    expect(first.status).toBe("active");
  });

  it("updates structured draft and context snapshot fields", async () => {
    const suffix = `${Date.now()}b`;
    const { db, company, retailer, retailerUser, contactJid } = await seedConversationContext(suffix);
    const state = await getOrCreateConversationState(db, company.id, contactJid);

    await updateConversationState(db, state.id, {
      userId: retailerUser.id,
      retailerId: retailer.id,
      conversationMode: "drafting_delivery",
      currentIntent: "new_delivery",
      draftPayload: { pickupAddress: "Rua A, 10", dropoffAddress: "Rua B, 20" },
      contextSnapshot: { defaultPickupAddress: "Rua A, 10" }
    });

    const [updated] = await db.select().from(conversationStates).where(eq(conversationStates.id, state.id)).limit(1);
    expect(updated.userId).toBe(retailerUser.id);
    expect(updated.retailerId).toBe(retailer.id);
    expect(updated.conversationMode).toBe("drafting_delivery");
    expect(updated.currentIntent).toBe("new_delivery");
    expect(updated.draftPayload).toMatchObject({ pickupAddress: "Rua A, 10", dropoffAddress: "Rua B, 20" });
    expect(updated.contextSnapshot).toMatchObject({ defaultPickupAddress: "Rua A, 10" });
  });

  it("appends turns and returns a bounded recent window in chronological order", async () => {
    const suffix = `${Date.now()}c`;
    const { db, company, contactJid } = await seedConversationContext(suffix);
    const state = await getOrCreateConversationState(db, company.id, contactJid);

    await appendConversationTurn(db, {
      conversationStateId: state.id,
      companyId: company.id,
      contactJid,
      role: "user",
      messageText: "Oi"
    });
    await appendConversationTurn(db, {
      conversationStateId: state.id,
      companyId: company.id,
      contactJid,
      role: "assistant",
      messageText: "Como posso ajudar?"
    });
    await appendConversationTurn(db, {
      conversationStateId: state.id,
      companyId: company.id,
      contactJid,
      role: "user",
      messageText: "Quero enviar um pedido"
    });

    const turns = await listRecentConversationTurns(db, state.id, 2);
    expect(turns).toHaveLength(2);
    expect(turns[0].messageText).toBe("Como posso ajudar?");
    expect(turns[1].messageText).toBe("Quero enviar um pedido");
  });

  it("supports stale, completed, and cancelled status transitions without deleting the state", async () => {
    const suffix = `${Date.now()}d`;
    const { db, company, contactJid } = await seedConversationContext(suffix);
    const state = await getOrCreateConversationState(db, company.id, contactJid);

    await updateConversationState(db, state.id, {
      status: "stale",
      staleAt: new Date("2026-04-08T12:00:00.000Z")
    });
    await updateConversationState(db, state.id, {
      status: "completed",
      closedAt: new Date("2026-04-08T12:10:00.000Z")
    });

    const [completed] = await db.select().from(conversationStates).where(eq(conversationStates.id, state.id)).limit(1);
    expect(completed.status).toBe("completed");
    expect(completed.staleAt).toBeTruthy();
    expect(completed.closedAt).toBeTruthy();

    await updateConversationState(db, state.id, {
      status: "cancelled"
    });

    const [cancelled] = await db.select().from(conversationStates).where(eq(conversationStates.id, state.id)).limit(1);
    expect(cancelled.status).toBe("cancelled");
  });

  it("clears draft payload safely without removing the conversation row", async () => {
    const suffix = `${Date.now()}e`;
    const { db, company, contactJid } = await seedConversationContext(suffix);
    const state = await getOrCreateConversationState(db, company.id, contactJid);

    await updateConversationState(db, state.id, {
      conversationMode: "confirming_delivery",
      currentIntent: "confirm_draft",
      draftPayload: { pickupAddress: "Rua A", dropoffAddress: "Rua B" }
    });

    await resetConversationDraft(db, state.id);

    const [updated] = await db
      .select()
      .from(conversationStates)
      .where(and(eq(conversationStates.id, state.id), eq(conversationStates.companyId, company.id)))
      .limit(1);

    expect(updated.id).toBe(state.id);
    expect(updated.conversationMode).toBe("idle");
    expect(updated.currentIntent).toBeNull();
    expect(updated.draftPayload).toEqual({});
  });

  it("persists turn metadata for future structured interpretation", async () => {
    const suffix = `${Date.now()}f`;
    const { db, company, contactJid } = await seedConversationContext(suffix);
    const state = await getOrCreateConversationState(db, company.id, contactJid);

    await appendConversationTurn(db, {
      conversationStateId: state.id,
      companyId: company.id,
      contactJid,
      role: "assistant",
      messageText: "Quer continuar o pedido anterior ou abrir outro?",
      detectedIntent: "continue_draft",
      metadata: { sourceEvent: "stale_resume_prompt", confidence: "medium" }
    });

    const [turn] = await db.select().from(conversationTurns).where(eq(conversationTurns.conversationStateId, state.id)).limit(1);
    expect(turn.detectedIntent).toBe("continue_draft");
    expect(turn.metadata).toMatchObject({ sourceEvent: "stale_resume_prompt", confidence: "medium" });
  });

  it("marks stale by timestamp and distinguishes operational vs acquisition stale windows", () => {
    const now = new Date("2026-04-08T12:00:00.000Z");
    expect(computeOperationalStaleAt(now).toISOString()).toBe("2026-04-08T12:30:00.000Z");
    expect(computeAcquisitionStaleAt(now).toISOString()).toBe("2026-04-09T12:00:00.000Z");
    expect(isConversationStale({ staleAt: new Date("2026-04-08T11:59:59.000Z") }, now)).toBe(true);
    expect(isConversationStale({ staleAt: new Date("2026-04-08T12:30:00.000Z") }, now)).toBe(false);
  });

  it("keeps only a bounded transcript window after many appended turns", async () => {
    const suffix = `${Date.now()}bounded`;
    const { db, company, contactJid } = await seedConversationContext(suffix);
    const state = await getOrCreateConversationState(db, company.id, contactJid);

    for (let i = 0; i < MAX_RECENT_TURNS + 5; i += 1) {
      await appendConversationTurn(db, {
        conversationStateId: state.id,
        companyId: company.id,
        contactJid,
        role: "user",
        messageText: `turn-${i}`
      });
    }

    const turns = await listRecentConversationTurns(db, state.id, MAX_RECENT_TURNS + 10);
    expect(turns).toHaveLength(MAX_RECENT_TURNS);
    expect(turns[0].messageText).toBe("turn-5");
    expect(turns.at(-1)?.messageText).toBe(`turn-${MAX_RECENT_TURNS + 4}`);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("whatsapp contact resolver", () => {
  it("classifies a known retailer with active bond as operational", async () => {
    const suffix = `${Date.now()}g`;
    const { db, company, retailer, retailerUser, contactJid } = await seedConversationContext(suffix);

    await db.insert(whatsappContactMappings).values({ companyId: company.id, contactJid, userId: retailerUser.id, role: "retailer" });
    await db.insert(bonds).values({ companyId: company.id, entityId: retailer.id, entityType: "retailer", status: "active" });

    const result = await resolveWhatsAppContact(db, company.id, contactJid);
    expect(result.category).toBe("known_retailer_operational");
    expect(result.role).toBe("retailer");
    if (result.category !== "known_retailer_operational") throw new Error("unexpected category");
    expect(result.retailerId).toBe(retailer.id);
  });

  it("classifies a known retailer without active bond as blocked", async () => {
    const suffix = `${Date.now()}h`;
    const { db, company, retailer, retailerUser, contactJid } = await seedConversationContext(suffix);

    await db.insert(whatsappContactMappings).values({ companyId: company.id, contactJid, userId: retailerUser.id, role: "retailer" });
    await db.insert(bonds).values({ companyId: company.id, entityId: retailer.id, entityType: "retailer", status: "pending" });

    const result = await resolveWhatsAppContact(db, company.id, contactJid);
    expect(result.category).toBe("known_retailer_blocked");
    expect(result.blockedReason).toMatchObject({ code: "bond_inactive_or_missing" });
  });

  it("classifies a known driver correctly", async () => {
    const suffix = `${Date.now()}i`;
    const { db } = assertDb();
    const [companyUser] = await db
      .insert(users)
      .values({ id: `resolver-company-${suffix}`, name: "Resolver Co", email: `resolver.co.${suffix}@test.com`, emailVerified: true, role: "company" })
      .returning();
    const [company] = await db
      .insert(companies)
      .values({ userId: companyUser.id, name: `Resolver Co ${suffix}`, slug: `resolver-co-${suffix}` })
      .returning();
    const [driverUser] = await db
      .insert(users)
      .values({ id: `resolver-driver-${suffix}`, name: "Resolver Driver", email: `resolver.driver.${suffix}@test.com`, emailVerified: true, role: "driver" })
      .returning();
    const [driver] = await db
      .insert(drivers)
      .values({ userId: driverUser.id, name: `Resolver Driver ${suffix}`, phone: `+5511${suffix.slice(0, 9).padEnd(9, "0")}` })
      .returning();

    const contactJid = `55118877${suffix.slice(0, 6)}@s.whatsapp.net`;
    await db.insert(whatsappContactMappings).values({ companyId: company.id, contactJid, userId: driverUser.id, role: "driver" });

    const result = await resolveWhatsAppContact(db, company.id, contactJid);
    expect(result.category).toBe("known_driver");
    expect(result.role).toBe("driver");
    if (result.category !== "known_driver") throw new Error("unexpected category");
    expect(result.driverId).toBe(driver.id);
  });

  it("classifies an unmapped JID as unknown contact", async () => {
    const suffix = `${Date.now()}j`;
    const { db, company } = await seedConversationContext(suffix);

    const result = await resolveWhatsAppContact(db, company.id, `55117766${suffix.slice(0, 6)}@s.whatsapp.net`);
    expect(result.category).toBe("unknown_contact");
    expect(result.role).toBe("unknown");
  });
});

describe("retailer conversation engine", () => {
  it("continues an existing draft by merging slot updates and staying in collecting when incomplete", () => {
    const decision = decideRetailerConversationAction({
      phase: "collecting",
      status: "active",
      existingFields: { pickupAddress: "Rua A, 10" },
      interpretation: {
        flow: "operational",
        intent: "update_draft",
        confidence: "medium",
        shouldContinueDraft: true,
        shouldStartNewDraft: false,
        shouldAskClarification: false,
        slotUpdates: { externalReference: "pedido 123" },
        reply: "Agora me envie o endereço de entrega."
      },
      messageText: "pedido 123"
    });

    expect(decision.kind).toBe("collect_more");
    if (decision.kind !== "collect_more") throw new Error("unexpected decision");
    expect(decision.phase).toBe("collecting");
    expect(decision.fields).toMatchObject({ pickupAddress: "Rua A, 10", externalReference: "pedido 123" });
  });

  it("restarts a stale draft when explicit restart intent is present", () => {
    const decision = decideRetailerConversationAction({
      phase: "collecting",
      status: "stale",
      existingFields: { pickupAddress: "Rua antiga", dropoffAddress: "Rua velha" },
      interpretation: {
        flow: "operational",
        intent: "restart_draft",
        confidence: "high",
        shouldContinueDraft: false,
        shouldStartNewDraft: true,
        shouldAskClarification: false,
        reply: "Perfeito. Vamos começar um novo pedido."
      },
      messageText: "novo pedido"
    });

    expect(decision.kind).toBe("restart_draft");
    if (decision.kind !== "restart_draft") throw new Error("unexpected decision");
    expect(decision.phase).toBe("collecting");
    expect(decision.fields).toEqual({});
  });

  it("confirms a validated draft on explicit affirmative answer", () => {
    const decision = decideRetailerConversationAction({
      phase: "confirming",
      status: "active",
      existingFields: { pickupAddress: "Rua C", dropoffAddress: "Rua D" },
      interpretation: {
        flow: "operational",
        intent: "confirm_draft",
        confidence: "high",
        shouldContinueDraft: true,
        shouldStartNewDraft: false,
        shouldAskClarification: false,
        reply: ""
      },
      messageText: "sim"
    });

    expect(decision.kind).toBe("confirm_draft");
  });

  it("cancels a draft on explicit negative answer", () => {
    const decision = decideRetailerConversationAction({
      phase: "confirming",
      status: "active",
      existingFields: { pickupAddress: "Rua C", dropoffAddress: "Rua D" },
      interpretation: {
        flow: "operational",
        intent: "cancel_draft",
        confidence: "high",
        shouldContinueDraft: true,
        shouldStartNewDraft: false,
        shouldAskClarification: false,
        reply: "Pedido cancelado."
      },
      messageText: "não"
    });

    expect(decision.kind).toBe("cancel_draft");
  });

  it("returns a blocker decision before any delivery creation when retailer is blocked", () => {
    const decision = decideRetailerConversationAction({
      phase: "collecting",
      status: "blocked",
      existingFields: {},
      interpretation: {
        flow: "operational",
        intent: "new_delivery",
        confidence: "high",
        shouldContinueDraft: false,
        shouldStartNewDraft: true,
        shouldAskClarification: false,
        slotUpdates: { dropoffAddress: "Rua X" },
        reply: ""
      },
      messageText: "quero criar uma entrega",
      blockedReason: { code: "bond_inactive_or_missing", bondStatus: "pending" }
    });

    expect(decision.kind).toBe("blocked");
    if (decision.kind !== "blocked") throw new Error("unexpected decision");
    expect(decision.reply).toContain("não está habilitada");
  });

  it("asks whether to continue or restart when a stale draft receives an ambiguous message", () => {
    const decision = decideRetailerConversationAction({
      phase: "collecting",
      status: "stale",
      existingFields: { pickupAddress: "Rua antiga" },
      interpretation: {
        flow: "operational",
        intent: "unknown",
        confidence: "low",
        shouldContinueDraft: false,
        shouldStartNewDraft: false,
        shouldAskClarification: true,
        reply: "Me diga o próximo passo"
      },
      messageText: "oi"
    });

    expect(decision.kind).toBe("stale_prompt");
    if (decision.kind !== "stale_prompt") throw new Error("unexpected decision");
    expect(decision.reply).toContain("continuar o pedido anterior");
  });
});

describe("unknown contact acquisition", () => {
  it("returns a CTA-oriented response for delivery-intent unknown contacts", () => {
    const response = buildUnknownContactAcquisitionResponse("quero pedir uma entrega");
    expect(response.flow).toBe("acquisition");
    expect(response.reply).toContain("plataforma");
  });

  it("returns a generic product introduction for vague unknown contacts", () => {
    const response = buildUnknownContactAcquisitionResponse("olá");
    expect(response.flow).toBe("acquisition");
    expect(response.reply).toContain("clientes cadastrados");
  });
});
