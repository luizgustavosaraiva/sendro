import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  assertDb,
  bonds,
  deliveryEvents,
  deliveries,
  dispatchAttempts,
  dispatchQueueEntries,
  drivers,
  driverStrikes
} from "@repo/db";
import type {
  DeliveryDispatchAttempt,
  DeliveryDispatchState,
  DeliveryDetail,
  DeliveryListItem,
  DeliveryStatus,
  DeliveryTimelineEvent,
  DispatchCandidateSnapshot,
  DispatchPhase,
  DispatchRankingComponent,
  DispatchRankingSignal,
  DispatchWaitingReason,
  DriverStrike,
  EntityRole,
  ReprocessDispatchTimeoutsInput,
  ReprocessDispatchTimeoutsResult,
  ResolveDriverOfferInput,
  ResolveDriverOfferResult
} from "@repo/shared";
import {
  assertRetailerHasActiveBond,
  requireRole,
  resolveAuthenticatedCompanyProfile,
  resolveAuthenticatedDriverProfile,
  resolveAuthenticatedRetailerProfile
} from "./bonds";

type SessionUser = {
  id: string;
  role: EntityRole;
};

type DeliveryRecord = typeof deliveries.$inferSelect;
type DeliveryEventRecord = typeof deliveryEvents.$inferSelect;
type DispatchQueueEntryRecord = typeof dispatchQueueEntries.$inferSelect;
type DispatchAttemptRecord = typeof dispatchAttempts.$inferSelect;
type DriverStrikeRecord = typeof driverStrikes.$inferSelect;
type DriverRecord = typeof drivers.$inferSelect;
type BondRecord = typeof bonds.$inferSelect;

type DeliveryEventMetadata = Record<string, unknown>;
type DbHandle = ReturnType<typeof assertDb>["db"];
type TransactionCallback = Parameters<DbHandle["transaction"]>[0];
type DbTransaction = TransactionCallback extends (tx: infer T, ...args: never[]) => Promise<unknown> ? T : never;

type DeliveryActor = {
  actorType: "system" | "company" | "retailer" | "driver";
  actorId: string | null;
  actorLabel: string | null;
};

type CandidateSeed = {
  driver: DriverRecord;
  bond: BondRecord;
  queueScore: number;
  distanceScore: number;
  regionScore: string;
  priceScore: number;
};

type DispatchInitializationResult = {
  queueEntry: DispatchQueueEntryRecord;
  attempts: DispatchAttemptRecord[];
};

const DEFAULT_DISPATCH_TIMEOUT_SECONDS = 120;
const MAX_PRIVATE_ATTEMPTS = 2;
const DISPATCH_RANKING_VERSION = "dispatch-v1";
const DISPATCH_ASSUMPTIONS = [
  "queue uses active bond creation order until richer driver capacity signals arrive in S02/S03",
  "distance is approximated by stable lexical proxy because geo coordinates are not available yet",
  "region is approximated by shared pickup/dropoff text tokens until explicit region modeling lands",
  "price uses a neutral placeholder score until company pricing rules exist in later milestones"
] as const;

const DRIVER_REJECTION_REASON = "driver_rejected_offer";
const DRIVER_TIMEOUT_REASON = "driver_offer_timeout";
const OFFER_ALREADY_RESOLVED_PREFIX = "driver_offer_already_resolved";

const toIso = (value: Date | string) => new Date(value).toISOString();

const asMetadata = (value: unknown): DeliveryEventMetadata => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as DeliveryEventMetadata;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

const asCandidateSnapshotArray = (value: unknown): DispatchCandidateSnapshot[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is DispatchCandidateSnapshot => Boolean(item && typeof item === "object"));
};

const asCandidateSnapshot = (value: unknown): DispatchCandidateSnapshot | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as DispatchCandidateSnapshot;
};

const deliveryError = (code: TRPCError["code"], message: string) => new TRPCError({ code, message });

const allowedTransitions: Record<DeliveryStatus, Array<"assigned" | "picked_up" | "in_transit">> = {
  created: ["assigned"],
  queued: ["assigned"],
  offered: ["assigned"],
  assigned: ["picked_up"],
  accepted: ["picked_up"],
  picked_up: ["in_transit"],
  in_transit: [],
  delivered: [],
  cancelled: [],
  failed_attempt: []
};

const mapTimelineEvent = (event: DeliveryEventRecord): DeliveryTimelineEvent => ({
  eventId: event.id,
  deliveryId: event.deliveryId,
  status: event.status,
  actorType: event.actorType,
  actorId: event.actorId,
  actorLabel: event.actorLabel,
  sequence: event.sequence,
  metadata: asMetadata(event.metadata),
  createdAt: toIso(event.createdAt)
});

const mapDriverStrike = (strike: DriverStrikeRecord): DriverStrike => ({
  strikeId: strike.id,
  companyId: strike.companyId,
  driverId: strike.driverId,
  bondId: strike.bondId,
  deliveryId: strike.deliveryId,
  dispatchAttemptId: strike.dispatchAttemptId,
  attemptNumber: strike.attemptNumber,
  reason: strike.reason,
  consequence: strike.consequence,
  metadata: asMetadata(strike.metadata),
  createdAt: toIso(strike.createdAt)
});

const mapDispatchAttempt = (attempt: DispatchAttemptRecord): DeliveryDispatchAttempt => ({
  attemptId: attempt.id,
  deliveryId: attempt.deliveryId,
  companyId: attempt.companyId,
  attemptNumber: attempt.attemptNumber,
  driverId: attempt.driverId,
  offerStatus: attempt.offerStatus,
  expiresAt: toIso(attempt.expiresAt),
  resolvedAt: attempt.resolvedAt ? toIso(attempt.resolvedAt) : null,
  resolvedByActorType: attempt.resolvedByActorType,
  resolvedByActorId: attempt.resolvedByActorId,
  resolutionReason: attempt.resolutionReason,
  candidateSnapshot: asCandidateSnapshot(attempt.candidateSnapshot),
  createdAt: toIso(attempt.createdAt),
  updatedAt: toIso(attempt.updatedAt)
});

