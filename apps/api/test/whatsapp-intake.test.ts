import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { assertDb, companies, users, bonds, retailers, whatsappContactMappings, conversationStates, conversationTurns, deliveries } from "@repo/db";
import {
  processIntakeMessage,
  setLLMExtractor,
  setConversationInterpreter,
  resetConversationInterpreter,
  getOrCreateConversationState
} from "../src/lib/whatsapp/intake";
import type { LLMExtractor, DeliveryFields } from "../src/lib/whatsapp/intake";
import type { LLMConversationInterpreter } from "../src/lib/whatsapp/conversation-interpreter";

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

  beforeEach(() => {
    resetConversationInterpreter();
  });

  afterAll(() => {
    // Reset LLM extractor singleton
    setLLMExtractor({
      async extract() {
        return { fields: {}, nextMessage: "Por favor, informe o endereço de coleta." };
      }
    });
    setConversationInterpreter({
      async interpret() {
        return {
          flow: "operational",
          intent: "unknown",
          confidence: "low",
          shouldContinueDraft: false,
          shouldStartNewDraft: false,
          shouldAskClarification: true,
          reply: "Por favor, informe o endereço de coleta."
        };
      }
    });
  });

  function makeInterpreterStub(result: Awaited<ReturnType<LLMConversationInterpreter["interpret"]>>): LLMConversationInterpreter {
    return {
      async interpret() {
        return result;
      }
    };
  }

  it("exposes richer conversation memory columns for hybrid agent state", () => {
    const stateColumns = getTableColumns(conversationStates);
    const turnColumns = getTableColumns(conversationTurns);

    expect(stateColumns.userId).toBeDefined();
    expect(stateColumns.retailerId).toBeDefined();
    expect(stateColumns.roleResolution).toBeDefined();
    expect(stateColumns.conversationMode).toBeDefined();
    expect(stateColumns.currentFlow).toBeDefined();
    expect(stateColumns.currentIntent).toBeDefined();
    expect(stateColumns.draftPayload).toBeDefined();
    expect(stateColumns.contextSnapshot).toBeDefined();
    expect(stateColumns.blockedReason).toBeDefined();
    expect(stateColumns.status).toBeDefined();
    expect(stateColumns.startedAt).toBeDefined();
    expect(stateColumns.lastUserMessageAt).toBeDefined();
    expect(stateColumns.lastBotMessageAt).toBeDefined();
    expect(stateColumns.staleAt).toBeDefined();
    expect(stateColumns.closedAt).toBeDefined();

    expect(turnColumns.conversationStateId).toBeDefined();
    expect(turnColumns.companyId).toBeDefined();
    expect(turnColumns.contactJid).toBeDefined();
    expect(turnColumns.role).toBeDefined();
    expect(turnColumns.messageText).toBeDefined();
    expect(turnColumns.normalizedText).toBeDefined();
    expect(turnColumns.detectedIntent).toBeDefined();
    expect(turnColumns.metadata).toBeDefined();
  });

  it("applies the hybrid memory contract to the database schema", async () => {
    const { db } = assertDb();

    const columns = await db.execute(sql`
      select column_name
      from information_schema.columns
      where table_name = 'conversation_states'
        and column_name in (
          'user_id',
          'retailer_id',
          'role_resolution',
          'conversation_mode',
          'current_flow',
          'current_intent',
          'draft_payload',
          'context_snapshot',
          'blocked_reason',
          'status',
          'started_at',
          'last_user_message_at',
          'last_bot_message_at',
          'stale_at',
          'closed_at'
        )
    `);

    const turnTable = await db.execute(sql`select to_regclass('public.conversation_turns') as value`);

    expect(columns.rows).toHaveLength(15);
    expect(turnTable.rows[0]?.value).toBe("conversation_turns");
  });

  it("first operational request without enough structured fields asks for the next required step", async () => {
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
      messageText: "Quero fazer uma entrega",
      sendReply: async (t) => { localReplies.push(t); }
    });

    const state = await getOrCreateConversationState(db, company.id, contactJid);
    expect(["idle", "collecting"]).toContain(state.phase);
    expect(state.lastProcessedMessageId).toBe("msg-001");
    expect(localReplies.length).toBe(1);
    expect(localReplies[0]).toContain("endereço de coleta");
  });

  it("greeting does not become a delivery field and yields a short clarification", async () => {
    const suffix = `${Date.now()}g`;
    const { company, contactJid } = await seedCompanyAndRetailer(suffix);
    const { db } = assertDb();

    setConversationInterpreter(
      makeInterpreterStub({
        flow: "operational",
        intent: "unknown",
        confidence: "medium",
        shouldContinueDraft: false,
        shouldStartNewDraft: false,
        shouldAskClarification: true,
        reply: "Oi! Me envie o endereço de entrega ou descreva rapidamente o pedido."
      })
    );

    const localReplies: string[] = [];
    await processIntakeMessage({
      db,
      companyId: company.id,
      contactJid,
      messageId: "msg-greeting",
      messageText: "Olá",
      sendReply: async (t) => {
        localReplies.push(t);
      }
    });

    const state = await getOrCreateConversationState(db, company.id, contactJid);
    expect(state.phase).toBe("idle");
    expect(state.collectedFields).toEqual({});
    expect(localReplies[0]).toContain("endereço de entrega");
  });

  it("low-confidence text asks clarification instead of mutating delivery fields", async () => {
    const suffix = `${Date.now()}h`;
    const { company, contactJid } = await seedCompanyAndRetailer(suffix);
    const { db } = assertDb();

    setConversationInterpreter(
      makeInterpreterStub({
        flow: "operational",
        intent: "unknown",
        confidence: "low",
        shouldContinueDraft: false,
        shouldStartNewDraft: false,
        shouldAskClarification: true,
        reply: "Esse texto ficou ambíguo. Me diga o endereço de entrega, por favor."
      })
    );

    const localReplies: string[] = [];
    await processIntakeMessage({
      db,
      companyId: company.id,
      contactJid,
      messageId: "msg-clarify",
      messageText: "pode ser aquele de sempre",
      sendReply: async (t) => {
        localReplies.push(t);
      }
    });

    const state = await getOrCreateConversationState(db, company.id, contactJid);
    expect(state.collectedFields).toEqual({});
    expect(localReplies[0]).toContain("ambíguo");
  });

  it("explicit restart intent resets existing draft and responds distinctly", async () => {
    const suffix = `${Date.now()}i`;
    const { company, contactJid } = await seedCompanyAndRetailer(suffix);
    const { db } = assertDb();
    const state = await getOrCreateConversationState(db, company.id, contactJid);

    const { updateConversationState } = await import("../src/lib/whatsapp/intake");
    await updateConversationState(db, state.id, {
      phase: "confirming",
      collectedFields: { pickupAddress: "Rua Antiga", dropoffAddress: "Rua Antiga 2" }
    });

    setConversationInterpreter(
      makeInterpreterStub({
        flow: "operational",
        intent: "restart_draft",
        confidence: "high",
        shouldContinueDraft: false,
        shouldStartNewDraft: true,
        shouldAskClarification: false,
        reply: "Perfeito. Vamos começar um novo pedido."
      })
    );

    const localReplies: string[] = [];
    await processIntakeMessage({
      db,
      companyId: company.id,
      contactJid,
      messageId: "msg-restart",
      messageText: "quero fazer outro pedido",
      sendReply: async (t) => {
        localReplies.push(t);
      }
    });

    const updated = await getOrCreateConversationState(db, company.id, contactJid);
    expect(updated.phase).toBe("collecting");
    expect(updated.collectedFields).toEqual({});
    expect(localReplies[0]).toContain("novo pedido");
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

  it("blocked retailer gets a blocker response before delivery creation is attempted", async () => {
    const suffix = `${Date.now()}z`;
    const { db } = assertDb();

    const [companyUser] = await db
      .insert(users)
      .values({ id: `company-user-blocked-${suffix}`, name: "Co Blocked", email: `co.blocked.${suffix}@test.com`, emailVerified: true, role: "company" })
      .returning();

    const [company] = await db
      .insert(companies)
      .values({ userId: companyUser.id, name: `Co Blocked ${suffix}`, slug: `co-blocked-${suffix}` })
      .returning();

    const [retailerUser] = await db
      .insert(users)
      .values({ id: `retailer-user-blocked-${suffix}`, name: "Ret Blocked", email: `ret.blocked.${suffix}@test.com`, emailVerified: true, role: "retailer" })
      .returning();

    const [retailer] = await db
      .insert(retailers)
      .values({ userId: retailerUser.id, name: `Ret Blocked ${suffix}`, slug: `ret-blocked-${suffix}` })
      .returning();

    await db.insert(bonds).values({
      companyId: company.id,
      entityId: retailer.id,
      entityType: "retailer",
      status: "pending"
    });

    const contactJid = `55114444${suffix.slice(0, 6)}@s.whatsapp.net`;
    await db.insert(whatsappContactMappings).values({
      companyId: company.id,
      contactJid,
      userId: retailerUser.id
    });

    const localReplies: string[] = [];
    await processIntakeMessage({
      db,
      companyId: company.id,
      contactJid,
      messageId: "msg-blocked",
      messageText: "quero criar uma entrega",
      sendReply: async (t) => {
        localReplies.push(t);
      }
    });

    const createdRows = await db.select().from(deliveries).where(eq(deliveries.companyId, company.id));
    expect(createdRows).toHaveLength(0);
    expect(localReplies[0]).toContain("não está habilitada");
  });
});
