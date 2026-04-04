import { describe, expect, it } from "vitest";
import {
  accounts,
  bondEntityTypeEnum,
  bondStatusEnum,
  companies,
  companyLifecycleEnum,
  deliveries,
  deliveryActorTypeEnum,
  deliveryEvents,
  deliveryStatusEnum,
  drivers,
  driverLifecycleEnum,
  entityRoleEnum,
  invitations,
  invitationChannelEnum,
  invitationStatusEnum,
  retailers,
  retailerLifecycleEnum,
  schema,
  sessions,
  users,
  verifications
} from "../../packages/db/src/schema/index";

const getEnumValues = (enumLike: { enumValues: readonly string[] }) => [...enumLike.enumValues];

describe("db schema", () => {
  it("declares the Better Auth base tables and multi-entity profile tables", () => {
    expect(users).toBeDefined();
    expect(sessions).toBeDefined();
    expect(accounts).toBeDefined();
    expect(verifications).toBeDefined();
    expect(companies).toBeDefined();
    expect(retailers).toBeDefined();
    expect(drivers).toBeDefined();
    expect(invitations).toBeDefined();
    expect(deliveries).toBeDefined();
    expect(deliveryEvents).toBeDefined();
  });

  it("locks the enum contract needed by downstream slices", () => {
    expect(getEnumValues(entityRoleEnum)).toEqual(["company", "retailer", "driver"]);
    expect(getEnumValues(bondEntityTypeEnum)).toEqual(["retailer", "driver"]);
    expect(getEnumValues(bondStatusEnum)).toEqual(["pending", "active", "suspended", "revoked"]);
    expect(getEnumValues(invitationChannelEnum)).toEqual(["whatsapp", "email", "link", "manual"]);
    expect(getEnumValues(invitationStatusEnum)).toEqual(["pending", "accepted", "expired", "revoked"]);
    expect(getEnumValues(deliveryStatusEnum)).toEqual([
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
    expect(getEnumValues(deliveryActorTypeEnum)).toEqual(["system", "company", "retailer", "driver"]);
    expect(getEnumValues(companyLifecycleEnum)).toEqual(["onboarding", "active", "suspended"]);
    expect(getEnumValues(retailerLifecycleEnum)).toEqual(["onboarding", "active", "suspended"]);
    expect(getEnumValues(driverLifecycleEnum)).toEqual(["onboarding", "active", "paused", "blocked"]);
  });

  it("exports a single schema object for Drizzle wiring", () => {
    expect(Object.keys(schema).sort()).toEqual(
      [
        "account",
        "accounts",
        "bondEntityTypeEnum",
        "bondStatusEnum",
        "bonds",
        "companies",
        "companyLifecycleEnum",
        "deliveries",
        "deliveryActorTypeEnum",
        "deliveryEvents",
        "deliveryStatusEnum",
        "driverLifecycleEnum",
        "drivers",
        "entityRoleEnum",
        "invitationChannelEnum",
        "invitationStatusEnum",
        "invitations",
        "retailerLifecycleEnum",
        "retailers",
        "session",
        "sessions",
        "user",
        "users",
        "verification",
        "verifications"
      ].sort()
    );
  });
});