const mapDispatchState = (
  queueEntry: DispatchQueueEntryRecord,
  attempts: DispatchAttemptRecord[],
  strikes: DriverStrikeRecord[]
): DeliveryDispatchState => ({
  queueEntryId: queueEntry.id,
  deliveryId: queueEntry.deliveryId,
  companyId: queueEntry.companyId,
  phase: queueEntry.phase,
  timeoutSeconds: queueEntry.timeoutSeconds,
  activeAttemptNumber: queueEntry.activeAttemptNumber,
  activeAttemptId: queueEntry.activeAttemptId,
  offeredDriverId: queueEntry.offeredDriverId,
  offeredDriverName: queueEntry.offeredDriverName,
  offeredAt: queueEntry.offeredAt ? toIso(queueEntry.offeredAt) : null,
  deadlineAt: queueEntry.deadlineAt ? toIso(queueEntry.deadlineAt) : null,
  waitingReason: queueEntry.waitingReason,
  waitingSince: queueEntry.waitingSince ? toIso(queueEntry.waitingSince) : null,
  rankingVersion: queueEntry.rankingVersion,
  assumptions: asStringArray(queueEntry.assumptions),
  latestSnapshot: asCandidateSnapshotArray(queueEntry.latestSnapshot),
  attempts: attempts.map(mapDispatchAttempt),
  strikes: strikes.map(mapDriverStrike),
  createdAt: toIso(queueEntry.createdAt),
  updatedAt: toIso(queueEntry.updatedAt)
});

const buildDeliveryView = (
  delivery: DeliveryRecord,
  timeline: DeliveryTimelineEvent[],
  dispatch: DeliveryDispatchState | null
): DeliveryListItem => ({
  deliveryId: delivery.id,
  companyId: delivery.companyId,
  retailerId: delivery.retailerId,
  driverId: delivery.driverId,
  externalReference: delivery.externalReference,
  status: delivery.status,
  pickupAddress: delivery.pickupAddress,
  dropoffAddress: delivery.dropoffAddress,
  metadata: asMetadata(delivery.metadata),
  createdAt: toIso(delivery.createdAt),
  updatedAt: toIso(delivery.updatedAt),
  timeline,
  dispatch
});

const createTimelineEvent = async (
  tx: DbTransaction,
  input: {
    deliveryId: string;
    status: DeliveryStatus;
    actor: DeliveryActor;
    metadata?: DeliveryEventMetadata;
  }
) => {
  const [{ nextSequence }] = await tx
    .select({
      nextSequence: sql<number>`coalesce(max(${deliveryEvents.sequence}), 0) + 1`
    })
    .from(deliveryEvents)
    .where(eq(deliveryEvents.deliveryId, input.deliveryId));

  const [event] = await tx
    .insert(deliveryEvents)
    .values({
      deliveryId: input.deliveryId,
      status: input.status,
      actorType: input.actor.actorType,
      actorId: input.actor.actorId,
      actorLabel: input.actor.actorLabel,
      sequence: nextSequence,
      metadata: input.metadata ?? {}
    })
    .returning();

  return event;
};

const getScopedDelivery = async (input: { deliveryId: string; user: SessionUser }): Promise<DeliveryRecord> => {
  const { db } = assertDb();
  const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, input.deliveryId)).limit(1);

  if (!delivery) {
    throw deliveryError("NOT_FOUND", "delivery_not_found");
  }

  if (input.user.role === "company") {
    const company = await resolveAuthenticatedCompanyProfile(input.user);
    if (delivery.companyId !== company.id) {
      throw deliveryError("FORBIDDEN", "delivery_company_forbidden");
    }
    return delivery;
  }

  if (input.user.role === "retailer") {
    const retailer = await resolveAuthenticatedRetailerProfile(input.user);
    if (delivery.retailerId !== retailer.id) {
      throw deliveryError("FORBIDDEN", "delivery_retailer_forbidden");
    }
    return delivery;
  }

  if (input.user.role === "driver") {
    const driver = await resolveAuthenticatedDriverProfile(input.user);
    const [queueEntry] = await db
      .select()
      .from(dispatchQueueEntries)
      .where(eq(dispatchQueueEntries.deliveryId, delivery.id))
      .limit(1);

    if (!queueEntry || queueEntry.offeredDriverId !== driver.id) {
      throw deliveryError("FORBIDDEN", "delivery_driver_forbidden");
    }

    return delivery;
  }

  throw deliveryError("FORBIDDEN", "delivery_role_forbidden:company_or_retailer_or_driver_required");
};

const loadTimelineByDeliveryIds = async (deliveryIds: string[]) => {
  const { db } = assertDb();
  if (deliveryIds.length === 0) {
    return new Map<string, DeliveryTimelineEvent[]>();
  }

  const rows = await db
    .select()
    .from(deliveryEvents)
    .where(inArray(deliveryEvents.deliveryId, deliveryIds))
    .orderBy(asc(deliveryEvents.deliveryId), asc(deliveryEvents.sequence), asc(deliveryEvents.createdAt));

  const grouped = new Map<string, DeliveryTimelineEvent[]>();
  for (const row of rows) {
    const list = grouped.get(row.deliveryId) ?? [];
    list.push(mapTimelineEvent(row));
    grouped.set(row.deliveryId, list);
  }

  return grouped;
};

const loadDispatchStateByDeliveryIds = async (deliveryIds: string[]) => {
  const { db } = assertDb();
  const state = new Map<string, DeliveryDispatchState>();

  if (deliveryIds.length === 0) {
    return state;
  }

  const queueRows = await db
    .select()
    .from(dispatchQueueEntries)
    .where(inArray(dispatchQueueEntries.deliveryId, deliveryIds))
    .orderBy(asc(dispatchQueueEntries.createdAt));

  if (queueRows.length === 0) {
    return state;
  }

  const attempts = await db
    .select()
    .from(dispatchAttempts)
    .where(inArray(dispatchAttempts.deliveryId, deliveryIds))
    .orderBy(asc(dispatchAttempts.deliveryId), asc(dispatchAttempts.attemptNumber), asc(dispatchAttempts.createdAt));

  const strikes = await db
    .select()
    .from(driverStrikes)
    .where(inArray(driverStrikes.deliveryId, deliveryIds))
    .orderBy(asc(driverStrikes.deliveryId), asc(driverStrikes.createdAt));

  const attemptsByDeliveryId = new Map<string, DispatchAttemptRecord[]>();
  for (const attempt of attempts) {
    const list = attemptsByDeliveryId.get(attempt.deliveryId) ?? [];
    list.push(attempt);
    attemptsByDeliveryId.set(attempt.deliveryId, list);
  }

  const strikesByDeliveryId = new Map<string, DriverStrikeRecord[]>();
  for (const strike of strikes) {
    const list = strikesByDeliveryId.get(strike.deliveryId) ?? [];
    list.push(strike);
    strikesByDeliveryId.set(strike.deliveryId, list);
  }

  for (const queueRow of queueRows) {
    state.set(
      queueRow.deliveryId,
      mapDispatchState(
        queueRow,
        attemptsByDeliveryId.get(queueRow.deliveryId) ?? [],
        strikesByDeliveryId.get(queueRow.deliveryId) ?? []
      )
    );
  }

  return state;
};

const normalizedTextScore = (value: string | null | undefined) => {
  if (!value) return "~";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
};

