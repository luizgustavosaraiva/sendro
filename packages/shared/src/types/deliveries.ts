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
