import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { assertDb, bonds, companies, deliveryEvents, deliveries, dispatchAttempts, dispatchQueueEntries, drivers, users } from "@repo/db";
import { and, asc, eq } from "drizzle-orm";
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
    ? `/trpc/deliveries.list?input=${encodeURIComponent(JSON.stringify(input))}`
    : "/trpc/deliveries.list";

const detailUrl = (deliveryId: string) =>
  `/trpc/deliveries.detail?input=${encodeURIComponent(JSON.stringify({ deliveryId }))}`;

describe.skipIf(!process.env.DATABASE_URL)("deliveries integration", () => {
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

  it("creates dispatch-backed deliveries with append-only timeline evidence and completes dispatch on assignment", async () => {
    const { db } = assertDb();
    const suffix = Date.now();

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Delivery",
      email: `company.delivery.${suffix}@sendro.test`,
      companyName: "Company Delivery"
    });

    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Delivery",
      email: `retailer.delivery.${suffix}@sendro.test`,
      retailerName: "Retailer Delivery"
    });

    const outsiderRetailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Outsider",
      email: `retailer.outsider.${suffix}@sendro.test`,
      retailerName: "Retailer Outsider"
    });

    const driverAgentA = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Ranked A",
      email: `driver.rankeda.${suffix}@sendro.test`,
      driverName: "Driver Ranked A",
      phone: `+5511${String(suffix).slice(-8)}`
    });

    const driverAgentB = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Ranked B",
      email: `driver.rankedb.${suffix}@sendro.test`,
      driverName: "Driver Ranked B",
      phone: `+5521${String(suffix).slice(-8)}`
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const retailerProfile = trpcJson(await retailerAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfileA = trpcJson(await driverAgentA.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfileB = trpcJson(await driverAgentB.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `retailer.delivery.${suffix}@sendro.test`)).limit(1);
    expect(retailerUser).toBeTruthy();

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
        entityId: driverProfileA.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: retailerUser!.id
      },
      {
        companyId: companyProfile.id,
        entityId: driverProfileB.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: retailerUser!.id
      }
    ]);

    const createResponse = await retailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({
        companyId: companyProfile.id,
        externalReference: `ORDER-${suffix}`,
        pickupAddress: "Rua A, 100",
        dropoffAddress: "Rua B, 200",
        metadata: { source: "integration-test" }
      });

    expect(createResponse.status, createResponse.text).toBe(200);
    const created = trpcJson(createResponse);
    expect(created).toMatchObject({
      companyId: companyProfile.id,
      retailerId: retailerProfile.id,
      status: "offered",
      externalReference: `ORDER-${suffix}`,
      pickupAddress: "Rua A, 100",
      dropoffAddress: "Rua B, 200"
    });
    expect(created.timeline.map((event: { status: string; sequence: number }) => [event.sequence, event.status])).toEqual([
      [1, "created"],
      [2, "queued"],
      [3, "offered"]
    ]);
    expect(created.dispatch).toMatchObject({
      phase: "offered",
      activeAttemptNumber: 1,
      timeoutSeconds: 120,
      waitingReason: null,
      rankingVersion: "dispatch-v1"
    });
    expect(created.dispatch.latestSnapshot).toHaveLength(2);
    expect(created.dispatch.latestSnapshot[0].driverId).toBe(driverProfileA.id);
    expect(created.dispatch.latestSnapshot[1].driverId).toBe(driverProfileB.id);
    expect(created.dispatch.attempts).toHaveLength(1);
    expect(created.dispatch.attempts[0]).toMatchObject({
      attemptNumber: 1,
      driverId: driverProfileA.id,
      status: "pending"
    });

    const companyListResponse = await companyAgent.get(listUrl()).set("origin", "http://localhost:3000");
    expect(companyListResponse.status, companyListResponse.text).toBe(200);
    const companyList = trpcJson(companyListResponse);
    expect(companyList).toHaveLength(1);
    expect(companyList[0].dispatch.phase).toBe("offered");

    const retailerListResponse = await retailerAgent.get(listUrl()).set("origin", "http://localhost:3000");
    expect(retailerListResponse.status, retailerListResponse.text).toBe(200);
    expect(trpcJson(retailerListResponse)).toHaveLength(1);

    const outsiderListResponse = await outsiderRetailerAgent.get(listUrl()).set("origin", "http://localhost:3000");
    expect(outsiderListResponse.status, outsiderListResponse.text).toBe(200);
    expect(trpcJson(outsiderListResponse)).toEqual([]);

    const assignedResponse = await companyAgent
      .post("/trpc/deliveries.transition")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, status: "assigned", metadata: { step: "dispatch" } });
    expect(assignedResponse.status, assignedResponse.text).toBe(200);
    expect(trpcJson(assignedResponse)).toMatchObject({ status: "assigned" });

    const pickedUpResponse = await companyAgent
      .post("/trpc/deliveries.transition")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, status: "picked_up", metadata: { step: "pickup" } });
    expect(pickedUpResponse.status, pickedUpResponse.text).toBe(200);
    expect(trpcJson(pickedUpResponse)).toMatchObject({ status: "picked_up" });

    const inTransitResponse = await companyAgent
      .post("/trpc/deliveries.transition")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, status: "in_transit", metadata: { step: "transit" } });
    expect(inTransitResponse.status, inTransitResponse.text).toBe(200);
    const inTransit = trpcJson(inTransitResponse);
    expect(inTransit).toMatchObject({ status: "in_transit" });
    expect(inTransit.timeline.map((event: { status: string; sequence: number }) => [event.sequence, event.status])).toEqual([
      [1, "created"],
      [2, "queued"],
      [3, "offered"],
      [4, "assigned"],
      [5, "picked_up"],
      [6, "in_transit"]
    ]);
    expect(inTransit.dispatch.phase).toBe("completed");
    expect(inTransit.dispatch.attempts[0].status).toBe("accepted");

    const detailResponse = await companyAgent.get(detailUrl(created.deliveryId)).set("origin", "http://localhost:3000");
    expect(detailResponse.status, detailResponse.text).toBe(200);
    const detail = trpcJson(detailResponse);
    expect(detail.status).toBe("in_transit");
    expect(detail.timeline).toHaveLength(6);
    expect(detail.timeline[5]).toMatchObject({ status: "in_transit", sequence: 6, actorType: "company" });

    const filteredResponse = await companyAgent.get(listUrl({ status: "in_transit" })).set("origin", "http://localhost:3000");
    expect(filteredResponse.status, filteredResponse.text).toBe(200);
    expect(trpcJson(filteredResponse)).toHaveLength(1);

    const [storedDelivery] = await db.select().from(deliveries).where(eq(deliveries.id, created.deliveryId)).limit(1);
    expect(storedDelivery?.status).toBe("in_transit");

    const [queueEntry] = await db.select().from(dispatchQueueEntries).where(eq(dispatchQueueEntries.deliveryId, created.deliveryId)).limit(1);
    expect(queueEntry).toBeTruthy();
    expect(queueEntry?.phase).toBe("completed");

    const storedAttempts = await db
      .select()
      .from(dispatchAttempts)
      .where(eq(dispatchAttempts.deliveryId, created.deliveryId))
      .orderBy(asc(dispatchAttempts.attemptNumber));
    expect(storedAttempts).toHaveLength(1);
    expect(storedAttempts[0].status).toBe("accepted");

    const storedEvents = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, created.deliveryId))
      .orderBy(asc(deliveryEvents.sequence));
    expect(storedEvents.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(storedEvents.map((event) => event.status)).toEqual(["created", "queued", "offered", "assigned", "picked_up", "in_transit"]);
    expect(storedEvents.every((event) => Boolean(event.createdAt))).toBe(true);
  }, 30000);

  it("rejects unauthorized, malformed, cross-scope, and invalid transition flows with deterministic errors", async () => {
    const { db } = assertDb();
    const suffix = Date.now() + 1;

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Negative Delivery",
      email: `company.negative.delivery.${suffix}@sendro.test`,
      companyName: "Company Negative Delivery"
    });

    const otherCompanyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Foreign Delivery",
      email: `company.foreign.delivery.${suffix}@sendro.test`,
      companyName: "Company Foreign Delivery"
    });

    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Negative Delivery",
      email: `retailer.negative.delivery.${suffix}@sendro.test`,
      retailerName: "Retailer Negative Delivery"
    });

    const secondRetailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Foreign Delivery",
      email: `retailer.foreign.delivery.${suffix}@sendro.test`,
      retailerName: "Retailer Foreign Delivery"
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const otherCompanyProfile = trpcJson(await otherCompanyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const retailerProfile = trpcJson(await retailerAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const malformedCreate = await retailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({ companyId: "not-a-uuid" });
    expect(malformedCreate.status).toBe(400);

    const missingBondCreate = await retailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({ companyId: companyProfile.id, externalReference: `MISS-${suffix}` });
    expect(missingBondCreate.status).toBe(403);
    expect(trpcErrorMessage(missingBondCreate)).toContain("bond_active_required:retailer_company");

    const wrongRoleList = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Negative Delivery",
      email: `driver.negative.delivery.${suffix}@sendro.test`,
      driverName: "Driver Negative Delivery",
      phone: `+5531${String(suffix).slice(-8)}`
    });
    const wrongRoleListResponse = await wrongRoleList.get(listUrl()).set("origin", "http://localhost:3000");
    expect(wrongRoleListResponse.status).toBe(403);
    expect(trpcErrorMessage(wrongRoleListResponse)).toContain("delivery_role_forbidden:company_or_retailer_required");

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `retailer.negative.delivery.${suffix}@sendro.test`)).limit(1);
    await db.insert(bonds).values({
      companyId: companyProfile.id,
      entityId: retailerProfile.id,
      entityType: "retailer",
      status: "active",
      requestedByUserId: retailerUser!.id
    });

    const createResponse = await retailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({ companyId: companyProfile.id, externalReference: `NEG-${suffix}` });
    expect(createResponse.status, createResponse.text).toBe(200);
    const created = trpcJson(createResponse);

    const invalidTransition = await companyAgent
      .post("/trpc/deliveries.transition")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, status: "in_transit" });
    expect(invalidTransition.status).toBe(400);
    expect(trpcErrorMessage(invalidTransition)).toContain("delivery_transition_invalid:offered->in_transit");

    const retailerTransition = await retailerAgent
      .post("/trpc/deliveries.transition")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, status: "assigned" });
    expect(retailerTransition.status).toBe(403);
    expect(trpcErrorMessage(retailerTransition)).toContain("bond_role_forbidden:company_required");

    const foreignCompanyTransition = await otherCompanyAgent
      .post("/trpc/deliveries.transition")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, status: "assigned" });
    expect(foreignCompanyTransition.status).toBe(403);
    expect(trpcErrorMessage(foreignCompanyTransition)).toContain("delivery_company_forbidden");

    const foreignRetailerDetail = await secondRetailerAgent.get(detailUrl(created.deliveryId)).set("origin", "http://localhost:3000");
    expect(foreignRetailerDetail.status).toBe(403);
    expect(trpcErrorMessage(foreignRetailerDetail)).toContain("delivery_retailer_forbidden");

    const missingDetail = await companyAgent
      .get(detailUrl("00000000-0000-0000-0000-000000000000"))
      .set("origin", "http://localhost:3000");
    expect(missingDetail.status).toBe(404);
    expect(trpcErrorMessage(missingDetail)).toContain("delivery_not_found");

    const foreignRetailerCreate = await secondRetailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({ companyId: otherCompanyProfile.id, externalReference: `FOREIGN-${suffix}` });
    expect(foreignRetailerCreate.status).toBe(403);
    expect(trpcErrorMessage(foreignRetailerCreate)).toContain("bond_active_required:retailer_company");

    const [storedDelivery] = await db.select().from(deliveries).where(eq(deliveries.id, created.deliveryId)).limit(1);
    expect(storedDelivery?.status).toBe("offered");

    const storedEvents = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, created.deliveryId))
      .orderBy(asc(deliveryEvents.sequence));
    expect(storedEvents).toHaveLength(3);
    expect(storedEvents.map((event) => event.status)).toEqual(["created", "queued", "offered"]);

    const [companyRow] = await db.select().from(companies).where(eq(companies.id, companyProfile.id)).limit(1);
    expect(companyRow).toBeTruthy();

    const matchingBonds = await db
      .select()
      .from(bonds)
      .where(and(eq(bonds.companyId, companyProfile.id), eq(bonds.entityId, retailerProfile.id)));
    expect(matchingBonds).toHaveLength(1);
  }, 30000);
});