const buildRankingComponents = (seed: CandidateSeed): DispatchRankingComponent[] => {
  const base = (
    signal: DispatchRankingSignal,
    value: number | string,
    assumption: string
  ): DispatchRankingComponent => ({
    signal,
    value,
    direction: "asc",
    provisional: true,
    assumption
  });

  return [
    base("queue", seed.queueScore, DISPATCH_ASSUMPTIONS[0]),
    base("distance", seed.distanceScore, DISPATCH_ASSUMPTIONS[1]),
    base("region", seed.regionScore, DISPATCH_ASSUMPTIONS[2]),
    base("price", seed.priceScore, DISPATCH_ASSUMPTIONS[3])
  ];
};

const buildCandidateSnapshot = (seed: CandidateSeed, rank: number): DispatchCandidateSnapshot => {
  const components = buildRankingComponents(seed);
  return {
    driverId: seed.driver.id,
    driverName: seed.driver.name,
    companyId: seed.bond.companyId,
    bondId: seed.bond.id,
    bondCreatedAt: toIso(seed.bond.createdAt),
    rank,
    score: components.map((component) => `${component.signal}:${component.value}`).join("|"),
    components,
    provisionalSignals: components.filter((component) => component.provisional).map((component) => component.signal)
  };
};

const rankDispatchCandidates = async (input: {
  tx: DbTransaction;
  companyId: string;
  delivery: DeliveryRecord;
}): Promise<DispatchCandidateSnapshot[]> => {
  const activeDriverBonds = await input.tx
    .select({ bond: bonds, driver: drivers })
    .from(bonds)
    .innerJoin(drivers, eq(drivers.id, bonds.entityId))
    .where(and(eq(bonds.companyId, input.companyId), eq(bonds.entityType, "driver"), eq(bonds.status, "active")));

  const seeds: CandidateSeed[] = activeDriverBonds.map(({ bond, driver }) => ({
    bond,
    driver,
    queueScore: new Date(bond.createdAt).getTime(),
    distanceScore: normalizedTextScore(driver.name).length,
    regionScore: normalizedTextScore(`${input.delivery.pickupAddress ?? ""}|${input.delivery.dropoffAddress ?? ""}`),
    priceScore: 0
  }));

  const sorted = seeds.sort((left, right) => {
    if (left.queueScore !== right.queueScore) return left.queueScore - right.queueScore;
    if (left.distanceScore !== right.distanceScore) return left.distanceScore - right.distanceScore;
    if (left.regionScore !== right.regionScore) return left.regionScore.localeCompare(right.regionScore);
    if (left.priceScore !== right.priceScore) return left.priceScore - right.priceScore;
    return left.driver.id.localeCompare(right.driver.id);
  });

  return sorted.map((seed, index) => buildCandidateSnapshot(seed, index + 1));
};

const createDispatchAttempt = async (input: {
  tx: DbTransaction;
  delivery: DeliveryRecord;
  queueEntry: DispatchQueueEntryRecord;
  candidate: DispatchCandidateSnapshot;
  rankingSnapshot: DispatchCandidateSnapshot[];
  attemptNumber: number;
  timeoutSeconds: number;
}) => {
  const now = new Date();
  const deadline = new Date(now.getTime() + input.timeoutSeconds * 1000);

  const attemptCandidateSnapshot = sql`${JSON.stringify(input.candidate)}::jsonb`;

  const [attempt] = await input.tx
    .insert(dispatchAttempts)
    .values({
      deliveryId: input.delivery.id,
      queueEntryId: input.queueEntry.id,
      companyId: input.delivery.companyId,
      attemptNumber: input.attemptNumber,
      driverId: input.candidate.driverId,
      offerStatus: "pending",
      expiresAt: deadline,
      candidateSnapshot: attemptCandidateSnapshot
    })
    .returning();

  const [updatedQueueEntry] = await input.tx
    .update(dispatchQueueEntries)
    .set({
      phase: "offered",
      activeAttemptNumber: input.attemptNumber,
      activeAttemptId: attempt.id,
      offeredDriverId: input.candidate.driverId,
      offeredDriverName: input.candidate.driverName,
      offeredAt: now,
      deadlineAt: deadline,
      waitingReason: null,
      waitingSince: null,
      latestSnapshot: sql`${JSON.stringify(input.rankingSnapshot)}::jsonb`,
      updatedAt: now
    })
    .where(eq(dispatchQueueEntries.id, input.queueEntry.id))
    .returning();

  await input.tx
    .update(deliveries)
    .set({
      status: "offered",
      updatedAt: now
    })
    .where(eq(deliveries.id, input.delivery.id));

  await createTimelineEvent(input.tx, {
    deliveryId: input.delivery.id,
    status: "offered",
    actor: {
      actorType: "system",
      actorId: null,
      actorLabel: "dispatch-engine"
    },
    metadata: {
      reason: "dispatch_offer_created",
      queueEntryId: input.queueEntry.id,
      attemptId: attempt.id,
      attemptNumber: input.attemptNumber,
      offeredDriverId: input.candidate.driverId,
      offeredDriverName: input.candidate.driverName,
      deadlineAt: toIso(deadline),
      rankingVersion: DISPATCH_RANKING_VERSION,
      candidateSnapshot: input.candidate
    }
  });

  return {
    queueEntry: updatedQueueEntry,
    attempt
  };
};

const moveQueueEntryToWaiting = async (input: {
  tx: DbTransaction;
  delivery: DeliveryRecord;
  queueEntry: DispatchQueueEntryRecord;
  reason: DispatchWaitingReason;
  expiredAttempt?: DispatchAttemptRecord | null;
}) => {
  const now = new Date();

  const queueUpdate: Partial<typeof dispatchQueueEntries.$inferInsert> & { updatedAt: Date } = {
    phase: "waiting",
    activeAttemptId: null,
    offeredDriverId: null,
    offeredDriverName: null,
    offeredAt: null,
    deadlineAt: null,
    waitingReason: input.reason,
    waitingSince: now,
    updatedAt: now
  };

  const [updatedQueueEntry] = await input.tx
    .update(dispatchQueueEntries)
    .set(queueUpdate)
    .where(eq(dispatchQueueEntries.id, input.queueEntry.id))
    .returning();

  await input.tx
    .update(deliveries)
    .set({
      status: "queued",
      updatedAt: now
    })
    .where(eq(deliveries.id, input.delivery.id));

  await createTimelineEvent(input.tx, {
    deliveryId: input.delivery.id,
    status: "queued",
    actor: {
      actorType: "system",
      actorId: null,
      actorLabel: "dispatch-engine"
    },
    metadata: {
      reason: "dispatch_waiting_queue",
      queueEntryId: input.queueEntry.id,
      waitingReason: input.reason,
      expiredAttemptId: input.expiredAttempt?.id ?? null,
      expiredAttemptNumber: input.expiredAttempt?.attemptNumber ?? null
    }
  });

  return updatedQueueEntry;
};

