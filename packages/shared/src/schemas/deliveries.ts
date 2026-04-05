import { z } from "zod";
import { deliveryActorTypes, deliveryStatuses, deliveryTransitionableStatuses } from "../types/deliveries";

const deliveryMetadataSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

export const deliveryStatusSchema = z.enum(deliveryStatuses);
export const deliveryActorTypeSchema = z.enum(deliveryActorTypes);
export const deliveryTransitionableStatusSchema = z.enum(deliveryTransitionableStatuses);

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
  createdAt: z.string(),
  updatedAt: z.string(),
  timeline: z.array(deliveryTimelineEventSchema)
});

export const deliveryDetailSchema = deliveryListItemSchema;
export const deliveryListSchema = z.array(deliveryListItemSchema);
