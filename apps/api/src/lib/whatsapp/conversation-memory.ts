import { and, desc, eq, sql } from "drizzle-orm";
import { assertDb, conversationStates, conversationTurns } from "@repo/db";
import type { DraftPayload, ConversationStatePatch, ConversationTurnInput } from "./conversation-types";

type DrizzleDb = ReturnType<typeof assertDb>["db"];

export const OPERATIONAL_STALE_MINUTES = 30;
export const ACQUISITION_STALE_HOURS = 24;
export const MAX_RECENT_TURNS = 20;

export async function getOrCreateConversationState(db: DrizzleDb, companyId: string, contactJid: string) {
  const [existing] = await db
    .select()
    .from(conversationStates)
    .where(and(eq(conversationStates.companyId, companyId), eq(conversationStates.contactJid, contactJid)))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(conversationStates)
    .values({
      companyId,
      contactJid,
      phase: "idle",
      conversationMode: "idle",
      currentFlow: "operational",
      status: "active",
      draftPayload: {},
      contextSnapshot: {}
    })
    .returning();

  return created;
}

export async function updateConversationState(db: DrizzleDb, id: string, patch: ConversationStatePatch): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.userId !== undefined) updates.userId = patch.userId;
  if (patch.retailerId !== undefined) updates.retailerId = patch.retailerId;
  if (patch.roleResolution !== undefined) updates.roleResolution = patch.roleResolution;
  if (patch.conversationMode !== undefined) updates.conversationMode = patch.conversationMode;
  if (patch.currentFlow !== undefined) updates.currentFlow = patch.currentFlow;
  if (patch.currentIntent !== undefined) updates.currentIntent = patch.currentIntent;
  if (patch.phase !== undefined) updates.phase = patch.phase;
  if (patch.collectedFields !== undefined) updates.collectedFields = patch.collectedFields;
  if (patch.draftPayload !== undefined) updates.draftPayload = patch.draftPayload;
  if (patch.contextSnapshot !== undefined) updates.contextSnapshot = patch.contextSnapshot;
  if (patch.blockedReason !== undefined) updates.blockedReason = patch.blockedReason;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.lastProcessedMessageId !== undefined) updates.lastProcessedMessageId = patch.lastProcessedMessageId;
  if (patch.startedAt !== undefined) updates.startedAt = patch.startedAt;
  if (patch.lastUserMessageAt !== undefined) updates.lastUserMessageAt = patch.lastUserMessageAt;
  if (patch.lastBotMessageAt !== undefined) updates.lastBotMessageAt = patch.lastBotMessageAt;
  if (patch.staleAt !== undefined) updates.staleAt = patch.staleAt;
  if (patch.closedAt !== undefined) updates.closedAt = patch.closedAt;

  await db.update(conversationStates).set(updates).where(eq(conversationStates.id, id));
}

export async function appendConversationTurn(db: DrizzleDb, input: ConversationTurnInput) {
  const [created] = await db
    .insert(conversationTurns)
    .values({
      conversationStateId: input.conversationStateId,
      companyId: input.companyId,
      contactJid: input.contactJid,
      role: input.role,
      messageText: input.messageText,
      normalizedText: input.normalizedText ?? null,
      detectedIntent: input.detectedIntent ?? null,
      metadata: input.metadata ?? {}
    })
    .returning();

  await db.execute(sql`
    delete from ${conversationTurns}
    where ${conversationTurns.conversationStateId} = ${input.conversationStateId}
      and ${conversationTurns.id} not in (
        select id from ${conversationTurns}
        where ${conversationTurns.conversationStateId} = ${input.conversationStateId}
        order by ${conversationTurns.createdAt} desc
        limit ${MAX_RECENT_TURNS}
      )
  `);

  return created;
}

export async function listRecentConversationTurns(db: DrizzleDb, conversationStateId: string, limit = 10) {
  const rows = await db
    .select()
    .from(conversationTurns)
    .where(eq(conversationTurns.conversationStateId, conversationStateId))
    .orderBy(desc(conversationTurns.createdAt))
    .limit(limit);

  return rows.reverse();
}

export async function resetConversationDraft(db: DrizzleDb, id: string, options?: { status?: ConversationStatePatch["status"] }) {
  await updateConversationState(db, id, {
    conversationMode: "idle",
    currentIntent: null,
    draftPayload: {} satisfies DraftPayload,
    blockedReason: null,
    status: options?.status,
    staleAt: null,
    closedAt: options?.status === "completed" || options?.status === "cancelled" ? new Date() : null
  });
}

export function computeOperationalStaleAt(from = new Date()): Date {
  return new Date(from.getTime() + OPERATIONAL_STALE_MINUTES * 60_000);
}

export function computeAcquisitionStaleAt(from = new Date()): Date {
  return new Date(from.getTime() + ACQUISITION_STALE_HOURS * 60 * 60_000);
}

export function isConversationStale(input: { status?: string | null; staleAt?: Date | string | null }, now = new Date()): boolean {
  if (input.status === "stale") return true;
  if (!input.staleAt) return false;
  const staleAt = input.staleAt instanceof Date ? input.staleAt : new Date(input.staleAt);
  return staleAt.getTime() <= now.getTime();
}

export async function markConversationStaleIfNeeded(db: DrizzleDb, id: string) {
  const [state] = await db.select().from(conversationStates).where(eq(conversationStates.id, id)).limit(1);
  if (!state) return null;
  if (!isConversationStale({ status: state.status, staleAt: state.staleAt })) return state;

  await updateConversationState(db, id, { status: "stale", staleAt: state.staleAt ?? new Date() });
  const [updated] = await db.select().from(conversationStates).where(eq(conversationStates.id, id)).limit(1);
  return updated;
}