const strikeConsequenceForCount = (count: number): "warning" | "bond_suspended" | "bond_revoked" => {
  if (count >= 3) return "bond_revoked";
  if (count >= 2) return "bond_suspended";
  return "warning";
};

const loadDispatchViewWithinTx = async (tx: DbTransaction, deliveryId: string): Promise<DeliveryDetail> => {
  const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);

  if (!delivery) {
    throw deliveryError("NOT_FOUND", "delivery_not_found");
  }

  const timelineRows = await tx
    .select()
    .from(deliveryEvents)
    .where(eq(deliveryEvents.deliveryId, deliveryId))
    .orderBy(asc(deliveryEvents.sequence), asc(deliveryEvents.createdAt));
  const [queueEntry] = await tx.select().from(dispatchQueueEntries).where(eq(dispatchQueueEntries.deliveryId, deliveryId)).limit(1);
  const attempts = await tx
    .select()
    .from(dispatchAttempts)
    .where(eq(dispatchAttempts.deliveryId, deliveryId))
    .orderBy(asc(dispatchAttempts.attemptNumber), asc(dispatchAttempts.createdAt));
  const strikes = await tx
    .select()
    .from(driverStrikes)
    .where(eq(driverStrikes.deliveryId, deliveryId))
    .orderBy(asc(driverStrikes.createdAt));

  return buildDeliveryView(
    delivery,
    timelineRows.map(mapTimelineEvent),
    queueEntry ? mapDispatchState(queueEntry, attempts, strikes) : null
  );
};

