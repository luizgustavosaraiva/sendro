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

export const driverOfferStatuses = ["pending", "accepted", "rejected", "expired"] as const;
export type DriverOfferStatus = (typeof driverOfferStatuses)[number];

export const driverStrikeConsequences = ["warning", "bond_suspended", "bond_revoked"] as const;
export type DriverStrikeConsequence = (typeof driverStrikeConsequences)[number];

export const dispatchWaitingReasons = ["max_private_attempts_reached", "no_candidates_available"] as const;
export type DispatchWaitingReason = (typeof dispatchWaitingReasons)[number];

export const dispatchRankingSignals = ["queue", "distance", "region", "price"] as const;
export type DispatchRankingSignal = (typeof dispatchRankingSignals)[number];

export const operationsSummaryWindows = ["all_time", "last_24h"] as const;
export type OperationsSummaryWindow = (typeof operationsSummaryWindows)[number];

export const operationsOnTimeStates = ["available", "unavailable_policy_pending"] as const;
export type OperationsOnTimeState = (typeof operationsOnTimeStates)[number];

export const companyDriverOperationalStates = [
  "available",
  "offered",
  "busy",
  "suspended",
  "revoked",
  "pending_bond"
] as const;
export type CompanyDriverOperationalStateKind = (typeof companyDriverOperationalStates)[number];

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

export type DeliveryProofPolicy = {
  requireNote: boolean;
  requirePhoto: boolean;
};

export type DeliveryProof = {
  deliveredAt: string;
  note: string | null;
  photoUrl: string | null;
  submittedByActorType: DeliveryActorType;
  submittedByActorId: string | null;
  policy: DeliveryProofPolicy;
};

export type DeliveryProofSubmission = {
  note?: string | null;
  photoUrl?: string | null;
};

export type DeliveryCompletionInput = {
  deliveryId: string;
  proof: DeliveryProofSubmission;
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

export type DriverStrike = {
  strikeId: string;
  companyId: string;
  driverId: string;
  bondId: string;
  deliveryId: string;
  dispatchAttemptId: string;
  attemptNumber: number;
  reason: string;
  consequence: DriverStrikeConsequence;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type DeliveryDispatchAttempt = {
  attemptId: string;
  deliveryId: string;
  companyId: string;
  attemptNumber: number;
  driverId: string | null;
  offerStatus: DriverOfferStatus;
  expiresAt: string;
  resolvedAt: string | null;
  resolvedByActorType: DeliveryActorType | null;
  resolvedByActorId: string | null;
  resolutionReason: string | null;
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
  strikes: DriverStrike[];
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
  proof: DeliveryProof | null;
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

export type DriverOfferDecision = "accept" | "reject";

export type ResolveDriverOfferInput = {
  deliveryId: string;
  decision: DriverOfferDecision;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export type ResolveDriverOfferResult = {
  delivery: DeliveryDetail;
  resolution: "accepted" | "rejected";
  attemptId: string;
  queueEntryId: string;
  strike: DriverStrike | null;
};

export type DispatchQueueFiltersInput = {
  phase?: Extract<DispatchPhase, "queued" | "offered">;
};

export type WaitingQueueFiltersInput = {
  reason?: DispatchWaitingReason;
};

export type OperationsSummaryFiltersInput = {
  window?: OperationsSummaryWindow;
};

export type OperationsSummary = {
  generatedAt: string;
  window: OperationsSummaryWindow;
  assumptions: string[];
  onTime: {
    value?: number;
    state: OperationsOnTimeState;
    reason: string;
  };
  kpis: {
    awaitingAcceptance: number;
    waitingQueue: number;
    failedAttempts: number;
    delivered: number;
    activeDrivers: number;
  };
};

export type CompanyDriverOperationalState = {
  driverId: string;
  driverName: string;
  companyId: string;
  bondId: string;
  bondStatus: "pending" | "active" | "suspended" | "revoked";
  operationalState: CompanyDriverOperationalStateKind;
  lastOfferAt: string | null;
  lastResolution: string | null;
  strikeCount: number;
  strikeConsequence: DriverStrikeConsequence | null;
  pendingOfferCount: number;
  activeDeliveriesCount: number;
  failedAttemptsCount: number;
  assumptions: string[];
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
