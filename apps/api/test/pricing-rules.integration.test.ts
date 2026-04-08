import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { assertDb, pricingRules } from "@repo/db";
import { and, eq } from "drizzle-orm";
import { pricingRuleCreateSchema, pricingRuleListResultSchema, pricingRuleSchema, pricingRuleUpdateSchema } from "@repo/shared";
import * as stripeLib from "../src/lib/stripe";
import { buildApp } from "../src/index";

const registerAndLogin = async (
  app: FastifyInstance,
  input:
    | { role: "company"; name: string; email: string; companyName: string }
    | { role: "retailer"; name: string; email: string; retailerName: string }
    | { role: "driver"; name: string; email: string; driverName: string; phone: string }
) => {
  const agent = request.agent(app.server);
  const response = await agent
    .post("/api/auth/sign-up/email")
    .set("origin", "http://localhost:3000")
    .send({ ...input, password: "secret123" });

  expect(response.status, response.text).toBeLessThan(400);
  return agent;
};

const trpcJson = (response: request.Response) => {
  const body = JSON.parse(response.text);
  return body.result?.data?.json ?? body.result?.data ?? body;
};

const trpcErrorMessage = (response: request.Response) => {
  const body = JSON.parse(response.text);
  return body.error?.json?.message ?? body.error?.message ?? body.message ?? response.text;
};

const listUrl = (input?: object) =>
  input
    ? `/trpc/pricingRules.list?input=${encodeURIComponent(JSON.stringify(input))}`
    : "/trpc/pricingRules.list";