const applyDriverStrike = async (input: {
  tx: DbTransaction;
  delivery: DeliveryRecord;
  attempt: DispatchAttemptRecord;
  queueEntry: DispatchQueueEntryRecord;
  driverId: string;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<DriverStrikeRecord> => {
  const [bond] = await input.tx
    .select()
    .from(bonds)
    .where(
      and(
        eq(bonds.companyId, input.delivery.companyId),
        eq(bonds.entityId, input.driverId),
        eq(bonds.entityType, "driver")
      )
    )
    .limit(1);

  if (!bond) {
    throw deliveryError("BAD_REQUEST", "driver_offer_bond_not_found");
  }

  const [{ strikeCount }] = await input.tx
    .select({ strikeCount: sql<number>`count(*)::int` })
    .from(driverStrikes)
    .where(and(eq(driverStrikes.companyId, input.delivery.companyId), eq(driverStrikes.driverId, input.driverId)));

  const consequence = strikeConsequenceForCount((strikeCount ?? 0) + 1);
  const bondStatus = consequence === "bond_revoked" ? "revoked" : consequence === "bond_suspended" ? "suspended" : bond.status;

  if (bondStatus !== bond.status) {
    await input.tx
      .update(bonds)
      .set({
        status: bondStatus,
        updatedAt: new Date()
      })
      .where(eq(bonds.id, bond.id));
  }

  const [strike] = await input.tx
    .insert(driverStrikes)
    .values({
      companyId: input.delivery.companyId,
      driverId: input.driverId,
      bondId: bond.id,
      deliveryId: input.delivery.id,
      dispatchAttemptId: input.attempt.id,
      attemptNumber: input.attempt.attemptNumber,
      reason: input.reason,
      consequence,
      metadata: {
        queueEntryId: input.queueEntry.id,
        bondStatusBefore: bond.status,
        bondStatusAfter: bondStatus,
        ...asMetadata(input.metadata)
      }
    })
    .returning();

  return strike;
};

const advanceOrWaitAfterFailedOffer = async (input: {
  tx: DbTransaction;
  queueEntry: DispatchQueueEntryRecord;
  attempt: DispatchAttemptRecord;
  delivery: DeliveryRecord;
}) => {
  if (input.attempt.attemptNumber >= MAX_PRIVATE_ATTEMPTS) {
    await moveQueueEntryToWaiting({
      tx: input.tx,
      delivery: input.delivery,
      queueEntry: input.queueEntry,
      reason: "max_private_attempts_reached",
      expiredAttempt: input.attempt
    });

    return;
  }

  const rankingSnapshot = await rankDispatchCandidates({
    tx: input.tx,
    companyId: input.delivery.companyId,
    delivery: input.delivery
  });
  const nextCandidate = rankingSnapshot.find((candidate) => candidate.rank === input.attempt.attemptNumber + 1) ?? null;

  if (!nextCandidate) {
    await moveQueueEntryToWaiting({
      tx: input.tx,
      delivery: input.delivery,
      queueEntry: input.queueEntry,
      reason: "no_candidates_available",
      expiredAttempt: input.attempt
    });
    return;
  }

  await input.tx
    .update(dispatchQueueEntries)
    .set({
      latestSnapshot: sql`${JSON.stringify(rankingSnapshot)}::jsonb`,
      updatedAt: new Date()
    })
    .where(eq(dispatchQueueEntries.id, input.queueEntry.id));

  await createDispatchAttempt({
    tx: input.tx,
    delivery: input.delivery,
    queueEntry: input.queueEntry,
    candidate: nextCandidate,
    rankingSnapshot,
    attemptNumber: input.attempt.attemptNumber + 1,
    timeoutSeconds: input.queueEntry.timeoutSeconds
  });
};

const resolveDriverOfferLocked = async (input: {
  tx: DbTransaction;
  user: SessionUser;
  delivery: DeliveryRecord;
  queueEntry: DispatchQueueEntryRecord;
  attempt: DispatchAttemptRecord;
  decision: ResolveDriverOfferInput["decision"];
  reason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ResolveDriverOfferResult> => {
  const driver = await resolveAuthenticatedDriverProfile(input.user);

  if (input.attempt.driverId !== driver.id || input.queueEntry.offeredDriverId !== driver.id) {
    throw deliveryError("FORBIDDEN", "driver_offer_forbidden");
  }

  if (input.attempt.offerStatus !== "pending") {
    throw deliveryError("CONFLICT", `${OFFER_ALREADY_RESOLVED_PREFIX}:${input.attempt.offerStatus}`);
  }

  if (new Date(input.attempt.expiresAt).getTime() <= Date.now()) {
    const [expiredAttempt] = await input.tx
      .update(dispatchAttempts)
      .set({
        offerStatus: "expired",
        resolvedAt: new Date(),
        resolvedByActorType: "system",
        resolutionReason: DRIVER_TIMEOUT_REASON,
        updatedAt: new Date()
      })
      .where(and(eq(dispatchAttempts.id, input.attempt.id), eq(dispatchAttempts.offerStatus, "pending")))
      .returning();

    if (!expiredAttempt) {
      throw deliveryError("CONFLICT", `${OFFER_ALREADY_RESOLVED_PREFIX}:expired`);
    }

    await createTimelineEvent(input.tx, {
      deliveryId: input.delivery.id,
      status: "failed_attempt",
      actor: {
        actorType: "system",
        actorId: null,
        actorLabel: "dispatch-engine"
      },
      metadata: {
        reason: "dispatch_attempt_expired_before_driver_resolution",
        queueEntryId: input.queueEntry.id,
        attemptId: expiredAttempt.id,
        attemptNumber: expiredAttempt.attemptNumber,
        offeredDriverId: expiredAttempt.driverId,
        expiredAt: toIso(new Date())
      }
    });

    await advanceOrWaitAfterFailedOffer({
      tx: input.tx,
      queueEntry: input.queueEntry,
      attempt: expiredAttempt,
      delivery: input.delivery
    });

    throw deliveryError("CONFLICT", `${OFFER_ALREADY_RESOLVED_PREFIX}:expired`);
  }

  if (input.decision === "accept") {
    const now = new Date();
    const [acceptedAttempt] = await input.tx
      .update(dispatchAttempts)
      .set({
        offerStatus: "accepted",
        resolvedAt: now,
        resolvedByActorType: "driver",
        resolvedByActorId: input.user.id,
        resolutionReason: "driver_accepted_offer",
        updatedAt: now
      })
      .where(and(eq(dispatchAttempts.id, input.attempt.id), eq(dispatchAttempts.offerStatus, "pending")))
      .returning();

    if (!acceptedAttempt) {
      throw deliveryError("CONFLICT", `${OFFER_ALREADY_RESOLVED_PREFIX}:accepted`);
    }

    await input.tx
      .update(dispatchQueueEntries)
      .set({
        phase: "completed",
        activeAttemptId: null,
        deadlineAt: null,
        waitingReason: null,
        waitingSince: null,
        updatedAt: now
      })
      .where(eq(dispatchQueueEntries.id, input.queueEntry.id));

    await input.tx
      .update(deliveries)
      .set({
        status: "accepted",
        driverId: driver.id,
        updatedAt: now
      })
      .where(eq(deliveries.id, input.delivery.id));

    await createTimelineEvent(input.tx, {
      deliveryId: input.delivery.id,
      status: "accepted",
      actor: {
        actorType: "driver",
        actorId: input.user.id,
        actorLabel: driver.name
      },
      metadata: {
        reason: "driver_accepted_offer",
        queueEntryId: input.queueEntry.id,
        attemptId: acceptedAttempt.id,
        attemptNumber: acceptedAttempt.attemptNumber,
        offeredDriverId: driver.id,
        offeredDriverName: driver.name,
        resolutionMetadata: asMetadata(input.metadata)
      }
    });

    return {
      delivery: await loadDispatchViewWithinTx(input.tx, input.delivery.id),
      resolution: "accepted",
      attemptId: acceptedAttempt.id,
      queueEntryId: input.queueEntry.id,
      strike: null
    };
  }

  const now = new Date();
  const rejectionReason = input.reason?.trim() || DRIVER_REJECTION_REASON;
  const [rejectedAttempt] = await input.tx
    .update(dispatchAttempts)
    .set({
      offerStatus: "rejected",
      resolvedAt: now,
      resolvedByActorType: "driver",
      resolvedByActorId: input.user.id,
      resolutionReason: rejectionReason,
      updatedAt: now
    })
    .where(and(eq(dispatchAttempts.id, input.attempt.id), eq(dispatchAttempts.offerStatus, "pending")))
    .returning();

  if (!rejectedAttempt) {
    throw deliveryError("CONFLICT", `${OFFER_ALREADY_RESOLVED_PREFIX}:rejected`);
  }

  const strike = await applyDriverStrike({
    tx: input.tx,
    delivery: input.delivery,
    attempt: rejectedAttempt,
    queueEntry: input.queueEntry,
    driverId: driver.id,
    reason: rejectionReason,
    metadata: {
      attemptExpiresAt: toIso(rejectedAttempt.expiresAt),
      ...asMetadata(input.metadata)
    }
  });

  await createTimelineEvent(input.tx, {
    deliveryId: input.delivery.id,
    status: "failed_attempt",
    actor: {
      actorType: "driver",
      actorId: input.user.id,
      actorLabel: driver.name
    },
    metadata: {
      reason: "driver_rejected_offer",
      queueEntryId: input.queueEntry.id,
      attemptId: rejectedAttempt.id,
      attemptNumber: rejectedAttempt.attemptNumber,
      offeredDriverId: driver.id,
      offeredDriverName: driver.name,
      strikeId: strike.id,
      strikeConsequence: strike.consequence,
      strikeReason: rejectionReason,
      strikeMetadata: asMetadata(strike.metadata)
    }
  });

  await advanceOrWaitAfterFailedOffer({
    tx: input.tx,
    queueEntry: input.queueEntry,
    attempt: rejectedAttempt,
    delivery: input.delivery
  });

  return {
    delivery: await loadDispatchViewWithinTx(input.tx, input.delivery.id),
    resolution: "rejected",
    attemptId: rejectedAttempt.id,
    queueEntryId: input.queueEntry.id,
    strike: mapDriverStrike(strike)
  };
};

const initializeDispatchForDelivery = async (input: {
  tx: DbTransaction;
  delivery: DeliveryRecord;
}): Promise<DispatchInitializationResult> => {
  const rankingSnapshot = await rankDispatchCandidates({
    tx: input.tx,
    companyId: input.delivery.companyId,
    delivery: input.delivery
  });

  const queueEntryValues: typeof dispatchQueueEntries.$inferInsert & {
    assumptions: ReturnType<typeof sql>;
    latestSnapshot: ReturnType<typeof sql>;
  } = {
    deliveryId: input.delivery.id,
    companyId: input.delivery.companyId,
    phase: rankingSnapshot.length > 0 ? "queued" : "waiting",
    timeoutSeconds: DEFAULT_DISPATCH_TIMEOUT_SECONDS,
    rankingVersion: DISPATCH_RANKING_VERSION,
    assumptions: sql`${JSON.stringify([...DISPATCH_ASSUMPTIONS])}::jsonb`,
    latestSnapshot: sql`${JSON.stringify(rankingSnapshot)}::jsonb`
  };

  if (rankingSnapshot.length === 0) {
    const waitingSince = new Date();
    queueEntryValues.waitingReason = "no_candidates_available";
    queueEntryValues.waitingSince = waitingSince;

    await input.tx
      .update(deliveries)
      .set({
        status: "queued",
        updatedAt: waitingSince
      })
      .where(eq(deliveries.id, input.delivery.id));
  }

  const [queueEntry] = await input.tx
    .insert(dispatchQueueEntries)
    .values(queueEntryValues)
    .returning();

  await createTimelineEvent(input.tx, {
    deliveryId: input.delivery.id,
    status: "queued",
    actor: {
      actorType: "system",
      actorId: null,
      actorLabel: "dispatch-engine"
    },
    metadata: {
      reason: rankingSnapshot.length > 0 ? "dispatch_enqueued" : "dispatch_waiting_no_candidates",
      queueEntryId: queueEntry.id,
      rankingVersion: DISPATCH_RANKING_VERSION,
      candidateCount: rankingSnapshot.length,
      assumptions: [...DISPATCH_ASSUMPTIONS],
      latestSnapshot: rankingSnapshot,
      provisionalSignals: ["queue", "distance", "region", "price"]
    }
  });

  if (rankingSnapshot.length === 0) {
    return {
      queueEntry,
      attempts: []
    };
  }

  const firstAttempt = await createDispatchAttempt({
    tx: input.tx,
    delivery: input.delivery,
    queueEntry,
    candidate: rankingSnapshot[0],
    rankingSnapshot,
    attemptNumber: 1,
    timeoutSeconds: DEFAULT_DISPATCH_TIMEOUT_SECONDS
  });

  return {
    queueEntry: firstAttempt.queueEntry,
    attempts: [firstAttempt.attempt]
  };
};

const completeDispatchOnAssignment = async (input: {
  tx: DbTransaction;
  deliveryId: string;
  companyId: string;
  actorId: string;
  actorLabel: string;
  metadata?: Record<string, unknown>;
}) => {
  const [queueEntry] = await input.tx
    .select()
    .from(dispatchQueueEntries)
    .where(eq(dispatchQueueEntries.deliveryId, input.deliveryId))
    .limit(1);

  if (!queueEntry) {
    return;
  }

  if (queueEntry.activeAttemptId) {
    await input.tx
      .update(dispatchAttempts)
      .set({
        offerStatus: "accepted",
        resolvedAt: new Date(),
        resolvedByActorType: "company",
        resolvedByActorId: input.actorId,
        resolutionReason: "company_manual_assignment",
        updatedAt: new Date()
      })
      .where(eq(dispatchAttempts.id, queueEntry.activeAttemptId));
  }

  await input.tx
    .update(dispatchQueueEntries)
    .set({
      phase: "completed",
      activeAttemptId: null,
      deadlineAt: null,
      waitingReason: null,
      waitingSince: null,
      updatedAt: new Date()
    })
    .where(eq(dispatchQueueEntries.id, queueEntry.id));

  await createTimelineEvent(input.tx, {
    deliveryId: input.deliveryId,
    status: "assigned",
    actor: {
      actorType: "company",
      actorId: input.actorId,
      actorLabel: input.actorLabel
    },
    metadata: {
      ...(input.metadata ?? {}),
      queueEntryId: queueEntry.id,
      dispatchCompletion: "manual_assignment_acknowledged"
    }
  });
};

const processExpiredQueueEntry = async (input: {
  tx: DbTransaction;
  queueEntry: DispatchQueueEntryRecord;
  attempt: DispatchAttemptRecord;
  delivery: DeliveryRecord;
}) => {
  const now = new Date();

  const [expiredAttempt] = await input.tx
    .update(dispatchAttempts)
    .set({
      offerStatus: "expired",
      resolvedAt: now,
      resolvedByActorType: "system",
      resolutionReason: DRIVER_TIMEOUT_REASON,
      updatedAt: now
    })
    .where(and(eq(dispatchAttempts.id, input.attempt.id), eq(dispatchAttempts.offerStatus, "pending")))
    .returning();

  if (!expiredAttempt) {
    return { expired: false, advanced: false, waiting: false };
  }

  await createTimelineEvent(input.tx, {
    deliveryId: input.delivery.id,
    status: "failed_attempt",
    actor: {
      actorType: "system",
      actorId: null,
      actorLabel: "dispatch-engine"
    },
    metadata: {
      reason: "dispatch_attempt_expired",
      queueEntryId: input.queueEntry.id,
      attemptId: expiredAttempt.id,
      attemptNumber: expiredAttempt.attemptNumber,
      offeredDriverId: expiredAttempt.driverId,
      expiredAt: toIso(now),
      resolutionReason: DRIVER_TIMEOUT_REASON
    }
  });

  if (expiredAttempt.attemptNumber >= MAX_PRIVATE_ATTEMPTS) {
    await moveQueueEntryToWaiting({
      tx: input.tx,
      delivery: input.delivery,
      queueEntry: input.queueEntry,
      reason: "max_private_attempts_reached",
      expiredAttempt
    });

    return { expired: true, advanced: false, waiting: true };
  }

  const rankingSnapshot = await rankDispatchCandidates({
    tx: input.tx,
    companyId: input.delivery.companyId,
    delivery: input.delivery
  });
  const nextCandidate = rankingSnapshot.find((candidate) => candidate.rank === expiredAttempt.attemptNumber + 1) ?? null;

  if (!nextCandidate) {
    await moveQueueEntryToWaiting({
      tx: input.tx,
      delivery: input.delivery,
      queueEntry: input.queueEntry,
      reason: "no_candidates_available",
      expiredAttempt
    });

    return { expired: true, advanced: false, waiting: true };
  }

  await input.tx
    .update(dispatchQueueEntries)
    .set({
      latestSnapshot: sql`${JSON.stringify(rankingSnapshot)}::jsonb`,
      updatedAt: now
    })
    .where(eq(dispatchQueueEntries.id, input.queueEntry.id));

  await createDispatchAttempt({
    tx: input.tx,
    delivery: input.delivery,
    queueEntry: input.queueEntry,
    candidate: nextCandidate,
    rankingSnapshot,
    attemptNumber: expiredAttempt.attemptNumber + 1,
    timeoutSeconds: input.queueEntry.timeoutSeconds
  });

  return { expired: true, advanced: true, waiting: false };
};

export const listDispatchQueue = async (input: {
  user: SessionUser;
  filters?: { phase?: Extract<DispatchPhase, "queued" | "offered"> };
}): Promise<DeliveryListItem[]> => {
  const { db } = assertDb();
  requireRole(input.user, "company");
  const company = await resolveAuthenticatedCompanyProfile(input.user);

  const rows = await db
    .select({ delivery: deliveries })
    .from(dispatchQueueEntries)
    .innerJoin(deliveries, eq(deliveries.id, dispatchQueueEntries.deliveryId))
    .where(
      and(
        eq(dispatchQueueEntries.companyId, company.id),
        eq(dispatchQueueEntries.phase, input.filters?.phase ?? "offered")
      )
    )
    .orderBy(asc(dispatchQueueEntries.deadlineAt), desc(deliveries.createdAt));

  const deliveryRows = rows.map((row) => row.delivery);
  const timelines = await loadTimelineByDeliveryIds(deliveryRows.map((row) => row.id));
  const dispatchMap = await loadDispatchStateByDeliveryIds(deliveryRows.map((row) => row.id));

  return deliveryRows.map((row) => buildDeliveryView(row, timelines.get(row.id) ?? [], dispatchMap.get(row.id) ?? null));
};

export const listWaitingQueue = async (input: {
  user: SessionUser;
  filters?: { reason?: DispatchWaitingReason };
}): Promise<DeliveryListItem[]> => {
  const { db } = assertDb();
  requireRole(input.user, "company");
  const company = await resolveAuthenticatedCompanyProfile(input.user);

  const baseWhere = and(eq(dispatchQueueEntries.companyId, company.id), eq(dispatchQueueEntries.phase, "waiting"));
  const where = input.filters?.reason
    ? and(baseWhere, eq(dispatchQueueEntries.waitingReason, input.filters.reason))
    : baseWhere;

  const rows = await db
    .select({ delivery: deliveries })
    .from(dispatchQueueEntries)
    .innerJoin(deliveries, eq(deliveries.id, dispatchQueueEntries.deliveryId))
    .where(where)
    .orderBy(desc(dispatchQueueEntries.waitingSince), desc(deliveries.createdAt));

  const deliveryRows = rows.map((row) => row.delivery);
  const timelines = await loadTimelineByDeliveryIds(deliveryRows.map((row) => row.id));
  const dispatchMap = await loadDispatchStateByDeliveryIds(deliveryRows.map((row) => row.id));

  return deliveryRows.map((row) => buildDeliveryView(row, timelines.get(row.id) ?? [], dispatchMap.get(row.id) ?? null));
};

export const reprocessDispatchTimeouts = async (input: {
  user: SessionUser;
  data?: ReprocessDispatchTimeoutsInput;
}): Promise<ReprocessDispatchTimeoutsResult> => {
  const { db } = assertDb();
  requireRole(input.user, "company");
  const company = await resolveAuthenticatedCompanyProfile(input.user);
  const now = input.data?.nowIso ? new Date(input.data.nowIso) : new Date();

  return db.transaction(async (tx) => {
    const queueRows = await tx
      .select({ queueEntry: dispatchQueueEntries, attempt: dispatchAttempts, delivery: deliveries })
      .from(dispatchQueueEntries)
      .innerJoin(dispatchAttempts, eq(dispatchAttempts.id, dispatchQueueEntries.activeAttemptId))
      .innerJoin(deliveries, eq(deliveries.id, dispatchQueueEntries.deliveryId))
      .where(
        and(
          eq(dispatchQueueEntries.companyId, input.data?.companyId ?? company.id),
          eq(dispatchQueueEntries.phase, "offered"),
          eq(dispatchAttempts.offerStatus, "pending")
        )
      )
      .orderBy(asc(dispatchQueueEntries.deadlineAt));

    let expiredAttempts = 0;
    let advancedAttempts = 0;
    let movedToWaiting = 0;
    let unchangedEntries = 0;
    const touchedDeliveryIds = new Set<string>();

    for (const row of queueRows) {
      if (new Date(row.attempt.expiresAt).getTime() > now.getTime()) {
        unchangedEntries += 1;
        continue;
      }

      const result = await processExpiredQueueEntry({
        tx,
        queueEntry: row.queueEntry,
        attempt: row.attempt,
        delivery: row.delivery
      });

      if (!result.expired) {
        unchangedEntries += 1;
        continue;
      }

      touchedDeliveryIds.add(row.delivery.id);
      expiredAttempts += 1;
      if (result.advanced) advancedAttempts += 1;
      if (result.waiting) movedToWaiting += 1;
    }

    return {
      processedAt: toIso(now),
      scannedEntries: queueRows.length,
      expiredAttempts,
      advancedAttempts,
      movedToWaiting,
      unchangedEntries,
      deliveryIds: [...touchedDeliveryIds]
    };
  });
};

export const createDelivery = async (input: {
  user: SessionUser;
  data: {
    companyId: string;
    externalReference?: string | null;
    pickupAddress?: string | null;
    dropoffAddress?: string | null;
    metadata?: Record<string, unknown>;
  };
}): Promise<DeliveryDetail> => {
  const { db } = assertDb();
  requireRole(input.user, "retailer");
  const retailer = await resolveAuthenticatedRetailerProfile(input.user);

  await assertRetailerHasActiveBond({ companyId: input.data.companyId, user: input.user });

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(deliveries)
      .values({
        companyId: input.data.companyId,
        retailerId: retailer.id,
        externalReference: input.data.externalReference?.trim() || null,
        pickupAddress: input.data.pickupAddress?.trim() || null,
        dropoffAddress: input.data.dropoffAddress?.trim() || null,
        metadata: input.data.metadata ?? {}
      })
      .returning();

    await createTimelineEvent(tx, {
      deliveryId: created.id,
      status: created.status,
      actor: {
        actorType: "retailer",
        actorId: input.user.id,
        actorLabel: retailer.name
      },
      metadata: {
        reason: "delivery_created"
      }
    });

    await initializeDispatchForDelivery({ tx, delivery: created });

    const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, created.id)).limit(1);
    const timelineRows = await tx
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, created.id))
      .orderBy(asc(deliveryEvents.sequence), asc(deliveryEvents.createdAt));
    const [queueEntry] = await tx.select().from(dispatchQueueEntries).where(eq(dispatchQueueEntries.deliveryId, created.id)).limit(1);
    const attempts = await tx
      .select()
      .from(dispatchAttempts)
      .where(eq(dispatchAttempts.deliveryId, created.id))
      .orderBy(asc(dispatchAttempts.attemptNumber), asc(dispatchAttempts.createdAt));
    const strikes = await tx
      .select()
      .from(driverStrikes)
      .where(eq(driverStrikes.deliveryId, created.id))
      .orderBy(asc(driverStrikes.createdAt));

    return buildDeliveryView(
      delivery ?? created,
      timelineRows.map(mapTimelineEvent),
      queueEntry ? mapDispatchState(queueEntry, attempts, strikes) : null
    );
  });
};

