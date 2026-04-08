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

export const pricingRuleSchema = z.object({
  ruleId: z.string().uuid(),
  companyId: z.string().uuid(),
  region: z.string(),
  deliveryType: z.string(),
  weightMinGrams: z.number().int().nonnegative(),
  weightMaxGrams: z.number().int().positive().nullable(),
  amountCents: z.number().int().nonnegative(),
  currency: pricingRuleCurrencySchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const pricingRuleListResultSchema = z.array(pricingRuleSchema);
