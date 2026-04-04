import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { assertDb, bonds, companies, drivers, users } from "@repo/db";
import { and, eq } from "drizzle-orm";
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

const gateUrl = (companyId: string) => `/trpc/bonds.assertRetailerCompanyActiveBond?input=${encodeURIComponent(JSON.stringify({ companyId }))}`;

describe.skipIf(!process.env.DATABASE_URL)("bonds integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 30000);

  it("supports retailer request, company approval, company list, driver list, and active-bond gate", async () => {
    const { db } = assertDb();
    const suffix = Date.now();

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Bonds",
      email: `company.${suffix}@sendro.test`,
      companyName: "Company Bonds"
    });

    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Bonds",
      email: `retailer.${suffix}@sendro.test`,
      retailerName: "Retailer Bonds"
    });

    const driverAgent = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Bonds",
      email: `driver.${suffix}@sendro.test`,
      driverName: "Driver Bonds",
      phone: `+5511${String(suffix).slice(-8)}`
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const retailerProfile = trpcJson(await retailerAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfile = trpcJson(await driverAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const initialList = await companyAgent.get("/trpc/bonds.listCompanyBonds").set("origin", "http://localhost:3000");
    expect(initialList.status, initialList.text).toBe(200);
    expect(trpcJson(initialList)).toEqual({ pendingRetailers: [], activeRetailers: [], activeDrivers: [] });

    const requestResponse = await retailerAgent
      .post("/trpc/bonds.requestRetailerBond")
      .set("origin", "http://localhost:3000")
      .send({ companyId: companyProfile.id });
    expect(requestResponse.status, requestResponse.text).toBe(200);

    const requestedBond = trpcJson(requestResponse);
    expect(requestedBond.status).toBe("pending");
    expect(requestedBond.companyId).toBe(companyProfile.id);
    expect(requestedBond.entityId).toBe(retailerProfile.id);

    const gateBeforeApproval = await retailerAgent.get(gateUrl(companyProfile.id)).set("origin", "http://localhost:3000");
    expect(gateBeforeApproval.status).toBe(403);
    expect(trpcErrorMessage(gateBeforeApproval)).toContain("bond_active_required:retailer_company");

    const pendingList = await companyAgent.get("/trpc/bonds.listCompanyBonds").set("origin", "http://localhost:3000");
    expect(trpcJson(pendingList).pendingRetailers).toHaveLength(1);
    expect(trpcJson(pendingList).activeRetailers).toHaveLength(0);

    const [driverUser] = await db.select().from(users).where(eq(users.email, `driver.${suffix}@sendro.test`)).limit(1);
    const [companyRow] = await db.select().from(companies).where(eq(companies.id, companyProfile.id)).limit(1);
    const [driverRow] = await db.select().from(drivers).where(eq(drivers.id, driverProfile.id)).limit(1);
    expect(driverUser && companyRow && driverRow).toBeTruthy();

    await db.insert(bonds).values({
      companyId: companyRow!.id,
      entityId: driverRow!.id,
      entityType: "driver",
      status: "active",
      requestedByUserId: driverUser!.id
    });

    const approveResponse = await companyAgent
      .post("/trpc/bonds.decideRetailerBond")
      .set("origin", "http://localhost:3000")
      .send({ bondId: requestedBond.id, action: "approve" });
    expect(approveResponse.status, approveResponse.text).toBe(200);
    expect(trpcJson(approveResponse).status).toBe("active");

    const listed = trpcJson(await companyAgent.get("/trpc/bonds.listCompanyBonds").set("origin", "http://localhost:3000"));
    expect(listed.pendingRetailers).toHaveLength(0);
    expect(listed.activeRetailers).toHaveLength(1);
    expect(listed.activeRetailers[0]).toMatchObject({ entityId: retailerProfile.id, entityName: "Retailer Bonds", entityType: "retailer", status: "active" });
    expect(listed.activeDrivers).toHaveLength(1);
    expect(listed.activeDrivers[0]).toMatchObject({ entityId: driverProfile.id, entityName: "Driver Bonds", entityType: "driver", status: "active" });

    const gateAfterApproval = await retailerAgent.get(gateUrl(companyProfile.id)).set("origin", "http://localhost:3000");
    expect(gateAfterApproval.status, gateAfterApproval.text).toBe(200);
    expect(trpcJson(gateAfterApproval)).toMatchObject({ ok: true, companyId: companyProfile.id, retailerId: retailerProfile.id, status: "active" });
  }, 30000);

  it("rejects malformed and unauthorized bond workflows with deterministic errors", async () => {
    const { db } = assertDb();
    const suffix = Date.now() + 1;

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Negative",
      email: `company-negative.${suffix}@sendro.test`,
      companyName: "Company Negative"
    });

    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Negative",
      email: `retailer-negative.${suffix}@sendro.test`,
      retailerName: "Retailer Negative"
    });

    const otherRetailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Other",
      email: `retailer-other.${suffix}@sendro.test`,
      retailerName: "Retailer Other"
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const malformedRequest = await retailerAgent
      .post("/trpc/bonds.requestRetailerBond")
      .set("origin", "http://localhost:3000")
      .send({ companyId: "not-a-uuid" });
    expect(malformedRequest.status).toBe(400);

    const wrongRoleRequest = await companyAgent
      .post("/trpc/bonds.requestRetailerBond")
      .set("origin", "http://localhost:3000")
      .send({ companyId: companyProfile.id });
    expect(wrongRoleRequest.status).toBe(403);
    expect(trpcErrorMessage(wrongRoleRequest)).toContain("bond_role_forbidden:retailer_required");

    const missingCompanyRequest = await retailerAgent
      .post("/trpc/bonds.requestRetailerBond")
      .set("origin", "http://localhost:3000")
      .send({ companyId: "00000000-0000-0000-0000-000000000000" });
    expect(missingCompanyRequest.status).toBe(404);
    expect(trpcErrorMessage(missingCompanyRequest)).toContain("bond_company_not_found");

    const firstRequest = await retailerAgent
      .post("/trpc/bonds.requestRetailerBond")
      .set("origin", "http://localhost:3000")
      .send({ companyId: companyProfile.id });
    expect(firstRequest.status).toBe(200);
    const createdBond = trpcJson(firstRequest);

    const duplicateRequest = await retailerAgent
      .post("/trpc/bonds.requestRetailerBond")
      .set("origin", "http://localhost:3000")
      .send({ companyId: companyProfile.id });
    expect(duplicateRequest.status).toBe(409);
    expect(trpcErrorMessage(duplicateRequest)).toContain("bond_request_duplicate:pending");

    const wrongRoleDecision = await retailerAgent
      .post("/trpc/bonds.decideRetailerBond")
      .set("origin", "http://localhost:3000")
      .send({ bondId: createdBond.id, action: "approve" });
    expect(wrongRoleDecision.status).toBe(403);
    expect(trpcErrorMessage(wrongRoleDecision)).toContain("bond_role_forbidden:company_required");

    const missingBondDecision = await companyAgent
      .post("/trpc/bonds.decideRetailerBond")
      .set("origin", "http://localhost:3000")
      .send({ bondId: "00000000-0000-0000-0000-000000000000", action: "approve" });
    expect(missingBondDecision.status).toBe(404);
    expect(trpcErrorMessage(missingBondDecision)).toContain("bond_request_not_found");

    const otherCompanyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Other",
      email: `company-other.${suffix}@sendro.test`,
      companyName: "Company Other"
    });

    const foreignDecision = await otherCompanyAgent
      .post("/trpc/bonds.decideRetailerBond")
      .set("origin", "http://localhost:3000")
      .send({ bondId: createdBond.id, action: "approve" });
    expect(foreignDecision.status).toBe(403);
    expect(trpcErrorMessage(foreignDecision)).toContain("bond_company_forbidden");

    const noBondGate = await otherRetailerAgent.get(gateUrl(companyProfile.id)).set("origin", "http://localhost:3000");
    expect(noBondGate.status).toBe(403);
    expect(trpcErrorMessage(noBondGate)).toContain("bond_active_required:retailer_company");

    const [createdBondRow] = await db
      .select()
      .from(bonds)
      .where(and(eq(bonds.companyId, companyProfile.id), eq(bonds.entityType, "retailer")))
      .limit(1);
    expect(createdBondRow?.requestedByUserId).toBeTruthy();
  }, 30000);
});