export const listDeliveries = async (input: {
  user: SessionUser;
  filters?: { status?: DeliveryStatus };
}): Promise<DeliveryListItem[]> => {
  const { db } = assertDb();

  if (input.user.role === "company") {
    const company = await resolveAuthenticatedCompanyProfile(input.user);
    const rows = await db
      .select()
      .from(deliveries)
      .where(
        input.filters?.status
          ? and(eq(deliveries.companyId, company.id), eq(deliveries.status, input.filters.status))
          : eq(deliveries.companyId, company.id)
      )
      .orderBy(desc(deliveries.createdAt));

    const deliveryIds = rows.map((row) => row.id);
    const timelines = await loadTimelineByDeliveryIds(deliveryIds);
    const dispatchMap = await loadDispatchStateByDeliveryIds(deliveryIds);
    return rows.map((row) => buildDeliveryView(row, timelines.get(row.id) ?? [], dispatchMap.get(row.id) ?? null));
  }

  if (input.user.role === "retailer") {
    const retailer = await resolveAuthenticatedRetailerProfile(input.user);
    const rows = await db
      .select()
      .from(deliveries)
      .where(
        input.filters?.status
          ? and(eq(deliveries.retailerId, retailer.id), eq(deliveries.status, input.filters.status))
          : eq(deliveries.retailerId, retailer.id)
      )
      .orderBy(desc(deliveries.createdAt));

    const deliveryIds = rows.map((row) => row.id);
    const timelines = await loadTimelineByDeliveryIds(deliveryIds);
    const dispatchMap = await loadDispatchStateByDeliveryIds(deliveryIds);
    return rows.map((row) => buildDeliveryView(row, timelines.get(row.id) ?? [], dispatchMap.get(row.id) ?? null));
  }

  if (input.user.role === "driver") {
    const driver = await resolveAuthenticatedDriverProfile(input.user);
    const rows = await db
      .select({ delivery: deliveries })
      .from(dispatchQueueEntries)
      .innerJoin(deliveries, eq(deliveries.id, dispatchQueueEntries.deliveryId))
      .where(
        input.filters?.status
          ? and(eq(dispatchQueueEntries.offeredDriverId, driver.id), eq(deliveries.status, input.filters.status))
          : eq(dispatchQueueEntries.offeredDriverId, driver.id)
      )
      .orderBy(asc(dispatchQueueEntries.deadlineAt), desc(deliveries.createdAt));

    const deliveryRows = rows.map((row) => row.delivery);
    const deliveryIds = deliveryRows.map((row) => row.id);
    const timelines = await loadTimelineByDeliveryIds(deliveryIds);
    const dispatchMap = await loadDispatchStateByDeliveryIds(deliveryIds);
    return deliveryRows.map((row) => buildDeliveryView(row, timelines.get(row.id) ?? [], dispatchMap.get(row.id) ?? null));
  }

  throw deliveryError("FORBIDDEN", "delivery_role_forbidden:company_or_retailer_or_driver_required");
};

