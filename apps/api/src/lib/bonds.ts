import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { assertDb, bonds, companies, drivers, retailers } from "@repo/db";
import type { BondDecisionAction, BondEntityType, BondListItem, CompanyBondLists, EntityRole } from "@repo/shared";
import { ensureProfileForUser } from "../routes/auth/register";

type SessionUser = {
  id: string;
  role: EntityRole;
};

type CompanyProfile = typeof companies.$inferSelect;
type RetailerProfile = typeof retailers.$inferSelect;
type DriverProfile = typeof drivers.$inferSelect;
type BondRecord = typeof bonds.$inferSelect;

const toIso = (value: Date | string) => new Date(value).toISOString();

const bondError = (code: TRPCError["code"], message: string) => new TRPCError({ code, message });

const asProfileLookupError = (role: EntityRole, error: unknown): never => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.startsWith("profile_user_not_found:")) {
    throw bondError("NOT_FOUND", `bond_profile_user_not_found:${role}`);
  }

  if (message.startsWith("stripe_profile_bootstrap_failed:")) {
    throw bondError("INTERNAL_SERVER_ERROR", `bond_profile_bootstrap_failed:${role}`);
  }

  throw bondError("INTERNAL_SERVER_ERROR", `bond_profile_resolution_failed:${role}`);
};

export const requireRole = (user: SessionUser, expected: EntityRole) => {
  if (user.role !== expected) {
    throw bondError("FORBIDDEN", `bond_role_forbidden:${expected}_required`);
  }
};

export const resolveAuthenticatedCompanyProfile = async (user: SessionUser): Promise<CompanyProfile> => {
  requireRole(user, "company");

  try {
    const bootstrap = await ensureProfileForUser({ userId: user.id, role: "company" });
    const profile = bootstrap.profile as CompanyProfile | undefined;

    if (!profile?.id) {
      throw bondError("INTERNAL_SERVER_ERROR", "bond_profile_malformed:company");
    }

    return profile;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return asProfileLookupError("company", error);
  }
};

export const resolveAuthenticatedRetailerProfile = async (user: SessionUser): Promise<RetailerProfile> => {
  requireRole(user, "retailer");

  try {
    const bootstrap = await ensureProfileForUser({ userId: user.id, role: "retailer" });
    const profile = bootstrap.profile as RetailerProfile | undefined;

    if (!profile?.id) {
      throw bondError("INTERNAL_SERVER_ERROR", "bond_profile_malformed:retailer");
    }

    return profile;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return asProfileLookupError("retailer", error);
  }
};

export const resolveAuthenticatedDriverProfile = async (user: SessionUser): Promise<DriverProfile> => {
  requireRole(user, "driver");

  try {
    const bootstrap = await ensureProfileForUser({ userId: user.id, role: "driver" });
    const profile = bootstrap.profile as DriverProfile | undefined;

    if (!profile?.id) {
      throw bondError("INTERNAL_SERVER_ERROR", "bond_profile_malformed:driver");
    }

    return profile;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return asProfileLookupError("driver", error);
  }
};

export const findCompanyById = async (companyId: string): Promise<CompanyProfile> => {
  const { db } = assertDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);

  if (!company) {
    throw bondError("NOT_FOUND", "bond_company_not_found");
  }

  return company;
};

export const findBondById = async (bondId: string): Promise<BondRecord> => {
  const { db } = assertDb();
  const [bond] = await db.select().from(bonds).where(eq(bonds.id, bondId)).limit(1);

  if (!bond) {
    throw bondError("NOT_FOUND", "bond_request_not_found");
  }

  return bond;
};

export const getBondByCompanyAndEntity = async (input: {
  companyId: string;
  entityId: string;
  entityType: BondEntityType;
}) => {
  const { db } = assertDb();
  const [bond] = await db
    .select()
    .from(bonds)
    .where(
      and(eq(bonds.companyId, input.companyId), eq(bonds.entityId, input.entityId), eq(bonds.entityType, input.entityType))
    )
    .limit(1);

  return bond ?? null;
};

