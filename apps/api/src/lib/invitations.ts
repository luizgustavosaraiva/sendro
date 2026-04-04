import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { assertDb, bonds, companies, invitations } from "@repo/db";
import type {
  CreateInvitationInput,
  EntityRole,
  InvitationListItem,
  LookupInvitationResult,
  RedeemInvitationResult
} from "@repo/shared";
import {
  getBondByCompanyAndEntity,
  requireRole,
  resolveAuthenticatedCompanyProfile,
  resolveAuthenticatedDriverProfile
} from "./bonds";

type SessionUser = {
  id: string;
  role: EntityRole;
};

type InvitationRecord = typeof invitations.$inferSelect;
type CompanyRecord = typeof companies.$inferSelect;
type BondRecord = typeof bonds.$inferSelect;

type InvitationWithCompany = InvitationRecord & {
  company: CompanyRecord;
};

const DEFAULT_EXPIRATION_HOURS = 72;

const toIso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);

const invitationError = (code: TRPCError["code"], message: string) => new TRPCError({ code, message });

const tokenLength = 24;
const generateInvitationToken = () => randomBytes(tokenLength).toString("base64url");

const normalizeExpiry = (expiresAt?: string) => {
  if (!expiresAt) {
    return new Date(Date.now() + DEFAULT_EXPIRATION_HOURS * 60 * 60 * 1000);
  }

  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    throw invitationError("BAD_REQUEST", "invitation_expires_at_invalid");
  }

  if (parsed.getTime() <= Date.now()) {
    throw invitationError("BAD_REQUEST", "invitation_expires_at_past");
  }

  return parsed;
};

const mapInvitation = (invitation: InvitationRecord): InvitationListItem => ({
  invitationId: invitation.id,
  companyId: invitation.companyId,
  token: invitation.token,
  channel: invitation.channel,
  status: invitation.status,
  invitedContact: invitation.invitedContact,
  expiresAt: new Date(invitation.expiresAt).toISOString(),
  acceptedAt: toIso(invitation.acceptedAt),
  createdByUserId: invitation.createdByUserId,
  createdAt: new Date(invitation.createdAt).toISOString(),
  updatedAt: new Date(invitation.updatedAt).toISOString()
});

const mapLookupInvitation = (row: InvitationWithCompany): LookupInvitationResult => ({
  invitationId: row.id,
  companyId: row.companyId,
  companyName: row.company.name,
  companySlug: row.company.slug,
  token: row.token,
  channel: row.channel,
  status: row.status,
  invitedContact: row.invitedContact,
  expiresAt: new Date(row.expiresAt).toISOString(),
  acceptedAt: toIso(row.acceptedAt)
});

const markExpiredIfNeeded = async (row: InvitationRecord) => {
  const { db } = assertDb();
  if (row.status !== "pending") {
    return row;
  }

  if (new Date(row.expiresAt).getTime() > Date.now()) {
    return row;
  }

  const [expired] = await db
    .update(invitations)
    .set({
      status: "expired",
      updatedAt: new Date()
    })
    .where(eq(invitations.id, row.id))
    .returning();

  return expired ?? row;
};

const findInvitationByToken = async (token: string): Promise<InvitationRecord> => {
  const { db } = assertDb();
  const [invitation] = await db.select().from(invitations).where(eq(invitations.token, token)).limit(1);

  if (!invitation) {
    throw invitationError("NOT_FOUND", "invitation_token_not_found");
  }

  return markExpiredIfNeeded(invitation);
};

const findInvitationWithCompanyByToken = async (token: string): Promise<InvitationWithCompany> => {
  const { db } = assertDb();
  const row = await db.query.invitations.findFirst({
    where: eq(invitations.token, token),
    with: {
      company: true
    }
  });

  if (!row?.company) {
    throw invitationError("NOT_FOUND", "invitation_token_not_found");
  }

  const invitation = await markExpiredIfNeeded(row);
  return {
    ...invitation,
    company: row.company
  };
};

