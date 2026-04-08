type PricingRuleLike = {
  id: string;
  weightMinGrams: number;
  weightMaxGrams: number | null;
  amountCents: number;
  createdAt: Date | string;
};

export type DeliveryPricingAttributes = {
  region: string;
  deliveryType: string;
  weightGrams: number;
};

export type PricingMatchResult = {
  amountCents: number;
  diagnostic: string;
  matchedRuleId: string | null;
  fallbackApplied: boolean;
};

const asMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const resolveDeliveryPricingAttributes = (deliveryMetadata: unknown): DeliveryPricingAttributes | null => {
  const metadata = asMetadata(deliveryMetadata);
  const region = asString(metadata.region) ?? asString(metadata.pricingRegion) ?? asString(metadata.destinationRegion);
  const deliveryType =
    asString(metadata.deliveryType) ?? asString(metadata.delivery_type) ?? asString(metadata.serviceLevel);
  const weightGrams =
    asFiniteNumber(metadata.weightGrams) ??
    asFiniteNumber(metadata.weight_grams) ??
    asFiniteNumber(metadata.packageWeightGrams);

  if (!region || !deliveryType || weightGrams === null || weightGrams < 0) {
    return null;
  }

  return {
    region,
    deliveryType,
    weightGrams
  };
};

export const chooseBestPricingRule = <T extends PricingRuleLike>(rows: T[]): T | null => {
  if (rows.length === 0) {
    return null;
  }

  const sorted = [...rows].sort((left, right) => {
    const leftSpan = (left.weightMaxGrams ?? Number.MAX_SAFE_INTEGER) - left.weightMinGrams;
    const rightSpan = (right.weightMaxGrams ?? Number.MAX_SAFE_INTEGER) - right.weightMinGrams;

    if (leftSpan !== rightSpan) return leftSpan - rightSpan;
    if (left.weightMinGrams !== right.weightMinGrams) return right.weightMinGrams - left.weightMinGrams;
    if ((left.weightMaxGrams ?? Number.MAX_SAFE_INTEGER) !== (right.weightMaxGrams ?? Number.MAX_SAFE_INTEGER)) {
      return (left.weightMaxGrams ?? Number.MAX_SAFE_INTEGER) - (right.weightMaxGrams ?? Number.MAX_SAFE_INTEGER);
    }

    const createdAtDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (createdAtDiff !== 0) return createdAtDiff;

    return left.id.localeCompare(right.id);
  });

  return sorted[0] ?? null;
};

export const resolvePricingMatch = <T extends PricingRuleLike>(input: {
  deliveryMetadata: unknown;
  candidateRules: T[];
}): PricingMatchResult => {
  const attributes = resolveDeliveryPricingAttributes(input.deliveryMetadata);
  if (!attributes) {
    return {
      amountCents: 0,
      diagnostic: "fallback:delivery_metadata_unmatchable",
      matchedRuleId: null,
      fallbackApplied: true
    };
  }

  const matchedRule = chooseBestPricingRule(input.candidateRules);
  if (!matchedRule) {
    return {
      amountCents: 0,
      diagnostic: "fallback:no_pricing_rule_match",
      matchedRuleId: null,
      fallbackApplied: true
    };
  }

  return {
    amountCents: matchedRule.amountCents,
    diagnostic: `matched_rule:${matchedRule.id}`,
    matchedRuleId: matchedRule.id,
    fallbackApplied: false
  };
};
