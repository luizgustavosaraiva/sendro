import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { assertDb, companies } from "@repo/db";
import type { BillingConnectOnboardingCreateInput, BillingConnectOnboardingCreateResult, BillingConnectStatus, EntityRole } from "@repo/shared";
import { createStripeExpressAccountLink, getOrCreateStripeExpressAccount } from "./stripe";

type SessionUser = {
  id: string;
  role: EntityRole;
  email?: string | null;
};

type CompanyRecord = typeof companies.$inferSelect;

const connectError = (code: TRPCError["code"], message: string) => new TRPCError({ code, message });

const toIso = (value: Date | string) => new Date(value).toISOString();

const requireCompanyRole = (user: SessionUser) => {
  if (user.role !== "company") {
    throw connectError("FORBIDDEN", "bond_role_forbidden:company_required");
  }
};

const resolveCompanyForUser = async (user: SessionUser): Promise<CompanyRecord> => {
  requireCompanyRole(user);
  const { db } = assertDb();

  const [company] = await db.select().from(companies).where(eq(companies.userId, user.id)).limit(1);
  if (!company) {
    throw connectError("NOT_FOUND", "billing_connect_company_not_found");
  }

  return company;
};

const mapStatus = (company: CompanyRecord): BillingConnectStatus => {
  const chargesEnabled = company.stripeChargesEnabled === true;
  const payoutsEnabled = company.stripePayoutsEnabled === true;
  const connected = chargesEnabled && payoutsEnabled;

  return {
    companyId: company.id,
    stripeAccountId: company.stripeAccountId ?? null,
    status: connected ? "connected" : company.stripeAccountId ? "pending_requirements" : "not_connected",
    chargesEnabled,
    payoutsEnabled,
    connectedAt: company.stripeConnectedAt ? toIso(company.stripeConnectedAt) : null
  };
};

export const getBillingConnectStatusForUser = async (user: SessionUser): Promise<BillingConnectStatus> => {
  const company = await resolveCompanyForUser(user);
  return mapStatus(company);
};

export const createBillingConnectOnboardingForUser = async (input: {
  user: SessionUser;
  data: BillingConnectOnboardingCreateInput;
}): Promise<BillingConnectOnboardingCreateResult> => {
  const { db } = assertDb();
  const company = await resolveCompanyForUser(input.user);

  const account = await getOrCreateStripeExpressAccount({
    companyId: company.id,
    email: input.user.email ?? `${company.slug}@sendro.local`,
    existingAccountId: company.stripeAccountId
  });

  if (account.created || !company.stripeAccountId) {
    await db
      .update(companies)
      .set({
        stripeAccountId: account.accountId,
        updatedAt: new Date()
      })
      .where(eq(companies.id, company.id));
  }

  const accountLink = await createStripeExpressAccountLink({
    accountId: account.accountId,
    refreshUrl: input.data.refreshUrl,
    returnUrl: input.data.returnUrl
  });

  return {
    accountId: account.accountId,
    onboardingUrl: accountLink.onboardingUrl,
    expiresAt: accountLink.expiresAt,
    status: company.stripeChargesEnabled === true && company.stripePayoutsEnabled === true ? "connected" : "pending_requirements"
  };
};

export const applyStripeAccountUpdated = async (input: {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}) => {
  const { db } = assertDb();

  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.stripeAccountId, input.stripeAccountId)))
    .limit(1);

  if (!company) {
    return { handled: false as const, reason: "company_not_found" as const };
  }

  const nextChargesEnabled = company.stripeChargesEnabled === true || input.chargesEnabled;
  const nextPayoutsEnabled = company.stripePayoutsEnabled === true || input.payoutsEnabled;
  const shouldSetConnectedAt = nextChargesEnabled && nextPayoutsEnabled && !company.stripeConnectedAt;

  await db
    .update(companies)
    .set({
      stripeChargesEnabled: nextChargesEnabled,
      stripePayoutsEnabled: nextPayoutsEnabled,
      stripeConnectedAt: shouldSetConnectedAt ? new Date() : company.stripeConnectedAt,
      updatedAt: new Date()
    })
    .where(eq(companies.id, company.id));

  return {
    handled: true as const,
    companyId: company.id,
    connected: nextChargesEnabled && nextPayoutsEnabled
  };
};