const assertRedeemableInvitation = (invitation: InvitationRecord) => {
  if (invitation.status === "accepted") {
    throw invitationError("CONFLICT", "invitation_token_already_accepted");
  }

  if (invitation.status === "revoked") {
    throw invitationError("FORBIDDEN", "invitation_token_revoked");
  }

  if (invitation.status === "expired") {
    throw invitationError("FORBIDDEN", "invitation_token_expired");
  }

  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    throw invitationError("FORBIDDEN", "invitation_token_expired");
  }
};

export const createCompanyInvitation = async (input: { user: SessionUser; data: CreateInvitationInput }) => {
  const { db } = assertDb();
  const company = await resolveAuthenticatedCompanyProfile(input.user);
  const expiresAt = normalizeExpiry(input.data.expiresAt);
  const token = generateInvitationToken();

  const [created] = await db
    .insert(invitations)
    .values({
      companyId: company.id,
      token,
      channel: input.data.channel,
      invitedContact: input.data.invitedContact?.trim() || null,
      expiresAt,
      createdByUserId: input.user.id
    })
    .returning();

  return mapInvitation(created);
};

export const listCompanyInvitations = async (user: SessionUser): Promise<InvitationListItem[]> => {
  const { db } = assertDb();
  const company = await resolveAuthenticatedCompanyProfile(user);

  await db
    .update(invitations)
    .set({
      status: "expired",
      updatedAt: new Date()
    })
    .where(and(eq(invitations.companyId, company.id), eq(invitations.status, "pending"), sql`${invitations.expiresAt} <= now()`));

  const rows = await db
    .select()
    .from(invitations)
    .where(eq(invitations.companyId, company.id))
    .orderBy(desc(invitations.createdAt));

  return rows.map(mapInvitation);
};

export const lookupInvitationByToken = async (token: string): Promise<LookupInvitationResult> => {
  const row = await findInvitationWithCompanyByToken(token);
  return mapLookupInvitation(row);
};

export const redeemInvitation = async (input: { user: SessionUser; token: string }): Promise<RedeemInvitationResult> => {
  const { db } = assertDb();
  requireRole(input.user, "driver");
  const driver = await resolveAuthenticatedDriverProfile(input.user);
  const invitation = await findInvitationByToken(input.token);

  assertRedeemableInvitation(invitation);

  return db.transaction(async (tx) => {
    const lockedInvitationRows = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitation.id))
      .for("update");

    const lockedInvitation = lockedInvitationRows[0];
    if (!lockedInvitation) {
      throw invitationError("NOT_FOUND", "invitation_token_not_found");
    }

    const normalizedInvitation = await markExpiredIfNeeded(lockedInvitation);
    assertRedeemableInvitation(normalizedInvitation);

    const existingBond = await getBondByCompanyAndEntity({
      companyId: normalizedInvitation.companyId,
      entityId: driver.id,
      entityType: "driver"
    });

    let bond: BondRecord;
    let bondAction: "created" | "reactivated" | "reused";

    if (!existingBond) {
      const [createdBond] = await tx
        .insert(bonds)
        .values({
          companyId: normalizedInvitation.companyId,
          entityId: driver.id,
          entityType: "driver",
          status: "active",
          requestedByUserId: input.user.id
        })
        .returning();
      bond = createdBond;
      bondAction = "created";
    } else if (existingBond.status === "active") {
      bond = existingBond;
      bondAction = "reused";
    } else {
      const [reactivatedBond] = await tx
        .update(bonds)
        .set({
          status: "active",
          requestedByUserId: input.user.id,
          updatedAt: new Date()
        })
        .where(eq(bonds.id, existingBond.id))
        .returning();
      bond = reactivatedBond;
      bondAction = "reactivated";
    }

    const acceptedAt = new Date();
    const [acceptedInvitation] = await tx
      .update(invitations)
      .set({
        status: "accepted",
        acceptedAt,
        updatedAt: acceptedAt
      })
      .where(eq(invitations.id, normalizedInvitation.id))
      .returning();

    return {
      invitationId: acceptedInvitation.id,
      companyId: acceptedInvitation.companyId,
      driverId: driver.id,
      bondId: bond.id,
      invitationStatus: "accepted",
      bondStatus: "active",
      diagnostics: {
        bondAction
      }
    };
  });
};
