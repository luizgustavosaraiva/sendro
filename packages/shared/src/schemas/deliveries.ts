import { z } from "zod";
import {
  deliveryActorTypes,
  deliveryStatuses,
  deliveryTransitionableStatuses,
  dispatchPhases,
  dispatchRankingSignals,
  dispatchWaitingReasons,
  driverOfferStatuses,
  driverStrikeConsequences
} from "../types/deliveries";

const deliveryMetadataSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

export const deliveryStatusSchema = z.enum(deliveryStatuses);
export const deliveryActorTypeSchema = z.enum(deliveryActorTypes);
export const deliveryTransitionableStatusSchema = z.enum(deliveryTransitionableStatuses);
export const dispatchPhaseSchema = z.enum(dispatchPhases);
export const driverOfferStatusSchema = z.enum(driverOfferStatuses);
export const dispatchWaitingReasonSchema = z.enum(dispatchWaitingReasons);
export const dispatchRankingSignalSchema = z.enum(dispatchRankingSignals);
export const driverStrikeConsequenceSchema = z.enum(driverStrikeConsequences);

export const createDeliverySchema = z.object({
  companyId: z.string().uuid(),
  externalReference: z.string().trim().min(1).max(255).optional().nullable(),
  pickupAddress: z.string().trim().min(3).max(2000).optional().nullable(),
  dropoffAddress: z.string().trim().min(3).max(2000).optional().nullable(),
  metadata: deliveryMetadataSchema.optional()
});

export const listDeliveriesSchema = z.object({
  status: deliveryStatusSchema.optional()
});

export const getDeliveryDetailSchema = z.object({
  deliveryId: z.string().uuid()
});

export const transitionDeliverySchema = z.object({
  deliveryId: z.string().uuid(),
  status: deliveryTransitionableStatusSchema,
  metadata: deliveryMetadataSchema.optional()
});

export const resolveDriverOfferSchema = z.object({
  deliveryId: z.string().uuid(),
  decision: z.enum(["accept", "reject"]),
  reason: z.string().trim().min(3).max(120).optional().nullable(),
  metadata: deliveryMetadataSchema.optional()
});

export const deliveryProofPolicySchema = z.object({
  requireNote: z.boolean(),
  requirePhoto: z.boolean()
});

const deliveryProofNoteSchema = z.string().trim().min(1).max(2000);
const deliveryProofPhotoUrlSchema = z.string().trim().url().max(2000);

export const deliveryProofSchema = z.object({
  deliveredAt: z.string().datetime(),
  note: deliveryProofNoteSchema.nullable(),
  photoUrl: deliveryProofPhotoUrlSchema.nullable(),
  submittedByActorType: deliveryActorTypeSchema,
  submittedByActorId: z.string().nullable(),
  policy: deliveryProofPolicySchema
});

export const deliveryProofSubmissionSchema = z.object({
  note: deliveryProofNoteSchema.optional().nullable(),
  photoUrl: deliveryProofPhotoUrlSchema.optional().nullable()
});

export const deliveryCompletionSchema = z.object({
  deliveryId: z.string().uuid(),
  proof: deliveryProofSubmissionSchema
});

export const dispatchQueueFiltersSchema = z.object({
  phase: z.enum(["queued", "offered"]).optional()
});

export const waitingQueueFiltersSchema = z.object({
  reason: dispatchWaitingReasonSchema.optional()
});

export const reprocessDispatchTimeoutsSchema = z.object({
  companyId: z.string().uuid().optional(),
  nowIso: z.string().datetime().optional()
});

export const deliveryTimelineEventSchema = z.object({
  eventId: z.string().uuid(),
  deliveryId: z.string().uuid(),
  status: deliveryStatusSchema,
  actorType: deliveryActorTypeSchema,
  actorId: z.string().nullable(),
  actorLabel: z.string().nullable(),
  sequence: z.number().int().nonnegative(),
  metadata: deliveryMetadataSchema,
  createdAt: z.string()
});

export const dispatchRankingComponentSchema = z.object({
  signal: dispatchRankingSignalSchema,
  value: z.union([z.number(), z.string()]),
  direction: z.enum(["asc", "desc"]),
  provisional: z.boolean(),
  assumption: z.string()
});

