import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import {
  billingConnectOnboardingCreateResultSchema,
  billingConnectStatusSchema,
  billingConnectOnboardingCreateSchema
} from "@repo/shared";
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

describe.skipIf(!process.env.DATABASE_URL)("stripe connect integration", () => {
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

  it("creates onboarding links for company users without setting connected=true directly", async () => {
    const suffix = Date.now();
    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Connect",
      email: `company.connect.${suffix}@sendro.test`,
      companyName: "Company Connect"
    });

    const payload = billingConnectOnboardingCreateSchema.parse({
      refreshUrl: "http://localhost:3000/dashboard/billing/connect?refresh=1",
      returnUrl: "http://localhost:3000/dashboard/billing/connect?return=1"
    });

    const onboardingResponse = await companyAgent
      .post("/trpc/billing.connectStripe")
      .set("origin", "http://localhost:3000")
      .send(payload);

    expect(onboardingResponse.status, onboardingResponse.text).toBe(200);
    const onboardingResult = billingConnectOnboardingCreateResultSchema.parse(trpcJson(onboardingResponse));

    expect(onboardingResult.accountId).toContain("acct_");
    expect(onboardingResult.onboardingUrl).toContain("stub_connect=1");
    expect(onboardingResult.status).toBe("pending_requirements");

    const statusResponse = await companyAgent.get("/trpc/billing.connectStatus").set("origin", "http://localhost:3000");
    expect(statusResponse.status, statusResponse.text).toBe(200);

    const status = billingConnectStatusSchema.parse(trpcJson(statusResponse));
    expect(status.status).toBe("pending_requirements");
    expect(status.chargesEnabled).toBe(false);
    expect(status.payoutsEnabled).toBe(false);
    expect(status.connectedAt).toBeNull();
  }, 30000);

  it("forbids non-company users from billing connect procedures", async () => {
    const suffix = Date.now() + 1;

    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Connect",
      email: `retailer.connect.${suffix}@sendro.test`,
      retailerName: "Retailer Connect"
    });

    const connectResponse = await retailerAgent
      .post("/trpc/billing.connectStripe")
      .set("origin", "http://localhost:3000")
      .send({
        refreshUrl: "http://localhost:3000/dashboard/billing/connect?refresh=1",
        returnUrl: "http://localhost:3000/dashboard/billing/connect?return=1"
      });

    expect(connectResponse.status, connectResponse.text).toBe(403);
    expect(trpcErrorMessage(connectResponse)).toContain("bond_role_forbidden:company_required");

    const statusResponse = await retailerAgent.get("/trpc/billing.connectStatus").set("origin", "http://localhost:3000");
    expect(statusResponse.status, statusResponse.text).toBe(403);
    expect(trpcErrorMessage(statusResponse)).toContain("bond_role_forbidden:company_required");
  }, 30000);

  it("updates status only after full webhook capability truth and tolerates partial updates", async () => {
    const suffix = Date.now() + 2;

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Connect Webhook",
      email: `company.connect.webhook.${suffix}@sendro.test`,
      companyName: "Company Connect Webhook"
    });

    const connectResponse = await companyAgent
      .post("/trpc/billing.connectStripe")
      .set("origin", "http://localhost:3000")
      .send({
        refreshUrl: "http://localhost:3000/dashboard/billing/connect?refresh=1",
        returnUrl: "http://localhost:3000/dashboard/billing/connect?return=1"
      });

    expect(connectResponse.status, connectResponse.text).toBe(200);
    const connectResult = billingConnectOnboardingCreateResultSchema.parse(trpcJson(connectResponse));

    const partialEvent = {
      id: "evt_test_partial",
      object: "event",
      type: "account.updated",
      data: {
        object: {
          id: connectResult.accountId,
          object: "account",
          charges_enabled: true,
          payouts_enabled: false
        }
      }
    };

    const partialWebhook = await request(app.server)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "stub_signature_valid")
      .set("content-type", "application/json")
      .send(partialEvent);

    expect(partialWebhook.status, partialWebhook.text).toBe(200);

    const partialStatusResponse = await companyAgent.get("/trpc/billing.connectStatus").set("origin", "http://localhost:3000");
    const partialStatus = billingConnectStatusSchema.parse(trpcJson(partialStatusResponse));

    expect(partialStatus.status).toBe("pending_requirements");
    expect(partialStatus.chargesEnabled).toBe(true);
    expect(partialStatus.payoutsEnabled).toBe(false);
    expect(partialStatus.connectedAt).toBeNull();

    const fullEvent = {
      id: "evt_test_full",
      object: "event",
      type: "account.updated",
      data: {
        object: {
          id: connectResult.accountId,
          object: "account",
          charges_enabled: true,
          payouts_enabled: true
        }
      }
    };

    const fullWebhook = await request(app.server)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "stub_signature_valid")
      .set("content-type", "application/json")
      .send(fullEvent);

    expect(fullWebhook.status, fullWebhook.text).toBe(200);

    const fullStatusResponse = await companyAgent.get("/trpc/billing.connectStatus").set("origin", "http://localhost:3000");
    const fullStatus = billingConnectStatusSchema.parse(trpcJson(fullStatusResponse));

    expect(fullStatus.status).toBe("connected");
    expect(fullStatus.chargesEnabled).toBe(true);
    expect(fullStatus.payoutsEnabled).toBe(true);
    expect(fullStatus.connectedAt).not.toBeNull();
  }, 30000);

  it("rejects webhook payloads with invalid signatures", async () => {
    const invalidWebhook = await request(app.server)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "invalid_signature")
      .set("content-type", "application/json")
      .send({
        id: "evt_bad_sig",
        object: "event",
        type: "account.updated",
        data: {
          object: {
            id: "acct_sendro_invalid",
            charges_enabled: true,
            payouts_enabled: true
          }
        }
      });

    expect(invalidWebhook.status, invalidWebhook.text).toBe(400);
    expect(invalidWebhook.body).toMatchObject({ ok: false, error: "invalid_signature" });
  }, 30000);
});
