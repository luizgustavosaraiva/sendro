import Stripe from "stripe";
import type { EntityRole } from "@repo/shared";
import { env } from "../env";

export type StripeCustomerResult = {
  customerId: string | null;
  skipped: boolean;
};

export type StripeConnectAccountResult = {
  accountId: string;
  created: boolean;
};

export type StripeConnectOnboardingLinkResult = {
  onboardingUrl: string;
  expiresAt: string | null;
};

const stripe = env.STRIPE_API_KEY ? new Stripe(env.STRIPE_API_KEY) : null;
const isLocalStubKey = env.STRIPE_API_KEY?.startsWith("sk_test_sendro_") ?? false;

const ensureStripeReady = (scope: string) => {
  if (!stripe && !isLocalStubKey) {
    throw new Error(`stripe_unavailable:${scope}`);
  }
};

const stubAccountIdForCompany = (companyId: string) =>
  `acct_sendro_${companyId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).padEnd(16, "0")}`;

export const createStripeCustomerForRole = async (input: {
  role: EntityRole;
  email: string;
  name: string;
  userId: string;
}): Promise<StripeCustomerResult> => {
  if (input.role === "driver") {
    return { customerId: null, skipped: true };
  }

  ensureStripeReady(input.role);

  if (isLocalStubKey) {
    return {
      customerId: `cus_local_${input.role}_${input.userId.slice(0, 8)}`,
      skipped: false
    };
  }

  const customer = await stripe!.customers.create({
    email: input.email,
    name: input.name,
    metadata: {
      userId: input.userId,
      role: input.role
    }
  });

  return {
    customerId: customer.id,
    skipped: false
  };
};

export const getOrCreateStripeExpressAccount = async (input: {
  companyId: string;
  email: string;
  existingAccountId?: string | null;
}): Promise<StripeConnectAccountResult> => {
  ensureStripeReady("connect_account");

  if (input.existingAccountId) {
    return { accountId: input.existingAccountId, created: false };
  }

  if (isLocalStubKey) {
    return {
      accountId: stubAccountIdForCompany(input.companyId),
      created: true
    };
  }

  const account = await stripe!.accounts.create({
    type: "express",
    email: input.email,
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true }
    },
    metadata: {
      companyId: input.companyId
    }
  });

  return {
    accountId: account.id,
    created: true
  };
};

export const createStripeExpressAccountLink = async (input: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<StripeConnectOnboardingLinkResult> => {
  ensureStripeReady("connect_account_link");

  if (isLocalStubKey) {
    return {
      onboardingUrl: `${input.returnUrl}?stub_connect=1&account=${encodeURIComponent(input.accountId)}`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    };
  }

  const accountLink = await stripe!.accountLinks.create({
    account: input.accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding"
  });

  return {
    onboardingUrl: accountLink.url,
    expiresAt: accountLink.expires_at ? new Date(accountLink.expires_at * 1000).toISOString() : null
  };
};

export const verifyStripeWebhookEvent = (input: {
  payload: string | Buffer;
  signature?: string;
}): Stripe.Event => {
  if (isLocalStubKey) {
    if (input.signature !== "stub_signature_valid") {
      throw new Error("stripe_webhook_signature_invalid");
    }

    const json = typeof input.payload === "string" ? input.payload : input.payload.toString("utf8");
    return JSON.parse(json) as Stripe.Event;
  }

  if (!stripe || !env.STRIPE_CONNECT_WEBHOOK_SECRET) {
    throw new Error("stripe_webhook_unavailable");
  }

  if (!input.signature) {
    throw new Error("stripe_webhook_signature_missing");
  }

  return stripe.webhooks.constructEvent(input.payload, input.signature, env.STRIPE_CONNECT_WEBHOOK_SECRET);
};

export const isStripeStubMode = isLocalStubKey;