export const requestRetailerBond = async (input: { companyId: string; user: SessionUser }) => {
  const { db } = assertDb();
  const retailer = await resolveAuthenticatedRetailerProfile(input.user);
  await findCompanyById(input.companyId);

  const existing = await getBondByCompanyAndEntity({
    companyId: input.companyId,
    entityId: retailer.id,
    entityType: "retailer"
  });

  if (existing?.status === "pending") {
    throw bondError("CONFLICT", "bond_request_duplicate:pending");
  }

  if (existing?.status === "active") {
    throw bondError("CONFLICT", "bond_request_duplicate:active");
  }

  if (existing) {
    const [updated] = await db
      .update(bonds)
      .set({
        status: "pending",
        requestedByUserId: input.user.id,
        updatedAt: new Date()
      })
      .where(eq(bonds.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(bonds)
    .values({
      companyId: input.companyId,
      entityId: retailer.id,
      entityType: "retailer",
      status: "pending",
      requestedByUserId: input.user.id
    })
    .returning();

  return created;
};

export const decideRetailerBond = async (input: { bondId: string; action: BondDecisionAction; user: SessionUser }) => {
  const { db } = assertDb();
  const company = await resolveAuthenticatedCompanyProfile(input.user);
  const bond = await findBondById(input.bondId);

  if (bond.entityType !== "retailer") {
    throw bondError("BAD_REQUEST", "bond_decision_entity_type_invalid");
  }

  if (bond.companyId !== company.id) {
    throw bondError("FORBIDDEN", "bond_company_forbidden");
  }

  const nextStatus = input.action === "approve" ? "active" : "revoked";

  const [updated] = await db
    .update(bonds)
    .set({
      status: nextStatus,
      updatedAt: new Date()
    })
    .where(eq(bonds.id, bond.id))
    .returning();

  return updated;
};

const mapRetailerBonds = async (bondRows: BondRecord[]): Promise<BondListItem[]> => {
  const { db } = assertDb();
  if (bondRows.length === 0) return [];

  const ids = [...new Set(bondRows.map((bond) => bond.entityId))];
  const profiles = await db.select().from(retailers).where(inArray(retailers.id, ids));
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));

  return bondRows.map((bond) => {
    const entity = byId.get(bond.entityId);
    if (!entity) {
      throw bondError("INTERNAL_SERVER_ERROR", "bond_entity_profile_missing:retailer");
    }

    return {
      bondId: bond.id,
      companyId: bond.companyId,
      entityId: bond.entityId,
      entityType: bond.entityType,
      status: bond.status,
      requestedByUserId: bond.requestedByUserId,
      createdAt: toIso(bond.createdAt),
      updatedAt: toIso(bond.updatedAt),
      entityName: entity.name,
      entitySlug: entity.slug,
      entityLifecycle: entity.lifecycle
    };
  });
};

const mapDriverBonds = async (bondRows: BondRecord[]): Promise<BondListItem[]> => {
  const { db } = assertDb();
  if (bondRows.length === 0) return [];

  const ids = [...new Set(bondRows.map((bond) => bond.entityId))];
  const profiles = await db.select().from(drivers).where(inArray(drivers.id, ids));
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));

  return bondRows.map((bond) => {
    const entity = byId.get(bond.entityId);
    if (!entity) {
      throw bondError("INTERNAL_SERVER_ERROR", "bond_entity_profile_missing:driver");
    }

    return {
      bondId: bond.id,
      companyId: bond.companyId,
      entityId: bond.entityId,
      entityType: bond.entityType,
      status: bond.status,
      requestedByUserId: bond.requestedByUserId,
      createdAt: toIso(bond.createdAt),
      updatedAt: toIso(bond.updatedAt),
      entityName: entity.name,
      entityLifecycle: entity.lifecycle
    };
  });
};

export const listCompanyBondLists = async (user: SessionUser): Promise<CompanyBondLists> => {
  const { db } = assertDb();
  const company = await resolveAuthenticatedCompanyProfile(user);
  const rows = await db.select().from(bonds).where(eq(bonds.companyId, company.id));

  const pendingRetailerRows = rows.filter((bond) => bond.entityType === "retailer" && bond.status === "pending");
  const activeRetailerRows = rows.filter((bond) => bond.entityType === "retailer" && bond.status === "active");
  const activeDriverRows = rows.filter((bond) => bond.entityType === "driver" && bond.status === "active");

  return {
    pendingRetailers: await mapRetailerBonds(pendingRetailerRows),
    activeRetailers: await mapRetailerBonds(activeRetailerRows),
    activeDrivers: await mapDriverBonds(activeDriverRows)
  };
};

export const assertRetailerHasActiveBond = async (input: { companyId: string; user: SessionUser }) => {
  const retailer = await resolveAuthenticatedRetailerProfile(input.user);
  await findCompanyById(input.companyId);

  const bond = await getBondByCompanyAndEntity({
    companyId: input.companyId,
    entityId: retailer.id,
    entityType: "retailer"
  });

  if (!bond || bond.status !== "active") {
    throw bondError("FORBIDDEN", "bond_active_required:retailer_company");
  }

  return {
    ok: true as const,
    bondId: bond.id,
    companyId: bond.companyId,
    retailerId: retailer.id,
    status: "active" as const
  };
};
