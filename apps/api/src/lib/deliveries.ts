import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { assertDb, deliveryEvents, deliveries } from "@repo/db";
import type {
  CreateDeliveryInput,
  DeliveryActorType,
  DeliveryDetail,
  DeliveryListItem,
  DeliveryStatus,
  DeliveryTimelineEvent,
  DeliveryTransitionableStatus,
  EntityRole,
  ListDeliveriesInput,
  TransitionDeliveryInput
} from "@repo/shared";
import {
  assertRetailerHasActiveBond,
  requireRole,
  resolveAuthenticatedCompanyProfile,
  resolveAuthenticatedRetailerProfile
} from "./bonds";

type SessionUser = {
  id: string;
  role: EntityRole;
};

type DeliveryRecord = typeof deliveries.$inferSelect;
type DeliveryEventRecord = typeof deliveryEvents.$inferSelect;

type DeliveryEventMetadata = Record<string, unknown>;
type DbHandle = ReturnType<typeof assertDb>["db"];
type TransactionCallback = Parameters<DbHandle["transaction"]>[0];
type DbTransaction = TransactionCallback extends (tx: infer T, ...args: never[]) => Promise<unknown> ? T : never;

type DeliveryActor = {
  actorType: DeliveryActorType;
  actorId: string | null;
  actorLabel: string | null;
};

const toIso = (value: Date | string) => new Date(value).toISOString();

const asMetadata = (value: unknown): DeliveryEventMetadata => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as DeliveryEventMetadata;
};

const deliveryError = (code: TRPCError["code"], message: string) => new TRPCError({ code, message });

const allowedTransitions: Record<DeliveryStatus, DeliveryTransitionableStatus[]> = {
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

const buildDeliveryView = (delivery: DeliveryRecord, timeline: DeliveryTimelineEvent[]): DeliveryListItem => ({
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
  timeline
});

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

  throw deliveryError("FORBIDDEN", "delivery_role_forbidden:company_or_retailer_required");
};

export const createDelivery = async (input: { user: SessionUser; data: CreateDeliveryInput }): Promise<DeliveryDetail> => {
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

    const event = await createTimelineEvent(tx, {
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

    return buildDeliveryView(created, [mapTimelineEvent(event)]);
  });
};

export const listDeliveries = async (input: { user: SessionUser; filters?: ListDeliveriesInput }): Promise<DeliveryListItem[]> => {
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

    const timelines = await loadTimelineByDeliveryIds(rows.map((row) => row.id));
    return rows.map((row) => buildDeliveryView(row, timelines.get(row.id) ?? []));
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

    const timelines = await loadTimelineByDeliveryIds(rows.map((row) => row.id));
    return rows.map((row) => buildDeliveryView(row, timelines.get(row.id) ?? []));
  }

  throw deliveryError("FORBIDDEN", "delivery_role_forbidden:company_or_retailer_required");
};

export const getDeliveryDetail = async (input: { user: SessionUser; deliveryId: string }): Promise<DeliveryDetail> => {
  const delivery = await getScopedDelivery({ deliveryId: input.deliveryId, user: input.user });
  const timelines = await loadTimelineByDeliveryIds([delivery.id]);
  return buildDeliveryView(delivery, timelines.get(delivery.id) ?? []);
};

export const transitionDelivery = async (input: { user: SessionUser; data: TransitionDeliveryInput }): Promise<DeliveryDetail> => {
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

    const timelineRows = await tx
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, delivery.id))
      .orderBy(asc(deliveryEvents.sequence), asc(deliveryEvents.createdAt));

    return buildDeliveryView(updated, timelineRows.map(mapTimelineEvent));
  });
};