export const dispatchCandidateSnapshotSchema = z.object({
  driverId: z.string().uuid(),
  driverName: z.string(),
  companyId: z.string().uuid(),
  bondId: z.string().uuid(),
  bondCreatedAt: z.string(),
  rank: z.number().int().positive(),
  score: z.string(),
  components: z.array(dispatchRankingComponentSchema),
  provisionalSignals: z.array(dispatchRankingSignalSchema)
});

export const driverStrikeSchema = z.object({
  strikeId: z.string().uuid(),
  companyId: z.string().uuid(),
  driverId: z.string().uuid(),
  bondId: z.string().uuid(),
  deliveryId: z.string().uuid(),
  dispatchAttemptId: z.string().uuid(),
  attemptNumber: z.number().int().positive(),
  reason: z.string(),
  consequence: driverStrikeConsequenceSchema,
  metadata: deliveryMetadataSchema,
  createdAt: z.string()
});

export const deliveryDispatchAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  deliveryId: z.string().uuid(),
  companyId: z.string().uuid(),
  attemptNumber: z.number().int().positive(),
  driverId: z.string().uuid().nullable(),
  offerStatus: driverOfferStatusSchema,
  expiresAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolvedByActorType: deliveryActorTypeSchema.nullable(),
  resolvedByActorId: z.string().nullable(),
  resolutionReason: z.string().nullable(),
  candidateSnapshot: dispatchCandidateSnapshotSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const deliveryDispatchStateSchema = z.object({
  queueEntryId: z.string().uuid(),
  deliveryId: z.string().uuid(),
  companyId: z.string().uuid(),
  phase: dispatchPhaseSchema,
  timeoutSeconds: z.number().int().positive(),
  activeAttemptNumber: z.number().int().nonnegative(),
  activeAttemptId: z.string().uuid().nullable(),
  offeredDriverId: z.string().uuid().nullable(),
  offeredDriverName: z.string().nullable(),
  offeredAt: z.string().nullable(),
  deadlineAt: z.string().nullable(),
  waitingReason: dispatchWaitingReasonSchema.nullable(),
  waitingSince: z.string().nullable(),
  rankingVersion: z.string(),
  assumptions: z.array(z.string()),
  latestSnapshot: z.array(dispatchCandidateSnapshotSchema),
  attempts: z.array(deliveryDispatchAttemptSchema),
  strikes: z.array(driverStrikeSchema),
  createdAt: z.string(),
  updatedAt: z.string()
});

const deliveryProofFieldSchema = z.preprocess((value) => (value === undefined ? null : value), deliveryProofSchema.nullable());

export const deliveryListItemSchema = z.object({
  deliveryId: z.string().uuid(),
  companyId: z.string().uuid(),
  retailerId: z.string().uuid(),
  driverId: z.string().uuid().nullable(),
  externalReference: z.string().nullable(),
  status: deliveryStatusSchema,
  pickupAddress: z.string().nullable(),
  dropoffAddress: z.string().nullable(),
  metadata: deliveryMetadataSchema,
  proof: deliveryProofFieldSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  timeline: z.array(deliveryTimelineEventSchema),
  dispatch: deliveryDispatchStateSchema.nullable()
});

export const deliveryDetailSchema = deliveryListItemSchema;
export const resolveDriverOfferResultSchema = z.object({
  delivery: deliveryDetailSchema,
  resolution: z.enum(["accepted", "rejected"]),
  attemptId: z.string().uuid(),
  queueEntryId: z.string().uuid(),
  strike: driverStrikeSchema.nullable()
});
export const deliveryListSchema = z.array(deliveryListItemSchema);
export const dispatchQueueListSchema = z.array(deliveryListItemSchema);
export const waitingQueueListSchema = z.array(deliveryListItemSchema);

export const reprocessDispatchTimeoutsResultSchema = z.object({
  processedAt: z.string(),
  scannedEntries: z.number().int().nonnegative(),
  expiredAttempts: z.number().int().nonnegative(),
  advancedAttempts: z.number().int().nonnegative(),
  movedToWaiting: z.number().int().nonnegative(),
  unchangedEntries: z.number().int().nonnegative(),
  deliveryIds: z.array(z.string().uuid())
});
