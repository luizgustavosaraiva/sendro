import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { entityRoles } from "@repo/shared";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const entityRoleEnum = pgEnum("entity_role", entityRoles);
export const bondEntityTypeEnum = pgEnum("bond_entity_type", ["retailer", "driver"]);
export const bondStatusEnum = pgEnum("bond_status", ["pending", "active", "suspended", "revoked"]);
export const invitationChannelEnum = pgEnum("invitation_channel", ["whatsapp", "email", "link", "manual"]);
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "expired", "revoked"]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
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
]);
export const deliveryActorTypeEnum = pgEnum("delivery_actor_type", [
  "system",
  "company",
  "retailer",
  "driver"
]);
export const driverLifecycleEnum = pgEnum("driver_lifecycle", ["onboarding", "active", "paused", "blocked"]);
export const retailerLifecycleEnum = pgEnum("retailer_lifecycle", ["onboarding", "active", "suspended"]);
export const companyLifecycleEnum = pgEnum("company_lifecycle", ["onboarding", "active", "suspended"]);

export const users = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    role: entityRoleEnum("role").notNull(),
    ...timestamps
  },
  (table) => ({
    emailIdx: uniqueIndex("user_email_unique").on(table.email)
  })
);

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps
  },
  (table) => ({
    tokenIdx: uniqueIndex("session_token_unique").on(table.token),
    userIdx: index("session_user_id_idx").on(table.userId)
  })
);

export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps
  },
  (table) => ({
    providerAccountIdx: uniqueIndex("account_provider_account_unique").on(table.providerId, table.accountId),
    userIdx: index("account_user_id_idx").on(table.userId)
  })
);

export const verifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps
  },
  (table) => ({
    identifierValueIdx: uniqueIndex("verification_identifier_value_unique").on(table.identifier, table.value)
  })
);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    lifecycle: companyLifecycleEnum("lifecycle").default("onboarding").notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    ...timestamps
  },
  (table) => ({
    userIdx: uniqueIndex("companies_user_id_unique").on(table.userId),
    slugIdx: uniqueIndex("companies_slug_unique").on(table.slug),
    stripeIdx: uniqueIndex("companies_stripe_customer_id_unique").on(table.stripeCustomerId)
  })
);

export const retailers = pgTable(
  "retailers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    lifecycle: retailerLifecycleEnum("lifecycle").default("onboarding").notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    ...timestamps
  },
  (table) => ({
    userIdx: uniqueIndex("retailers_user_id_unique").on(table.userId),
    slugIdx: uniqueIndex("retailers_slug_unique").on(table.slug),
    stripeIdx: uniqueIndex("retailers_stripe_customer_id_unique").on(table.stripeCustomerId)
  })
);

export const drivers = pgTable(
  "drivers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    lifecycle: driverLifecycleEnum("lifecycle").default("onboarding").notNull(),
    ...timestamps
  },
  (table) => ({
    userIdx: uniqueIndex("drivers_user_id_unique").on(table.userId),
    phoneIdx: uniqueIndex("drivers_phone_unique").on(table.phone)
  })
);

export const bonds = pgTable(
  "bonds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").notNull(),
    entityType: bondEntityTypeEnum("entity_type").notNull(),
    status: bondStatusEnum("status").default("pending").notNull(),
    requestedByUserId: text("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps
  },
  (table) => ({
    companyEntityIdx: uniqueIndex("bonds_company_entity_unique").on(table.companyId, table.entityId, table.entityType),
    statusIdx: index("bonds_status_idx").on(table.status)
  })
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    channel: invitationChannelEnum("channel").notNull(),
    status: invitationStatusEnum("status").default("pending").notNull(),
    invitedContact: varchar("invited_contact", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps
  },
  (table) => ({
    tokenIdx: uniqueIndex("invitations_token_unique").on(table.token),
    companyStatusIdx: index("invitations_company_status_idx").on(table.companyId, table.status)
  })
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id, { onDelete: "restrict" }),
    driverId: uuid("driver_id").references(() => drivers.id, { onDelete: "set null" }),
    externalReference: varchar("external_reference", { length: 255 }),
    status: deliveryStatusEnum("status").default("created").notNull(),
    pickupAddress: text("pickup_address"),
    dropoffAddress: text("dropoff_address"),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    ...timestamps
  },
  (table) => ({
    companyStatusIdx: index("deliveries_company_status_idx").on(table.companyId, table.status),
    retailerIdx: index("deliveries_retailer_idx").on(table.retailerId),
    driverIdx: index("deliveries_driver_idx").on(table.driverId)
  })
);

export const deliveryEvents = pgTable(
  "delivery_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    status: deliveryStatusEnum("status").notNull(),
    actorType: deliveryActorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    actorLabel: varchar("actor_label", { length: 255 }),
    sequence: integer("sequence").notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    deliverySequenceIdx: uniqueIndex("delivery_events_delivery_sequence_unique").on(table.deliveryId, table.sequence),
    deliveryCreatedIdx: index("delivery_events_delivery_created_idx").on(table.deliveryId, table.createdAt)
  })
);

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  company: one(companies, {
    fields: [users.id],
    references: [companies.userId]
  }),
  retailer: one(retailers, {
    fields: [users.id],
    references: [retailers.userId]
  }),
  driver: one(drivers, {
    fields: [users.id],
    references: [drivers.userId]
  }),
  requestedBonds: many(bonds),
  createdInvitations: many(invitations)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id]
  })
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id]
  })
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  user: one(users, {
    fields: [companies.userId],
    references: [users.id]
  }),
  bonds: many(bonds),
  invitations: many(invitations),
  deliveries: many(deliveries)
}));

export const retailersRelations = relations(retailers, ({ one, many }) => ({
  user: one(users, {
    fields: [retailers.userId],
    references: [users.id]
  }),
  deliveries: many(deliveries)
}));

export const driversRelations = relations(drivers, ({ one, many }) => ({
  user: one(users, {
    fields: [drivers.userId],
    references: [users.id]
  }),
  deliveries: many(deliveries)
}));

export const bondsRelations = relations(bonds, ({ one }) => ({
  company: one(companies, {
    fields: [bonds.companyId],
    references: [companies.id]
  }),
  requestedByUser: one(users, {
    fields: [bonds.requestedByUserId],
    references: [users.id]
  })
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  company: one(companies, {
    fields: [invitations.companyId],
    references: [companies.id]
  }),
  createdByUser: one(users, {
    fields: [invitations.createdByUserId],
    references: [users.id]
  })
}));

export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  company: one(companies, {
    fields: [deliveries.companyId],
    references: [companies.id]
  }),
  retailer: one(retailers, {
    fields: [deliveries.retailerId],
    references: [retailers.id]
  }),
  driver: one(drivers, {
    fields: [deliveries.driverId],
    references: [drivers.id]
  }),
  events: many(deliveryEvents)
}));

export const deliveryEventsRelations = relations(deliveryEvents, ({ one }) => ({
  delivery: one(deliveries, {
    fields: [deliveryEvents.deliveryId],
    references: [deliveries.id]
  })
}));

export const schema = {
  entityRoleEnum,
  bondEntityTypeEnum,
  bondStatusEnum,
  invitationChannelEnum,
  invitationStatusEnum,
  deliveryStatusEnum,
  deliveryActorTypeEnum,
  driverLifecycleEnum,
  retailerLifecycleEnum,
  companyLifecycleEnum,
  users,
  sessions,
  accounts,
  verifications,
  companies,
  retailers,
  drivers,
  bonds,
  invitations,
  deliveries,
  deliveryEvents
};

export type DatabaseSchema = typeof schema;
