export const deliveryStatuses = [
  "created",
  "queued",
  "offered",
  "assigned",
  "accepted",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled",
  "failed_attempt"
] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];

export const deliveryActorTypes = ["system", "company", "retailer", "driver"] as const;
export type DeliveryActorType = (typeof deliveryActorTypes)[number];

export const deliveryTransitionableStatuses = ["assigned", "picked_up", "in_transit"] as const;
export type DeliveryTransitionableStatus = (typeof deliveryTransitionableStatuses)[number];

export const dispatchPhases = ["queued", "offered", "waiting", "completed"] as const;
export type DispatchPhase = (typeof dispatchPhases)[number];

export const dispatchAttemptStatuses = ["pending", "expired", "accepted", "cancelled"] as const;
export type DispatchAttemptStatus = (typeof dispatchAttemptStatuses)[number];

export const dispatchWaitingReasons = ["max_private_attempts_reached", "no_candidates_available"] as const;
export type DispatchWaitingReason = (typeof dispatchWaitingReasons)[number];

export const dispatchRankingSignals = ["queue", "distance", "region", "price"] as const;
export type DispatchRankingSignal = (typeof dispatchRankingSignals)[number];

export type DeliveryTimelineEvent = {
  eventId: string;
  deliveryId: string;
  status: DeliveryStatus;
  actorType: DeliveryActorType;
  actorId: string | null;
  actorLabel: string | null;
  sequence: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type DispatchRankingComponent = {
  signal: DispatchRankingSignal;
  value: number | string;
  direction: "asc" | "desc";
  provisional: boolean;
  assumption: string;
};

export type DispatchCandidateSnapshot = {
  driverId: string;
  driverName: string;
  companyId: string;
  bondId: string;
  bondCreatedAt: string;
  rank: number;
  score: string;
  components: DispatchRankingComponent[];
  provisionalSignals: DispatchRankingSignal[];
};

export type DeliveryDispatchAttempt = {
  attemptId: string;
  deliveryId: string;
  companyId: string;
  attemptNumber: number;
  driverId: string | null;
  status: DispatchAttemptStatus;
  expiresAt: string;
  resolvedAt: string | null;
  candidateSnapshot: DispatchCandidateSnapshot | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryDispatchState = {
  queueEntryId: string;
  deliveryId: string;
  companyId: string;
  phase: DispatchPhase;
  timeoutSeconds: number;
  activeAttemptNumber: number;
  activeAttemptId: string | null;
  offeredDriverId: string | null;
  offeredDriverName: string | null;
  offeredAt: string | null;
  deadlineAt: string | null;
  waitingReason: DispatchWaitingReason | null;
  waitingSince: string | null;
  rankingVersion: string;
  assumptions: string[];
  latestSnapshot: DispatchCandidateSnapshot[];
  attempts: DeliveryDispatchAttempt[];
  createdAt: string;
  updatedAt: string;
};

export type DeliveryListItem = {
  deliveryId: string;
  companyId: string;
  retailerId: string;
  driverId: string | null;
  externalReference: string | null;
  status: DeliveryStatus;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  timeline: DeliveryTimelineEvent[];
  dispatch: DeliveryDispatchState | null;
};

export type DeliveryDetail = DeliveryListItem;

export type CreateDeliveryInput = {
  companyId: string;
  externalReference?: string | null;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  metadata?: Record<string, unknown>;
};

export type ListDeliveriesInput = {
  status?: DeliveryStatus;
};

export type GetDeliveryDetailInput = {
  deliveryId: string;
};

export type TransitionDeliveryInput = {
  deliveryId: string;
  status: DeliveryTransitionableStatus;
  metadata?: Record<string, unknown>;
};

export type DispatchQueueFiltersInput = {
  phase?: Extract<DispatchPhase, "queued" | "offered">;
};

export type WaitingQueueFiltersInput = {
  reason?: DispatchWaitingReason;
};

export type ReprocessDispatchTimeoutsInput = {
  companyId?: string;
  nowIso?: string;
};

export type ReprocessDispatchTimeoutsResult = {
  processedAt: string;
  scannedEntries: number;
  expiredAttempts: number;
  advancedAttempts: number;
  movedToWaiting: number;
  unchangedEntries: number;
  deliveryIds: string[];
};
