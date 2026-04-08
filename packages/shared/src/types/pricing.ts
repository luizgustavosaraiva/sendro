export const pricingRuleCurrencies = ["BRL"] as const;
export type PricingRuleCurrency = (typeof pricingRuleCurrencies)[number];

export type PricingRule = {
  ruleId: string;
  companyId: string;
  region: string;
  deliveryType: string;
  weightMinGrams: number;
  weightMaxGrams: number | null;
  amountCents: number;
  currency: PricingRuleCurrency;
  createdAt: string;
  updatedAt: string;
};

export type PricingRuleCreateInput = {
  region: string;
  deliveryType: string;
  weightMinGrams: number;
  weightMaxGrams?: number | null;
  amountCents: number;
  currency?: PricingRuleCurrency;
};

export type PricingRuleUpdateInput = {
  ruleId: string;
  region?: string;
  deliveryType?: string;
  weightMinGrams?: number;
  weightMaxGrams?: number | null;
  amountCents?: number;
  currency?: PricingRuleCurrency;
};

export type PricingRuleListInput = {
  region?: string;
  deliveryType?: string;
};
