import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { assertDb, pricingRules } from "@repo/db";
import type { EntityRole, PricingRule, PricingRuleCreateInput, PricingRuleListInput, PricingRuleUpdateInput } from "@repo/shared";
import { resolveAuthenticatedCompanyProfile } from "./bonds";

type SessionUser = {
  id: string;
  role: EntityRole;
};

type PricingRuleRecord = typeof pricingRules.$inferSelect;

type DbError = {
  code?: string;
  constraint?: string;
  message?: string;
};

const pricingError = (code: TRPCError["code"], message: string) => new TRPCError({ code, message });
const toIso = (value: Date | string) => new Date(value).toISOString();

const mapPricingRule = (row: PricingRuleRecord): PricingRule => ({
  ruleId: row.id,
  companyId: row.companyId,
  region: row.region,
  deliveryType: row.deliveryType,
  weightMinGrams: row.weightMinGrams,
  weightMaxGrams: row.weightMaxGrams,
  amountCents: row.amountCents,
  currency: row.currency as PricingRule["currency"],
  stripeProductId: row.stripeProductId,
  stripePriceId: row.stripePriceId,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt)
});

const asDbError = (error: unknown): DbError => {
  if (!error || typeof error !== "object") {
    return {};
  }

  const base = error as DbError & { cause?: unknown };
  const cause = base.cause && typeof base.cause === "object" ? (base.cause as DbError) : undefined;

  return {
    code: base.code ?? cause?.code,
    constraint: base.constraint ?? cause?.constraint,
    message: base.message ?? cause?.message
  };
};

const mapMutationError = (error: unknown): never => {
  if (error instanceof TRPCError) {
    throw error;
  }

  const dbError = asDbError(error);
  const isConflict =
    dbError.code === "23505" ||
    dbError.constraint === "pricing_rules_company_key_unique" ||
    dbError.message?.includes("pricing_rules_company_key_unique") ||
    dbError.message?.toLowerCase().includes("duplicate key value violates unique constraint");

  if (isConflict) {
    throw pricingError("CONFLICT", "pricing_rules_conflict:duplicate_company_key");
  }

  throw pricingError("INTERNAL_SERVER_ERROR", "pricing_rules_write_failed");
};

export const listPricingRules = async (input: { user: SessionUser; filters?: PricingRuleListInput }) => {
  const { db } = assertDb();
  const company = await resolveAuthenticatedCompanyProfile(input.user);

  const predicates = [eq(pricingRules.companyId, company.id)];
  if (input.filters?.region) {
    predicates.push(eq(pricingRules.region, input.filters.region));
  }
  if (input.filters?.deliveryType) {
    predicates.push(eq(pricingRules.deliveryType, input.filters.deliveryType));
  }

  const rows = await db
    .select()
    .from(pricingRules)
    .where(and(...predicates))
    .orderBy(
      asc(pricingRules.region),
      asc(pricingRules.deliveryType),
      asc(pricingRules.weightMinGrams),
      asc(pricingRules.weightMaxGrams),
      asc(pricingRules.createdAt)
    );

  return rows.map(mapPricingRule);
};

export const createPricingRule = async (input: { user: SessionUser; data: PricingRuleCreateInput }) => {
  const { db } = assertDb();
  const company = await resolveAuthenticatedCompanyProfile(input.user);

  try {
    const [created] = await db
      .insert(pricingRules)
      .values({
        companyId: company.id,
        region: input.data.region,
        deliveryType: input.data.deliveryType,
        weightMinGrams: input.data.weightMinGrams,
        weightMaxGrams: input.data.weightMaxGrams ?? null,
        amountCents: input.data.amountCents,
        currency: input.data.currency ?? "BRL"
      })
      .returning();

    if (!created) {
      throw pricingError("INTERNAL_SERVER_ERROR", "pricing_rules_create_failed");
    }

    return mapPricingRule(created);
  } catch (error) {
    return mapMutationError(error);
  }
};

export const updatePricingRule = async (input: { user: SessionUser; data: PricingRuleUpdateInput }) => {
  const { db } = assertDb();
  const company = await resolveAuthenticatedCompanyProfile(input.user);

  const patch: Partial<typeof pricingRules.$inferInsert> = {
    updatedAt: new Date()
  };

  if (input.data.region !== undefined) patch.region = input.data.region;
  if (input.data.deliveryType !== undefined) patch.deliveryType = input.data.deliveryType;
  if (input.data.weightMinGrams !== undefined) patch.weightMinGrams = input.data.weightMinGrams;
  if (input.data.weightMaxGrams !== undefined) patch.weightMaxGrams = input.data.weightMaxGrams;
  if (input.data.amountCents !== undefined) patch.amountCents = input.data.amountCents;
  if (input.data.currency !== undefined) patch.currency = input.data.currency;

  try {
    const [updated] = await db
      .update(pricingRules)
      .set(patch)
      .where(and(eq(pricingRules.id, input.data.ruleId), eq(pricingRules.companyId, company.id)))
      .returning();

    if (!updated) {
      throw pricingError("NOT_FOUND", "pricing_rules_not_found");
    }

    return mapPricingRule(updated);
  } catch (error) {
    return mapMutationError(error);
  }
};
