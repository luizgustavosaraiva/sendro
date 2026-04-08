export const billingConnectStatusStates = ["not_connected", "pending_requirements", "connected"] as const;
export type BillingConnectStatusState = (typeof billingConnectStatusStates)[number];

export type BillingConnectStatus = {
  companyId: string;
  stripeAccountId: string | null;
  status: BillingConnectStatusState;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  connectedAt: string | null;
};

export type BillingConnectOnboardingCreateInput = {
  refreshUrl: string;
  returnUrl: string;
};

export type BillingConnectOnboardingCreateResult = {
  accountId: string;
  onboardingUrl: string;
  expiresAt: string | null;
  status: Exclude<BillingConnectStatusState, "not_connected">;
};