export const getDeliveryDetail = async (input: { user: SessionUser; deliveryId: string }): Promise<DeliveryDetail> => {
  const delivery = await getScopedDelivery({ deliveryId: input.deliveryId, user: input.user });
  const timelines = await loadTimelineByDeliveryIds([delivery.id]);
  const dispatchMap = await loadDispatchStateByDeliveryIds([delivery.id]);
  return buildDeliveryView(delivery, timelines.get(delivery.id) ?? [], dispatchMap.get(delivery.id) ?? null);
};

export const resolveDriverOffer = async (input: {
  user: SessionUser;
  data: ResolveDriverOfferInput;
}): Promise<ResolveDriverOfferResult> => {
  const { db } = assertDb();
  requireRole(input.user, "driver");

  return db.transaction(async (tx) => {
    const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, input.data.deliveryId)).for("update");

    if (!delivery) {
      throw deliveryError("NOT_FOUND", "delivery_not_found");
    }

    const [queueEntry] = await tx
      .select()
      .from(dispatchQueueEntries)
      .where(eq(dispatchQueueEntries.deliveryId, input.data.deliveryId))
      .for("update");

    if (!queueEntry || queueEntry.phase !== "offered" || !queueEntry.activeAttemptId) {
      throw deliveryError("CONFLICT", `${OFFER_ALREADY_RESOLVED_PREFIX}:queue_not_offered`);
    }

    const [attempt] = await tx
      .select()
      .from(dispatchAttempts)
      .where(eq(dispatchAttempts.id, queueEntry.activeAttemptId))
      .for("update");

    if (!attempt) {
      throw deliveryError("CONFLICT", `${OFFER_ALREADY_RESOLVED_PREFIX}:attempt_missing`);
    }

    return resolveDriverOfferLocked({
      tx,
      user: input.user,
      delivery,
      queueEntry,
      attempt,
      decision: input.data.decision,
      reason: input.data.reason,
      metadata: input.data.metadata
    });
  });
};

