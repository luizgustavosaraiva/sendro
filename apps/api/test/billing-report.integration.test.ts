import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { assertDb, bonds, pricingRules, users } from "@repo/db";
import { eq } from "drizzle-orm";
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

const billingReportUrl = (input: object) =>
  `/trpc/billing.report?input=${encodeURIComponent(JSON.stringify(input))}`;

describe.skipIf(!process.env.DATABASE_URL)("billing report integration", () => {
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

  it("returns company-scoped paged billing rows with deterministic pricing diagnostics and totals", async () => {
    const { db } = assertDb();
    const suffix = Date.now();

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Billing Report",
      email: `company.billing.report.${suffix}@sendro.test`,
      companyName: "Company Billing Report"
    });

    const foreignCompanyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Billing Foreign",
      email: `company.billing.foreign.${suffix}@sendro.test`,
      companyName: "Company Billing Foreign"
    });

    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Billing Report",
      email: `retailer.billing.report.${suffix}@sendro.test`,
      retailerName: "Retailer Billing Report"
    });

    const driverAgent = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Billing Report",
      email: `driver.billing.report.${suffix}@sendro.test`,
      driverName: "Driver Billing Report",
      phone: `+5581${String(suffix).slice(-8)}`
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const retailerProfile = trpcJson(await retailerAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfile = trpcJson(await driverAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const [retailerUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, `retailer.billing.report.${suffix}@sendro.test`))
      .limit(1);

    await db.insert(bonds).values([
      {
        companyId: companyProfile.id,
        entityId: retailerProfile.id,
        entityType: "retailer",
        status: "active",
        requestedByUserId: retailerUser!.id
      },
      {
        companyId: companyProfile.id,
        entityId: driverProfile.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: retailerUser!.id
      }
    ]);

    const [pricingRule] = await db
      .insert(pricingRules)
      .values({
        companyId: companyProfile.id,
        region: "SP-CAPITAL",
        deliveryType: "same_day",
        weightMinGrams: 0,
        weightMaxGrams: 2000,
        amountCents: 2100,
        currency: "BRL"
      })
      .returning();

    const createAcceptComplete = async (externalReference: string, metadata: Record<string, unknown>) => {
      const createResponse = await retailerAgent
        .post("/trpc/deliveries.create")
        .set("origin", "http://localhost:3000")
        .send({
          companyId: companyProfile.id,
          externalReference,
          metadata
        });
      expect(createResponse.status, createResponse.text).toBe(200);
      const created = trpcJson(createResponse);

      const acceptResponse = await driverAgent
        .post("/trpc/deliveries.resolveOffer")
        .set("origin", "http://localhost:3000")
        .send({ deliveryId: created.deliveryId, decision: "accept" });
      expect(acceptResponse.status, acceptResponse.text).toBe(200);

      const completeResponse = await driverAgent
        .post("/trpc/deliveries.complete")
        .set("origin", "http://localhost:3000")
        .send({ deliveryId: created.deliveryId, proof: { note: "ok" } });
      expect(completeResponse.status, completeResponse.text).toBe(200);
      return created.deliveryId as string;
    };

    await createAcceptComplete(`BILLING-MATCHED-${suffix}`, {
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightGrams: 1200
    });
    await createAcceptComplete(`BILLING-NO-RULE-${suffix}`, {
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightGrams: 8000
    });
    await createAcceptComplete(`BILLING-MALFORMED-${suffix}`, {
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightGrams: "invalid"
    });

    const periodStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const page1Response = await companyAgent
      .get(billingReportUrl({ periodStart, periodEnd, page: 1, limit: 2 }))
      .set("origin", "http://localhost:3000");

    expect(page1Response.status, page1Response.text).toBe(200);
    const page1 = trpcJson(page1Response);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);
    expect(page1.totalRows).toBe(3);
    expect(page1.totalPages).toBe(2);
    expect(page1.rows).toHaveLength(2);
    expect(page1.totals.grossRevenueCents).toBe(2100);
    expect(page1.totals.netRevenueCents).toBe(2100);

    const page2Response = await companyAgent
      .get(billingReportUrl({ periodStart, periodEnd, page: 2, limit: 2 }))
      .set("origin", "http://localhost:3000");
    expect(page2Response.status, page2Response.text).toBe(200);
    const page2 = trpcJson(page2Response);
    expect(page2.rows).toHaveLength(1);

    const diagnostics = [...page1.rows, ...page2.rows].map((row: { priceDiagnostic: string }) => row.priceDiagnostic);
    expect(diagnostics).toContain(`matched_rule:${pricingRule.id}`);
    expect(diagnostics).toContain("fallback:no_pricing_rule_match");
    expect(diagnostics).toContain("fallback:delivery_metadata_unmatchable");

    const matchedRow = [...page1.rows, ...page2.rows].find(
      (row: { matchedRuleId: string | null }) => row.matchedRuleId === pricingRule.id
    );
    expect(matchedRow?.grossRevenueCents).toBe(2100);
    expect(matchedRow?.netRevenueCents).toBe(2100);

    const repeatResponse = await companyAgent
      .get(billingReportUrl({ periodStart, periodEnd, page: 1, limit: 2 }))
      .set("origin", "http://localhost:3000");
    expect(repeatResponse.status, repeatResponse.text).toBe(200);
    const repeat = trpcJson(repeatResponse);

    expect({ ...repeat, generatedAt: "ignored" }).toEqual({ ...page1, generatedAt: "ignored" });

    const beyondResponse = await companyAgent
      .get(billingReportUrl({ periodStart, periodEnd, page: 9, limit: 2 }))
      .set("origin", "http://localhost:3000");
    expect(beyondResponse.status, beyondResponse.text).toBe(200);
    const beyond = trpcJson(beyondResponse);
    expect(beyond.rows).toEqual([]);
    expect(beyond.totalRows).toBe(3);
    expect(beyond.totalPages).toBe(2);

    const foreignResponse = await foreignCompanyAgent
      .get(billingReportUrl({ periodStart, periodEnd, page: 1, limit: 50 }))
      .set("origin", "http://localhost:3000");
    expect(foreignResponse.status, foreignResponse.text).toBe(200);
    const foreignReport = trpcJson(foreignResponse);
    expect(foreignReport.totalRows).toBe(0);
    expect(foreignReport.rows).toEqual([]);
  }, 30000);

  it("rejects malformed billing report inputs and non-company access", async () => {
    const suffix = Date.now() + 1;

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Billing Guards",
      email: `company.billing.guards.${suffix}@sendro.test`,
      companyName: "Company Billing Guards"
    });

    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Billing Guards",
      email: `retailer.billing.guards.${suffix}@sendro.test`,
      retailerName: "Retailer Billing Guards"
    });

    const malformedPagination = await companyAgent
      .get(
        billingReportUrl({
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-01-31T23:59:59.999Z",
          page: 0,
          limit: 500
        })
      )
      .set("origin", "http://localhost:3000");
    expect(malformedPagination.status).toBe(400);

    const malformedPeriod = await companyAgent
      .get(
        billingReportUrl({
          periodStart: "2026-02-01T00:00:00.000Z",
          periodEnd: "2026-01-01T00:00:00.000Z"
        })
      )
      .set("origin", "http://localhost:3000");
    expect(malformedPeriod.status).toBe(400);

    const forbidden = await retailerAgent
      .get(
        billingReportUrl({
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-01-31T23:59:59.999Z"
        })
      )
      .set("origin", "http://localhost:3000");

    expect(forbidden.status).toBe(403);
    expect(trpcErrorMessage(forbidden)).toContain("bond_role_forbidden:company_required");
  }, 30000);
});
