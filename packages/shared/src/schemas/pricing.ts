import { z } from "zod";
import { pricingRuleCurrencies } from "../types/pricing";

const trimmedLabel = (max: number) => z.string().trim().min(1).max(max);

export const pricingRuleCurrencySchema = z.enum(pricingRuleCurrencies);

export const pricingRuleCreateSchema = z
  .object({
    region: trimmedLabel(120),
    deliveryType: trimmedLabel(80),
    weightMinGrams: z.number().int().nonnegative(),
    weightMaxGrams: z.number().int().positive().optional().nullable(),
    amountCents: z.number().int().nonnegative(),
    currency: pricingRuleCurrencySchema.default("BRL")
  })
  .superRefine((value, ctx) => {
    if (value.weightMaxGrams !== null && value.weightMaxGrams !== undefined && value.weightMinGrams > value.weightMaxGrams) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weightMaxGrams"],
        message: "pricing_rule_weight_range_invalid:min_gt_max"
      });
    }
  });

export const pricingRuleUpdateSchema = z
  .object({
    ruleId: z.string().uuid(),
    region: trimmedLabel(120).optional(),
    deliveryType: trimmedLabel(80).optional(),
    weightMinGrams: z.number().int().nonnegative().optional(),
    weightMaxGrams: z.number().int().positive().optional().nullable(),
    amountCents: z.number().int().nonnegative().optional(),
    currency: pricingRuleCurrencySchema.optional()
  })
  .superRefine((value, ctx) => {
    if (value.weightMinGrams !== undefined && value.weightMaxGrams !== undefined && value.weightMaxGrams !== null) {
      if (value.weightMinGrams > value.weightMaxGrams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["weightMaxGrams"],
          message: "pricing_rule_weight_range_invalid:min_gt_max"
        });
      }
    }
  });

export const pricingRuleListSchema = z.object({
  region: trimmedLabel(120).optional(),
  deliveryType: trimmedLabel(80).optional()
});

export const billingReportListSchema = z
  .object({
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(200).default(50)
  })
  .superRefine((value, ctx) => {
    if (new Date(value.periodStart).getTime() > new Date(value.periodEnd).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodEnd"],
        message: "billing_report_period_invalid:start_after_end"
      });
    }
  });

export const billingReportRowSchema = z.object({
  deliveryId: z.string().uuid(),
  companyId: z.string().uuid(),
  deliveredAt: z.string().datetime(),
  region: z.string().nullable(),
  deliveryType: z.string().nullable(),
  weightGrams: z.number().nonnegative().nullable(),
  matchedRuleId: z.string().uuid().nullable(),
  priceDiagnostic: z.string().min(1),
  grossRevenueCents: z.number().int().nonnegative(),
  netRevenueCents: z.number().int().nonnegative()
});

export const billingReportSummarySchema = z.object({
  generatedAt: z.string().datetime(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(200),
  totalRows: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  totals: z.object({
    grossRevenueCents: z.number().int().nonnegative(),
    netRevenueCents: z.number().int().nonnegative()
  }),
  rows: z.array(billingReportRowSchema)
});

export const pricingRuleSchema = z.object({
  ruleId: z.string().uuid(),
  companyId: z.string().uuid(),
  region: z.string(),
  deliveryType: z.string(),
  weightMinGrams: z.number().int().nonnegative(),
  weightMaxGrams: z.number().int().positive().nullable(),
  amountCents: z.number().int().nonnegative(),
  currency: pricingRuleCurrencySchema,
  stripeProductId: z.string().min(1).max(255).nullable().optional().default(null),
  stripePriceId: z.string().min(1).max(255).nullable().optional().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const pricingRuleListResultSchema = z.array(pricingRuleSchema);