describe.skipIf(!process.env.DATABASE_URL)("pricing rules integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 30000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates, lists, updates company-scoped pricing rules with stable ordering", async () => {
    const { db } = assertDb();
    const suffix = Date.now();
    const syncSpy = vi
      .spyOn(stripeLib, "syncPricingRuleCatalog")
      .mockImplementation(async (input: stripeLib.SyncPricingRuleCatalogInput) => ({
      stripeProductId: `prod_sendro_${input.ruleId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
      stripePriceId: `price_sendro_${input.amountCents}`,
      mode: "stub"
    }));

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Pricing",
      email: `company.pricing.${suffix}@sendro.test`,
      companyName: "Company Pricing"
    });

    const secondCompanyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Pricing 2",
      email: `company.pricing.2.${suffix}@sendro.test`,
      companyName: "Company Pricing 2"
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const secondCompanyProfile = trpcJson(await secondCompanyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const createA = await companyAgent
      .post("/trpc/pricingRules.create")
      .set("origin", "http://localhost:3000")
      .send({
        region: "SP-CAPITAL",
        deliveryType: "same_day",
        weightMinGrams: 0,
        weightMaxGrams: 1000,
        amountCents: 1290,
        currency: "BRL"
      });
    expect(createA.status, createA.text).toBe(200);
    const createdA = pricingRuleSchema.parse(trpcJson(createA));
    expect(createdA.stripeProductId).toMatch(/^prod_sendro_/);
    expect(createdA.stripePriceId).toMatch(/^price_sendro_/);

    const createB = await companyAgent
      .post("/trpc/pricingRules.create")
      .set("origin", "http://localhost:3000")
      .send({
        region: "SP-CAPITAL",
        deliveryType: "same_day",
        weightMinGrams: 1001,
        weightMaxGrams: null,
        amountCents: 1990,
        currency: "BRL"
      });
    expect(createB.status, createB.text).toBe(200);
    const createdB = pricingRuleSchema.parse(trpcJson(createB));

    const createForeign = await secondCompanyAgent
      .post("/trpc/pricingRules.create")
      .set("origin", "http://localhost:3000")
      .send({
        region: "RJ-CAPITAL",
        deliveryType: "next_day",
        weightMinGrams: 0,
        weightMaxGrams: null,
        amountCents: 1490,
        currency: "BRL"
      });
    expect(createForeign.status, createForeign.text).toBe(200);

    const listResponse = await companyAgent.get(listUrl()).set("origin", "http://localhost:3000");
    expect(listResponse.status, listResponse.text).toBe(200);
    const list = pricingRuleListResultSchema.parse(trpcJson(listResponse));
    expect(list).toHaveLength(2);
    expect(list.map((row) => row.ruleId)).toEqual([createdA.ruleId, createdB.ruleId]);
    expect(list.every((row) => row.companyId === companyProfile.id)).toBe(true);

    const filteredListResponse = await companyAgent
      .get(listUrl({ region: "SP-CAPITAL", deliveryType: "same_day" }))
      .set("origin", "http://localhost:3000");
    expect(filteredListResponse.status, filteredListResponse.text).toBe(200);
    expect(pricingRuleListResultSchema.parse(trpcJson(filteredListResponse))).toHaveLength(2);

    const foreignListResponse = await secondCompanyAgent.get(listUrl()).set("origin", "http://localhost:3000");
    expect(foreignListResponse.status, foreignListResponse.text).toBe(200);
    const foreignList = pricingRuleListResultSchema.parse(trpcJson(foreignListResponse));
    expect(foreignList).toHaveLength(1);
    expect(foreignList[0].companyId).toBe(secondCompanyProfile.id);

    const updateResponse = await companyAgent
      .post("/trpc/pricingRules.update")
      .set("origin", "http://localhost:3000")
      .send({
        ruleId: createdA.ruleId,
        amountCents: 1390,
        weightMaxGrams: 1200
      });
    expect(updateResponse.status, updateResponse.text).toBe(200);
    const updated = pricingRuleSchema.parse(trpcJson(updateResponse));
    expect(updated.amountCents).toBe(1390);
    expect(updated.weightMaxGrams).toBe(1200);
    expect(updated.stripeProductId).toBe(createdA.stripeProductId);
    expect(updated.stripePriceId).toMatch(/^price_sendro_/);

    const [stored] = await db
      .select()
      .from(pricingRules)
      .where(and(eq(pricingRules.id, createdA.ruleId), eq(pricingRules.companyId, companyProfile.id)))
      .limit(1);

    expect(stored?.amountCents).toBe(1390);
    expect(stored?.weightMaxGrams).toBe(1200);
    expect(stored?.stripeProductId).toBe(updated.stripeProductId);
    expect(stored?.stripePriceId).toBe(updated.stripePriceId);
  }, 30000);

  it("blocks non-company roles and returns validation/conflict errors", async () => {
    const suffix = Date.now() + 1;
    const syncSpy = vi.spyOn(stripeLib, "syncPricingRuleCatalog").mockImplementation(async (input: stripeLib.SyncPricingRuleCatalogInput) => ({
      stripeProductId: `prod_sendro_${input.ruleId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
      stripePriceId: `price_sendro_${input.amountCents}`,
      mode: "stub"
    }));

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Pricing Auth",
      email: `company.pricing.auth.${suffix}@sendro.test`,
      companyName: "Company Pricing Auth"
    });

    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Pricing Auth",
      email: `retailer.pricing.auth.${suffix}@sendro.test`,
      retailerName: "Retailer Pricing Auth"
    });

    const driverAgent = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Pricing Auth",
      email: `driver.pricing.auth.${suffix}@sendro.test`,
      driverName: "Driver Pricing Auth",
      phone: `+5581${String(suffix).slice(-8)}`
    });

    const malformedInputs = [
      { region: "", deliveryType: "same_day", weightMinGrams: 0, weightMaxGrams: 1000, amountCents: 1000 },
      { region: "SP", deliveryType: "", weightMinGrams: 0, weightMaxGrams: 1000, amountCents: 1000 },
      { region: "SP", deliveryType: "same_day", weightMinGrams: 500, weightMaxGrams: 100, amountCents: 1000 },
      { region: "SP", deliveryType: "same_day", weightMinGrams: 0, weightMaxGrams: 1000, amountCents: -1 },
      { region: "X".repeat(121), deliveryType: "same_day", weightMinGrams: 0, weightMaxGrams: 1000, amountCents: 1000 }
    ];

    for (const payload of malformedInputs) {
      const response = await companyAgent
        .post("/trpc/pricingRules.create")
        .set("origin", "http://localhost:3000")
        .send(payload);
      expect(response.status, response.text).toBe(400);
    }

    const forbiddenRetailerCreate = await retailerAgent
      .post("/trpc/pricingRules.create")
      .set("origin", "http://localhost:3000")
      .send({
        region: "SP",
        deliveryType: "same_day",
        weightMinGrams: 0,
        weightMaxGrams: null,
        amountCents: 1000,
        currency: "BRL"
      });
    expect(forbiddenRetailerCreate.status).toBe(403);
    expect(trpcErrorMessage(forbiddenRetailerCreate)).toContain("bond_role_forbidden:company_required");

    const forbiddenDriverList = await driverAgent.get(listUrl()).set("origin", "http://localhost:3000");
    expect(forbiddenDriverList.status).toBe(403);
    expect(trpcErrorMessage(forbiddenDriverList)).toContain("bond_role_forbidden:company_required");

    const createValid = await companyAgent
      .post("/trpc/pricingRules.create")
      .set("origin", "http://localhost:3000")
      .send({
        region: "SP",
        deliveryType: "same_day",
        weightMinGrams: 0,
        weightMaxGrams: 5000,
        amountCents: 1800,
        currency: "BRL"
      });
    expect(createValid.status, createValid.text).toBe(200);

    const duplicate = await companyAgent
      .post("/trpc/pricingRules.create")
      .set("origin", "http://localhost:3000")
      .send({
        region: "SP",
        deliveryType: "same_day",
        weightMinGrams: 0,
        weightMaxGrams: 5000,
        amountCents: 2000,
        currency: "BRL"
      });

    expect(duplicate.status).toBe(409);
    expect(trpcErrorMessage(duplicate)).toContain("pricing_rules_conflict:duplicate_company_key");

    syncSpy.mockRejectedValueOnce(new stripeLib.PricingRuleCatalogSyncError("timeout", "pricing_rules_stripe_sync_failed:timeout"));

    const syncFailureResponse = await companyAgent
      .post("/trpc/pricingRules.create")
      .set("origin", "http://localhost:3000")
      .send({
        region: "MG",
        deliveryType: "same_day",
        weightMinGrams: 0,
        weightMaxGrams: 5000,
        amountCents: 1700,
        currency: "BRL"
      });

    expect(syncFailureResponse.status).toBe(500);
    expect(trpcErrorMessage(syncFailureResponse)).toContain("pricing_rules_stripe_sync_failed:timeout");
  }, 30000);

  it("keeps boundary contracts explicit for open-ended and exact range matching payloads", async () => {
    const parsedCreate = pricingRuleCreateSchema.parse({
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightMinGrams: 0,
      weightMaxGrams: null,
      amountCents: 1000,
      currency: "BRL"
    });

    expect(parsedCreate.weightMaxGrams).toBeNull();

    const parsedUpdate = pricingRuleUpdateSchema.parse({
      ruleId: "550e8400-e29b-41d4-a716-446655440000",
      weightMinGrams: 1000,
      weightMaxGrams: 1000,
      amountCents: 2000
    });

    expect(parsedUpdate.weightMinGrams).toBe(1000);
    expect(parsedUpdate.weightMaxGrams).toBe(1000);

    const parsedLegacyRule = pricingRuleSchema.parse({
      ruleId: "550e8400-e29b-41d4-a716-446655440001",
      companyId: "550e8400-e29b-41d4-a716-446655440002",
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightMinGrams: 0,
      weightMaxGrams: null,
      amountCents: 1000,
      currency: "BRL",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(parsedLegacyRule.stripeProductId).toBeNull();
    expect(parsedLegacyRule.stripePriceId).toBeNull();

    const invalidStripeIds = pricingRuleSchema.safeParse({
      ...parsedLegacyRule,
      stripeProductId: "",
      stripePriceId: "   "
    });

    expect(invalidStripeIds.success).toBe(false);

    const invalidRange = pricingRuleCreateSchema.safeParse({
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightMinGrams: 1001,
      weightMaxGrams: 1000,
      amountCents: 1000,
      currency: "BRL"
    });

    expect(invalidRange.success).toBe(false);
  });
});

