import { createHash } from "node:crypto";
import Stripe from "stripe";
import type { EntityRole, PricingRuleCurrency } from "@repo/shared";
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

type PricingCatalogStripeClient = {
  products: {
    create: (params: Stripe.ProductCreateParams) => Promise<Stripe.Product>;
  };
  prices: {
    retrieve: (id: string) => Promise<Stripe.Price>;
    create: (params: Stripe.PriceCreateParams) => Promise<Stripe.Price>;
  };
};

export type SyncPricingRuleCatalogInput = {
  companyId: string;
  ruleId: string;
  region: string;
  deliveryType: string;
  weightMinGrams: number;
  weightMaxGrams: number | null;
  amountCents: number;
  currency: PricingRuleCurrency;
  existingStripeProductId?: string | null;
  existingStripePriceId?: string | null;
  timeoutMs?: number;
  stripeClient?: PricingCatalogStripeClient;
};

export type SyncPricingRuleCatalogResult = {
  stripeProductId: string;
  stripePriceId: string;
  mode: "stub" | "live";
};

export class PricingRuleCatalogSyncError extends Error {
  readonly code = "pricing_rules_stripe_sync_failed" as const;

  constructor(
    readonly reason: "invalid_input" | "timeout" | "malformed_response" | "live_sync_error" | "stub_derivation_failed",
    message: string
  ) {
    super(message);
    this.name = "PricingRuleCatalogSyncError";
  }
}

const stripe = env.STRIPE_API_KEY ? new Stripe(env.STRIPE_API_KEY) : null;
const isLocalStubKey = env.STRIPE_API_KEY?.startsWith("sk_test_sendro_") ?? false;
const isPricingCatalogStubMode = isLocalStubKey || !env.STRIPE_API_KEY;

const ensureStripeReady = (scope: string) => {
  if (!stripe && !isLocalStubKey) {
    throw new Error(`stripe_unavailable:${scope}`);
  }
};

const normalizeIdentity = (value: string, fieldName: string) => {
  const normalized = value.trim();
  if (!normalized) {
    throw new PricingRuleCatalogSyncError("invalid_input", `pricing_rules_stripe_sync_failed:invalid_input:${fieldName}`);
  }
  return normalized;
};

const toStableToken = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 24);

const stableDigest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);

const ensureCatalogId = (value: unknown, field: "stripeProductId" | "stripePriceId") => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PricingRuleCatalogSyncError(
      "malformed_response",
      `pricing_rules_stripe_sync_failed:malformed_response:${field}`
    );
  }

  return value;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, scope: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new PricingRuleCatalogSyncError("timeout", `pricing_rules_stripe_sync_failed:timeout:${scope}`));
    }, timeoutMs);
  });

  try {
    return (await Promise.race([promise, timeoutPromise])) as T;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const stubAccountIdForCompany = (companyId: string) =>
  `acct_sendro_${companyId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).padEnd(16, "0")}`;

const syncPricingRuleCatalogStub = (input: SyncPricingRuleCatalogInput): SyncPricingRuleCatalogResult => {
  const companyId = normalizeIdentity(input.companyId, "companyId");
  const ruleId = normalizeIdentity(input.ruleId, "ruleId");
  const region = normalizeIdentity(input.region, "region");
  const deliveryType = normalizeIdentity(input.deliveryType, "deliveryType");

  const productToken = toStableToken(`${companyId}_${ruleId}`);
  const priceDigest = stableDigest(
    JSON.stringify({
      companyId,
      ruleId,
      region,
      deliveryType,
      weightMinGrams: input.weightMinGrams,
      weightMaxGrams: input.weightMaxGrams,
      amountCents: input.amountCents,
      currency: input.currency
    })
  );

  const stripeProductId = `prod_sendro_${productToken}`;
  const stripePriceId = `price_sendro_${priceDigest}`;

  if (!stripeProductId || !stripePriceId) {
    throw new PricingRuleCatalogSyncError(
      "stub_derivation_failed",
      "pricing_rules_stripe_sync_failed:stub_derivation_failed"
    );
  }

  return {
    stripeProductId,
    stripePriceId,
    mode: "stub"
  };
};

export const syncPricingRuleCatalog = async (input: SyncPricingRuleCatalogInput): Promise<SyncPricingRuleCatalogResult> => {
  if (isLocalStubKey) {
    return syncPricingRuleCatalogStub(input);
  }

  ensureStripeReady("pricing_rule_catalog_sync");

  const timeoutMs = input.timeoutMs ?? 8_000;
  const stripeClient = input.stripeClient ?? stripe!;

  const companyId = normalizeIdentity(input.companyId, "companyId");
  const ruleId = normalizeIdentity(input.ruleId, "ruleId");
  const region = normalizeIdentity(input.region, "region");
  const deliveryType = normalizeIdentity(input.deliveryType, "deliveryType");

  try {
    let stripeProductId = input.existingStripeProductId?.trim();

    if (!stripeProductId) {
      const product = await withTimeout(
        stripeClient.products.create({
          name: `Pricing rule ${region} ${deliveryType}`,
          metadata: {
            companyId,
            ruleId,
            region,
            deliveryType
          }
        }),
        timeoutMs,
        "product_create"
      );

      stripeProductId = ensureCatalogId(product.id, "stripeProductId");
    }

    let stripePriceId = input.existingStripePriceId?.trim() ?? null;

    if (stripePriceId) {
      const existingPrice = await withTimeout(stripeClient.prices.retrieve(stripePriceId), timeoutMs, "price_retrieve");
      const existingCurrency = existingPrice.currency?.toUpperCase();
      const isSameContract =
        existingPrice.product === stripeProductId &&
        existingPrice.active &&
        existingPrice.unit_amount === input.amountCents &&
        existingCurrency === input.currency;

      if (!isSameContract) {
        stripePriceId = null;
      }
    }

    if (!stripePriceId) {
      const price = await withTimeout(
        stripeClient.prices.create({
          product: stripeProductId,
          unit_amount: input.amountCents,
          currency: input.currency.toLowerCase(),
          metadata: {
            companyId,
            ruleId,
            region,
            deliveryType,
            weightMinGrams: String(input.weightMinGrams),
            weightMaxGrams: input.weightMaxGrams === null ? "open" : String(input.weightMaxGrams)
          }
        }),
        timeoutMs,
        "price_create"
      );

      stripePriceId = ensureCatalogId(price.id, "stripePriceId");
    }

    return {
      stripeProductId: ensureCatalogId(stripeProductId, "stripeProductId"),
      stripePriceId: ensureCatalogId(stripePriceId, "stripePriceId"),
      mode: "live"
    };
  } catch (error) {
    if (error instanceof PricingRuleCatalogSyncError) {
      throw error;
    }

    throw new PricingRuleCatalogSyncError("live_sync_error", "pricing_rules_stripe_sync_failed:live_sync_error");
  }
};

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
