import { z } from "zod";
import { billingConnectStatusStates } from "../types/billing-connect";

export const billingConnectStatusStateSchema = z.enum(billingConnectStatusStates);

export const billingConnectStatusSchema = z.object({
  companyId: z.string().uuid(),
  stripeAccountId: z.string().min(1).max(255).nullable(),
  status: billingConnectStatusStateSchema,
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  connectedAt: z.string().datetime().nullable()
});

export const billingConnectOnboardingCreateSchema = z.object({
  refreshUrl: z.string().url(),
  returnUrl: z.string().url()
});

export const billingConnectOnboardingCreateResultSchema = z.object({
  accountId: z.string().min(1).max(255),
  onboardingUrl: z.string().url(),
  expiresAt: z.string().datetime().nullable(),
  status: z.enum(["pending_requirements", "connected"])
});