export const transitionDelivery = async (input: {
  user: SessionUser;
  data: { deliveryId: string; status: "assigned" | "picked_up" | "in_transit"; metadata?: Record<string, unknown> };
}): Promise<DeliveryDetail> => {
  const { db } = assertDb();
  requireRole(input.user, "company");
  const company = await resolveAuthenticatedCompanyProfile(input.user);

  return db.transaction(async (tx) => {
    const lockedRows = await tx.select().from(deliveries).where(eq(deliveries.id, input.data.deliveryId)).for("update");
    const delivery = lockedRows[0];

    if (!delivery) {
      throw deliveryError("NOT_FOUND", "delivery_not_found");
    }

    if (delivery.companyId !== company.id) {
      throw deliveryError("FORBIDDEN", "delivery_company_forbidden");
    }

    const allowed = allowedTransitions[delivery.status] ?? [];
    if (!allowed.includes(input.data.status)) {
      throw deliveryError("BAD_REQUEST", `delivery_transition_invalid:${delivery.status}->${input.data.status}`);
    }

    const [updated] = await tx
      .update(deliveries)
      .set({
        status: input.data.status,
        updatedAt: new Date()
      })
      .where(eq(deliveries.id, delivery.id))
      .returning();

    if (input.data.status === "assigned") {
      await completeDispatchOnAssignment({
        tx,
        deliveryId: delivery.id,
        companyId: company.id,
        actorId: input.user.id,
        actorLabel: company.name,
        metadata: input.data.metadata
      });
    } else {
      await createTimelineEvent(tx, {
        deliveryId: delivery.id,
        status: input.data.status,
        actor: {
          actorType: "company",
          actorId: input.user.id,
          actorLabel: company.name
        },
        metadata: input.data.metadata ?? {}
      });
    }

    const timelineRows = await tx
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, delivery.id))
      .orderBy(asc(deliveryEvents.sequence), asc(deliveryEvents.createdAt));
    const [queueEntry] = await tx.select().from(dispatchQueueEntries).where(eq(dispatchQueueEntries.deliveryId, delivery.id)).limit(1);
    const attempts = await tx
      .select()
      .from(dispatchAttempts)
      .where(eq(dispatchAttempts.deliveryId, delivery.id))
      .orderBy(asc(dispatchAttempts.attemptNumber), asc(dispatchAttempts.createdAt));
    const strikes = await tx
      .select()
      .from(driverStrikes)
      .where(eq(driverStrikes.deliveryId, delivery.id))
      .orderBy(asc(driverStrikes.createdAt));

    return buildDeliveryView(
      updated,
      timelineRows.map(mapTimelineEvent),
      queueEntry ? mapDispatchState(queueEntry, attempts, strikes) : null
    );
  });
};
