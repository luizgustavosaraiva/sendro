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

export type BillingReportListInput = {
  periodStart: string;
  periodEnd: string;
  page?: number;
  limit?: number;
};

export type BillingReportRow = {
  deliveryId: string;
  companyId: string;
  deliveredAt: string;
  region: string | null;
  deliveryType: string | null;
  weightGrams: number | null;
  matchedRuleId: string | null;
  priceDiagnostic: string;
  grossRevenueCents: number;
  netRevenueCents: number;
};

export type BillingReportSummary = {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  page: number;
  limit: number;
  totalRows: number;
  totalPages: number;
  totals: {
    grossRevenueCents: number;
    netRevenueCents: number;
  };
  rows: BillingReportRow[];
};