describe("pricing rules deterministic stripe catalog sync", () => {
  it("returns deterministic stub catalog ids for the same payload", async () => {
    const input = {
      companyId: "company-123",
      ruleId: "rule-123",
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightMinGrams: 0,
      weightMaxGrams: 1000,
      amountCents: 1290,
      currency: "BRL" as const
    };

    const first = await stripeLib.syncPricingRuleCatalog(input);
    const second = await stripeLib.syncPricingRuleCatalog(input);

    expect(first.mode).toBe("stub");
    expect(first.stripeProductId).toMatch(/^prod_sendro_/);
    expect(first.stripePriceId).toMatch(/^price_sendro_/);
    expect(second).toEqual(first);
  });

  it("rejects malformed identity input in deterministic mode", async () => {
    await expect(
      stripeLib.syncPricingRuleCatalog({
        companyId: "   ",
        ruleId: "rule-123",
        region: "SP-CAPITAL",
        deliveryType: "same_day",
        weightMinGrams: 0,
        weightMaxGrams: 1000,
        amountCents: 1290,
        currency: "BRL"
      })
    ).rejects.toMatchObject({
      name: "PricingRuleCatalogSyncError",
      code: "pricing_rules_stripe_sync_failed",
      reason: "invalid_input"
    });
  });

  it("keeps deterministic stub mode independent from live stripe client failures", async () => {
    const stripeClient = {
      products: {
        create: vi.fn().mockRejectedValue(new Error("network down with sk_live_secret"))
      },
      prices: {
        retrieve: vi.fn(),
        create: vi.fn()
      }
    };

    const result = await stripeLib.syncPricingRuleCatalog({
      companyId: "company-123",
      ruleId: "rule-123",
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightMinGrams: 0,
      weightMaxGrams: 1000,
      amountCents: 1290,
      currency: "BRL",
      stripeClient,
      timeoutMs: 50
    });

    expect(result.mode).toBe("stub");
    expect(stripeClient.products.create).not.toHaveBeenCalled();
    expect(stripeClient.prices.create).not.toHaveBeenCalled();
    expect(stripeClient.prices.retrieve).not.toHaveBeenCalled();
  });
});
