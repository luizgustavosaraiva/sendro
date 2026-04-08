import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import {
  assertDb,
  bonds,
  companies,
  deliveryEvents,
  deliveries,
  dispatchAttempts,
  dispatchQueueEntries,
  pricingRules,
  users
} from "@repo/db";
import {
  billingReportListSchema,
  billingReportSummarySchema,
  deliveryCompletionSchema,
  deliveryDetailSchema,
  deliveryProofSchema,
  deliveryProofSubmissionSchema,
  operationsSummarySchema
} from "@repo/shared";
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

const operationsSummaryUrl = (input?: object) =>
  input
    ? `/trpc/deliveries.operationsSummary?input=${encodeURIComponent(JSON.stringify(input))}`
    : "/trpc/deliveries.operationsSummary";

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

  it("creates dispatch-backed deliveries and exposes the accepted offer to company, retailer, and driver views", async () => {
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
    expect(created.status).toBe("offered");
    expect(created.timeline.map((event: { status: string; sequence: number }) => [event.sequence, event.status])).toEqual([
      [1, "created"],
      [2, "queued"],
      [3, "offered"]
    ]);
    expect(created.dispatch.attempts[0].offerStatus).toBe("pending");

    const offeredDriverAgent =
      created.dispatch.offeredDriverId === driverProfileA.id
        ? driverAgentA
        : created.dispatch.offeredDriverId === driverProfileB.id
          ? driverAgentB
          : null;
    expect(offeredDriverAgent).toBeTruthy();

    const acceptedResponse = await offeredDriverAgent!
      .post("/trpc/deliveries.resolveOffer")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, decision: "accept" });
    expect(acceptedResponse.status, acceptedResponse.text).toBe(200);
    const accepted = trpcJson(acceptedResponse);
    expect(accepted.delivery.status).toBe("accepted");
    expect(accepted.delivery.driverId).toBe(created.dispatch.offeredDriverId);
    expect(accepted.delivery.dispatch.phase).toBe("completed");
    expect(accepted.delivery.dispatch.attempts[0].offerStatus).toBe("accepted");
    expect(accepted.delivery.timeline.map((event: { status: string }) => event.status)).toEqual([
      "created",
      "queued",
      "offered",
      "accepted"
    ]);

    const companyListResponse = await companyAgent.get(listUrl()).set("origin", "http://localhost:3000");
    expect(companyListResponse.status, companyListResponse.text).toBe(200);
    const companyList = trpcJson(companyListResponse);
    expect(companyList).toHaveLength(1);
    expect(companyList[0].status).toBe("accepted");

    const retailerListResponse = await retailerAgent.get(listUrl()).set("origin", "http://localhost:3000");
    expect(retailerListResponse.status, retailerListResponse.text).toBe(200);
    expect(trpcJson(retailerListResponse)).toHaveLength(1);

    const acceptedDriverAgent =
      accepted.delivery.driverId === driverProfileA.id
        ? driverAgentA
        : accepted.delivery.driverId === driverProfileB.id
          ? driverAgentB
          : null;
    expect(acceptedDriverAgent).toBeTruthy();

    const driverListResponse = await acceptedDriverAgent!.get(listUrl()).set("origin", "http://localhost:3000");
    expect(driverListResponse.status, driverListResponse.text).toBe(200);
    const driverList = trpcJson(driverListResponse);
    expect(driverList).toHaveLength(1);
    expect(driverList[0].deliveryId).toBe(created.deliveryId);

    const outsiderListResponse = await outsiderRetailerAgent.get(listUrl()).set("origin", "http://localhost:3000");
    expect(outsiderListResponse.status, outsiderListResponse.text).toBe(200);
    expect(trpcJson(outsiderListResponse)).toEqual([]);

    const detailResponse = await companyAgent.get(detailUrl(created.deliveryId)).set("origin", "http://localhost:3000");
    expect(detailResponse.status, detailResponse.text).toBe(200);
    const detail = trpcJson(detailResponse);
    expect(detail.status).toBe("accepted");
    expect(detail.timeline[3]).toMatchObject({ status: "accepted", actorType: "driver" });

    const [storedDelivery] = await db.select().from(deliveries).where(eq(deliveries.id, created.deliveryId)).limit(1);
    expect(storedDelivery?.status).toBe("accepted");

    const [queueEntry] = await db.select().from(dispatchQueueEntries).where(eq(dispatchQueueEntries.deliveryId, created.deliveryId)).limit(1);
    expect(queueEntry?.phase).toBe("completed");

    const storedAttempts = await db
      .select()
      .from(dispatchAttempts)
      .where(eq(dispatchAttempts.deliveryId, created.deliveryId))
      .orderBy(asc(dispatchAttempts.attemptNumber));
    expect(storedAttempts).toHaveLength(1);
    expect(storedAttempts[0].offerStatus).toBe("accepted");

    const storedEvents = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, created.deliveryId))
      .orderBy(asc(deliveryEvents.sequence));
    expect(storedEvents.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(storedEvents.map((event) => event.status)).toEqual(["created", "queued", "offered", "accepted"]);
  }, 30000);

  it("rejects unauthorized, malformed, cross-scope, and already-resolved offer flows with deterministic errors", async () => {
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

    const driverAgent = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Negative Delivery",
      email: `driver.negative.delivery.${suffix}@sendro.test`,
      driverName: "Driver Negative Delivery",
      phone: `+5531${String(suffix).slice(-8)}`
    });

    const foreignDriverAgent = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Foreign Delivery",
      email: `driver.foreign.delivery.${suffix}@sendro.test`,
      driverName: "Driver Foreign Delivery",
      phone: `+5532${String(suffix).slice(-8)}`
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const otherCompanyProfile = trpcJson(await otherCompanyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const retailerProfile = trpcJson(await retailerAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfile = trpcJson(await driverAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

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

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `retailer.negative.delivery.${suffix}@sendro.test`)).limit(1);
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

    const createResponse = await retailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({ companyId: companyProfile.id, externalReference: `NEG-${suffix}` });
    expect(createResponse.status, createResponse.text).toBe(200);
    const created = trpcJson(createResponse);

    const companyResolve = await companyAgent
      .post("/trpc/deliveries.resolveOffer")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, decision: "accept" });
    expect(companyResolve.status).toBe(403);
    expect(trpcErrorMessage(companyResolve)).toContain("bond_role_forbidden:driver_required");

    const foreignDriverResolve = await foreignDriverAgent
      .post("/trpc/deliveries.resolveOffer")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, decision: "accept" });
    expect(foreignDriverResolve.status).toBe(403);
    expect(trpcErrorMessage(foreignDriverResolve)).toContain("driver_offer_forbidden");

    const malformedResolve = await driverAgent
      .post("/trpc/deliveries.resolveOffer")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, decision: "reject", reason: "x" });
    expect(malformedResolve.status).toBe(400);

    const acceptedResponse = await driverAgent
      .post("/trpc/deliveries.resolveOffer")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, decision: "accept" });
    expect(acceptedResponse.status, acceptedResponse.text).toBe(200);

    const duplicateResolve = await driverAgent
      .post("/trpc/deliveries.resolveOffer")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, decision: "accept" });
    expect(duplicateResolve.status).toBe(409);
    expect(trpcErrorMessage(duplicateResolve)).toContain("driver_offer_already_resolved:queue_not_offered");

    const foreignRetailerDetail = await secondRetailerAgent.get(detailUrl(created.deliveryId)).set("origin", "http://localhost:3000");
    expect(foreignRetailerDetail.status).toBe(403);
    expect(trpcErrorMessage(foreignRetailerDetail)).toContain("delivery_retailer_forbidden");

    const foreignRetailerCreate = await secondRetailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({ companyId: otherCompanyProfile.id, externalReference: `FOREIGN-${suffix}` });
    expect(foreignRetailerCreate.status).toBe(403);
    expect(trpcErrorMessage(foreignRetailerCreate)).toContain("bond_active_required:retailer_company");

    const [storedDelivery] = await db.select().from(deliveries).where(eq(deliveries.id, created.deliveryId)).limit(1);
    expect(storedDelivery?.status).toBe("accepted");

    const storedEvents = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, created.deliveryId))
      .orderBy(asc(deliveryEvents.sequence));
    expect(storedEvents.map((event) => event.status)).toEqual(["created", "queued", "offered", "accepted"]);

    const matchingBonds = await db
      .select()
      .from(bonds)
      .where(and(eq(bonds.companyId, companyProfile.id), eq(bonds.entityId, retailerProfile.id)));
    expect(matchingBonds).toHaveLength(1);
  }, 30000);

  it("exposes company-scoped operational summary and driver availability with deterministic auth/input failures", async () => {
    const { db } = assertDb();
    const suffix = Date.now() + 15;

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Ops",
      email: `company.ops.${suffix}@sendro.test`,
      companyName: "Company Ops"
    });

    const secondCompanyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Ops Foreign",
      email: `company.ops.foreign.${suffix}@sendro.test`,
      companyName: "Company Ops Foreign"
    });

    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Ops",
      email: `retailer.ops.${suffix}@sendro.test`,
      retailerName: "Retailer Ops"
    });

    const driverAgentA = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Ops A",
      email: `driver.ops.a.${suffix}@sendro.test`,
      driverName: "Driver Ops A",
      phone: `+5591${String(suffix).slice(-8)}`
    });

    const driverAgentB = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Ops B",
      email: `driver.ops.b.${suffix}@sendro.test`,
      driverName: "Driver Ops B",
      phone: `+5592${String(suffix).slice(-8)}`
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const secondCompanyProfile = trpcJson(
      await secondCompanyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")
    ).profile;
    const retailerProfile = trpcJson(await retailerAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfileA = trpcJson(await driverAgentA.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfileB = trpcJson(await driverAgentB.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `retailer.ops.${suffix}@sendro.test`)).limit(1);

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
      },
      {
        companyId: secondCompanyProfile.id,
        entityId: driverProfileA.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: retailerUser!.id
      }
    ]);

    await db.insert(pricingRules).values({
      companyId: companyProfile.id,
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightMinGrams: 0,
      weightMaxGrams: 2000,
      amountCents: 2100,
      currency: "BRL"
    });

    const createOne = await retailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({
        companyId: companyProfile.id,
        externalReference: `OPS-ONE-${suffix}`,
        metadata: {
          region: "SP-CAPITAL",
          deliveryType: "same_day",
          weightGrams: 1000
        }
      });
    expect(createOne.status, createOne.text).toBe(200);
    const createdOne = trpcJson(createOne);

    const createTwo = await retailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({
        companyId: companyProfile.id,
        externalReference: `OPS-TWO-${suffix}`,
        metadata: {
          region: "SP-CAPITAL",
          deliveryType: "same_day",
          weightGrams: 8000
        }
      });
    expect(createTwo.status, createTwo.text).toBe(200);
    const createdTwo = trpcJson(createTwo);

    const offerAgentByDriverId = new Map<string, ReturnType<typeof request.agent>>([
      [driverProfileA.id, driverAgentA],
      [driverProfileB.id, driverAgentB]
    ]);

    const rejectOneAgent = offerAgentByDriverId.get(createdOne.dispatch.offeredDriverId);
    expect(rejectOneAgent).toBeTruthy();
    const rejectOne = await rejectOneAgent!
      .post("/trpc/deliveries.resolveOffer")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: createdOne.deliveryId, decision: "reject", reason: "capacity_full" });
    expect(rejectOne.status, rejectOne.text).toBe(200);

    const acceptTwoAgent = offerAgentByDriverId.get(createdTwo.dispatch.offeredDriverId);
    expect(acceptTwoAgent).toBeTruthy();
    const acceptTwo = await acceptTwoAgent!
      .post("/trpc/deliveries.resolveOffer")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: createdTwo.deliveryId, decision: "accept" });
    expect(acceptTwo.status, acceptTwo.text).toBe(200);

    const completeTwo = await acceptTwoAgent!
      .post("/trpc/deliveries.complete")
      .set("origin", "http://localhost:3000")
      .send({
        deliveryId: createdTwo.deliveryId,
        proof: {
          note: "Delivered for operations summary revenue check"
        }
      });
    expect(completeTwo.status, completeTwo.text).toBe(200);

    const malformedWindow = await companyAgent
      .get(operationsSummaryUrl({ window: "invalid_window" }))
      .set("origin", "http://localhost:3000");
    expect(malformedWindow.status).toBe(400);

    const forbiddenSummary = await retailerAgent.get(operationsSummaryUrl()).set("origin", "http://localhost:3000");
    expect(forbiddenSummary.status).toBe(403);
    expect(trpcErrorMessage(forbiddenSummary)).toContain("bond_role_forbidden:company_required");

    const summaryResponse = await companyAgent
      .get(operationsSummaryUrl({ window: "all_time" }))
      .set("origin", "http://localhost:3000");
    expect(summaryResponse.status, summaryResponse.text).toBe(200);
    const summary = trpcJson(summaryResponse);
    expect(summary.generatedAt).toEqual(expect.any(String));
    expect(summary.window).toBe("all_time");
    expect(summary.onTime).toEqual({
      state: "unavailable_policy_pending",
      reason: "on_time_policy_window_not_modeled"
    });
    expect(summary.kpis).toMatchObject({
      awaitingAcceptance: 1,
      failedAttempts: 1,
      delivered: 1,
      activeDrivers: 2,
      grossRevenueCents: 0,
      netRevenueCents: 0
    });

    const foreignSummaryResponse = await secondCompanyAgent
      .get(operationsSummaryUrl({ window: "all_time" }))
      .set("origin", "http://localhost:3000");
    expect(foreignSummaryResponse.status, foreignSummaryResponse.text).toBe(200);
    const foreignSummary = trpcJson(foreignSummaryResponse);
    expect(foreignSummary.kpis.waitingQueue).toBe(0);
    expect(foreignSummary.kpis.failedAttempts).toBe(0);
    expect(foreignSummary.kpis.activeDrivers).toBe(1);
    expect(foreignSummary.kpis.grossRevenueCents).toBe(0);
    expect(foreignSummary.kpis.netRevenueCents).toBe(0);

    const forbiddenDrivers = await retailerAgent
      .get("/trpc/deliveries.companyDriversOperational")
      .set("origin", "http://localhost:3000");
    expect(forbiddenDrivers.status).toBe(403);
    expect(trpcErrorMessage(forbiddenDrivers)).toContain("bond_role_forbidden:company_required");

    const driversResponse = await companyAgent
      .get("/trpc/deliveries.companyDriversOperational")
      .set("origin", "http://localhost:3000");
    expect(driversResponse.status, driversResponse.text).toBe(200);
    const drivers = trpcJson(driversResponse);
    expect(drivers).toHaveLength(2);
    expect(drivers.map((row: { companyId: string }) => row.companyId)).toEqual([
      companyProfile.id,
      companyProfile.id
    ]);

    const driverAState = drivers.find((row: { driverId: string }) => row.driverId === driverProfileA.id);
    const driverBState = drivers.find((row: { driverId: string }) => row.driverId === driverProfileB.id);
    expect(driverAState?.bondStatus).toBe("active");
    expect(driverBState?.bondStatus).toBe("active");
    expect(drivers.filter((row: { strikeCount: number }) => row.strikeCount > 0)).toHaveLength(1);
    expect(drivers.some((row: { strikeConsequence: string | null }) => row.strikeConsequence === "warning")).toBe(true);
    expect(drivers.some((row: { operationalState: string }) => row.operationalState === "available")).toBe(true);

    const emptyCompanyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Ops Empty",
      email: `company.ops.empty.${suffix}@sendro.test`,
      companyName: "Company Ops Empty"
    });

    const emptySummaryResponse = await emptyCompanyAgent
      .get(operationsSummaryUrl({ window: "all_time" }))
      .set("origin", "http://localhost:3000");
    expect(emptySummaryResponse.status, emptySummaryResponse.text).toBe(200);
    expect(trpcJson(emptySummaryResponse).kpis).toEqual({
      awaitingAcceptance: 0,
      waitingQueue: 0,
      failedAttempts: 0,
      delivered: 0,
      activeDrivers: 0,
      grossRevenueCents: 0,
      netRevenueCents: 0
    });
    expect(trpcJson(emptySummaryResponse).onTime.state).toBe("unavailable_policy_pending");

    const emptyDriversResponse = await emptyCompanyAgent
      .get("/trpc/deliveries.companyDriversOperational")
      .set("origin", "http://localhost:3000");
    expect(emptyDriversResponse.status, emptyDriversResponse.text).toBe(200);
    expect(trpcJson(emptyDriversResponse)).toEqual([]);
  }, 30000);

  it("completes an in-flight delivery atomically with proof snapshot and delivered event sequence", async () => {
    const { db } = assertDb();
    const suffix = Date.now() + 2;

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Proof Delivery",
      email: `company.proof.delivery.${suffix}@sendro.test`,
      companyName: "Company Proof Delivery"
    });

    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Proof Delivery",
      email: `retailer.proof.delivery.${suffix}@sendro.test`,
      retailerName: "Retailer Proof Delivery"
    });

    const driverAgent = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Proof Delivery",
      email: `driver.proof.delivery.${suffix}@sendro.test`,
      driverName: "Driver Proof Delivery",
      phone: `+5571${String(suffix).slice(-8)}`
    });

    const otherDriverAgent = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Proof Outsider",
      email: `driver.proof.outsider.${suffix}@sendro.test`,
      driverName: "Driver Proof Outsider",
      phone: `+5572${String(suffix).slice(-8)}`
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const retailerProfile = trpcJson(await retailerAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfile = trpcJson(await driverAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `retailer.proof.delivery.${suffix}@sendro.test`)).limit(1);
    expect(retailerUser).toBeTruthy();

    await db
      .update(companies)
      .set({ proofRequiredNote: true, proofRequiredPhoto: true, updatedAt: new Date() })
      .where(eq(companies.id, companyProfile.id));

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

    const createResponse = await retailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({
        companyId: companyProfile.id,
        externalReference: `POD-${suffix}`,
        pickupAddress: "Rua Proof A, 10",
        dropoffAddress: "Rua Proof B, 20"
      });
    expect(createResponse.status, createResponse.text).toBe(200);
    const created = trpcJson(createResponse);

    const acceptedResponse = await driverAgent
      .post("/trpc/deliveries.resolveOffer")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, decision: "accept" });
    expect(acceptedResponse.status, acceptedResponse.text).toBe(200);

    const missingProofResponse = await driverAgent
      .post("/trpc/deliveries.complete")
      .set("origin", "http://localhost:3000")
      .send({
        deliveryId: created.deliveryId,
        proof: {
          note: "Recebido no balcão"
        }
      });
    expect(missingProofResponse.status).toBe(400);
    expect(trpcErrorMessage(missingProofResponse)).toContain("delivery_proof_photo_required");

    const missingNoteResponse = await driverAgent
      .post("/trpc/deliveries.complete")
      .set("origin", "http://localhost:3000")
      .send({
        deliveryId: created.deliveryId,
        proof: {
          photoUrl: "https://cdn.sendro.test/proofs/pod-missing-note.jpg"
        }
      });
    expect(missingNoteResponse.status).toBe(400);
    expect(trpcErrorMessage(missingNoteResponse)).toContain("delivery_proof_note_required");

    const forbiddenResponse = await otherDriverAgent
      .post("/trpc/deliveries.complete")
      .set("origin", "http://localhost:3000")
      .send({
        deliveryId: created.deliveryId,
        proof: {
          note: "Entrega concluída",
          photoUrl: "https://cdn.sendro.test/proofs/outsider.jpg"
        }
      });
    expect(forbiddenResponse.status).toBe(403);
    expect(trpcErrorMessage(forbiddenResponse)).toContain("delivery_driver_forbidden");

    const detailBeforeCompletion = await retailerAgent.get(detailUrl(created.deliveryId)).set("origin", "http://localhost:3000");
    expect(detailBeforeCompletion.status, detailBeforeCompletion.text).toBe(200);
    expect(trpcJson(detailBeforeCompletion).timeline.map((event: { status: string }) => event.status)).toEqual([
      "created",
      "queued",
      "offered",
      "accepted"
    ]);

    const completeResponse = await driverAgent
      .post("/trpc/deliveries.complete")
      .set("origin", "http://localhost:3000")
      .send({
        deliveryId: created.deliveryId,
        proof: {
          note: "Recebido na portaria.",
          photoUrl: "https://cdn.sendro.test/proofs/pod-complete.jpg"
        }
      });
    expect(completeResponse.status, completeResponse.text).toBe(200);
    const completed = trpcJson(completeResponse);
    expect(completed.status).toBe("delivered");
    expect(completed.proof).toMatchObject({
      note: "Recebido na portaria.",
      photoUrl: "https://cdn.sendro.test/proofs/pod-complete.jpg",
      submittedByActorType: "driver",
      policy: {
        requireNote: true,
        requirePhoto: true
      }
    });
    expect(completed.timeline.map((event: { status: string }) => event.status)).toEqual([
      "created",
      "queued",
      "offered",
      "accepted",
      "delivered"
    ]);

    const duplicateCompletion = await driverAgent
      .post("/trpc/deliveries.complete")
      .set("origin", "http://localhost:3000")
      .send({
        deliveryId: created.deliveryId,
        proof: {
          note: "Recebido na portaria.",
          photoUrl: "https://cdn.sendro.test/proofs/pod-complete.jpg"
        }
      });
    expect(duplicateCompletion.status).toBe(409);
    expect(trpcErrorMessage(duplicateCompletion)).toContain("delivery_already_delivered");

    const driverListResponse = await driverAgent.get(listUrl()).set("origin", "http://localhost:3000");
    expect(driverListResponse.status, driverListResponse.text).toBe(200);
    const driverList = trpcJson(driverListResponse);
    expect(driverList).toHaveLength(1);
    expect(driverList[0].proof?.photoUrl).toBe("https://cdn.sendro.test/proofs/pod-complete.jpg");

    const retailerDetailResponse = await retailerAgent.get(detailUrl(created.deliveryId)).set("origin", "http://localhost:3000");
    expect(retailerDetailResponse.status, retailerDetailResponse.text).toBe(200);
    expect(trpcJson(retailerDetailResponse).proof?.policy.requireNote).toBe(true);

    const [storedDelivery] = await db.select().from(deliveries).where(eq(deliveries.id, created.deliveryId)).limit(1);
    expect(storedDelivery?.status).toBe("delivered");
    expect(storedDelivery?.proofNote).toBe("Recebido na portaria.");
    expect(storedDelivery?.proofPhotoUrl).toBe("https://cdn.sendro.test/proofs/pod-complete.jpg");
    expect(storedDelivery?.proofRequiredNote).toBe(true);
    expect(storedDelivery?.proofRequiredPhoto).toBe(true);
    expect(storedDelivery?.proofSubmittedByActorType).toBe("driver");

    const storedEvents = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, created.deliveryId))
      .orderBy(asc(deliveryEvents.sequence));
    expect(storedEvents.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(storedEvents.at(-1)).toMatchObject({ status: "delivered", actorType: "driver", sequence: 5 });
  }, 30000);

  it("enforces billing report schema bounds and explicit pricing diagnostics", async () => {
    const now = new Date().toISOString();

    const parsedInput = billingReportListSchema.parse({
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T23:59:59.999Z"
    });
    expect(parsedInput.page).toBe(1);
    expect(parsedInput.limit).toBe(50);

    const malformedPagination = billingReportListSchema.safeParse({
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T23:59:59.999Z",
      page: 0,
      limit: 1000
    });
    expect(malformedPagination.success).toBe(false);

    const malformedPeriod = billingReportListSchema.safeParse({
      periodStart: "2026-02-01T00:00:00.000Z",
      periodEnd: "2026-01-31T23:59:59.999Z"
    });
    expect(malformedPeriod.success).toBe(false);

    const parsedReport = billingReportSummarySchema.parse({
      generatedAt: now,
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T23:59:59.999Z",
      page: 1,
      limit: 50,
      totalRows: 1,
      totalPages: 1,
      totals: {
        grossRevenueCents: 1400,
        netRevenueCents: 1200
      },
      rows: [
        {
          deliveryId: "550e8400-e29b-41d4-a716-446655440061",
          companyId: "550e8400-e29b-41d4-a716-446655440062",
          deliveredAt: now,
          region: "sao-paulo-centro",
          deliveryType: "same_day",
          weightGrams: 800,
          matchedRuleId: "550e8400-e29b-41d4-a716-446655440063",
          priceDiagnostic: "matched_rule:550e8400-e29b-41d4-a716-446655440063",
          grossRevenueCents: 1400,
          netRevenueCents: 1200
        }
      ]
    });
    expect(parsedReport.rows[0]?.priceDiagnostic).toContain("matched_rule:");

    const malformedReport = billingReportSummarySchema.safeParse({
      generatedAt: now,
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T23:59:59.999Z",
      page: 1,
      limit: 50,
      totalRows: 1,
      totalPages: 1,
      totals: {
        grossRevenueCents: 0,
        netRevenueCents: 0
      },
      rows: [
        {
          deliveryId: "550e8400-e29b-41d4-a716-446655440061",
          companyId: "550e8400-e29b-41d4-a716-446655440062",
          deliveredAt: now,
          region: null,
          deliveryType: null,
          weightGrams: null,
          matchedRuleId: null,
          grossRevenueCents: 0,
          netRevenueCents: 0
        }
      ]
    });
    expect(malformedReport.success).toBe(false);

    const parsedOperationsSummary = operationsSummarySchema.parse({
      generatedAt: now,
      window: "all_time",
      assumptions: ["ops summary includes financials"],
      onTime: {
        state: "unavailable_policy_pending",
        reason: "on_time_policy_window_not_modeled"
      },
      kpis: {
        awaitingAcceptance: 0,
        waitingQueue: 0,
        failedAttempts: 0,
        delivered: 0,
        activeDrivers: 0,
        grossRevenueCents: 0,
        netRevenueCents: 0
      }
    });
    expect(parsedOperationsSummary.kpis.grossRevenueCents).toBe(0);
  });

  it("defines explicit proof-of-delivery validation and persistence fields without metadata blobs", async () => {
    const deliveredAt = new Date().toISOString();

    const parsedSubmission = deliveryProofSubmissionSchema.parse({
      note: "Entrega recebida na portaria.",
      photoUrl: "https://cdn.sendro.test/proofs/pod-123.jpg"
    });
    expect(parsedSubmission).toEqual({
      note: "Entrega recebida na portaria.",
      photoUrl: "https://cdn.sendro.test/proofs/pod-123.jpg"
    });

    const parsedCompletion = deliveryCompletionSchema.parse({
      deliveryId: "550e8400-e29b-41d4-a716-446655440000",
      proof: parsedSubmission
    });
    expect(parsedCompletion.proof.photoUrl).toBe("https://cdn.sendro.test/proofs/pod-123.jpg");

    const malformedSubmission = deliveryProofSubmissionSchema.safeParse({
      note: "Assinatura no balcão",
      photoUrl: "not-a-url"
    });
    expect(malformedSubmission.success).toBe(false);

    const parsedProof = deliveryProofSchema.parse({
      deliveredAt,
      note: "Cliente confirmou o recebimento.",
      photoUrl: "https://cdn.sendro.test/proofs/pod-456.jpg",
      submittedByActorType: "driver",
      submittedByActorId: "driver-user-123",
      policy: {
        requireNote: true,
        requirePhoto: true
      }
    });

    const parsedDetail = deliveryDetailSchema.parse({
      deliveryId: "550e8400-e29b-41d4-a716-446655440001",
      companyId: "550e8400-e29b-41d4-a716-446655440002",
      retailerId: "550e8400-e29b-41d4-a716-446655440003",
      driverId: "550e8400-e29b-41d4-a716-446655440004",
      externalReference: "ORDER-PROOF-1",
      status: "delivered",
      pickupAddress: "Rua A, 100",
      dropoffAddress: "Rua B, 200",
      metadata: { source: "proof-contract-test" },
      proof: parsedProof,
      createdAt: deliveredAt,
      updatedAt: deliveredAt,
      timeline: [],
      dispatch: null
    });
    expect(parsedDetail.proof?.policy.requirePhoto).toBe(true);

    const companyColumns = Object.keys(companies);
    expect(companyColumns).toEqual(
      expect.arrayContaining(["proofRequiredNote", "proofRequiredPhoto"])
    );

    const deliveryColumns = Object.keys(deliveries);
    expect(deliveryColumns).toEqual(
      expect.arrayContaining([
        "deliveredAt",
        "proofNote",
        "proofPhotoUrl",
        "proofRequiredNote",
        "proofRequiredPhoto",
        "proofSubmittedByActorType",
        "proofSubmittedByActorId"
      ])
    );
    expect(deliveryColumns).not.toContain("proofMetadata");
  });
});
