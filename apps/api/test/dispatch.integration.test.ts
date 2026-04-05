import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { assertDb, bonds, deliveryEvents, dispatchAttempts, dispatchQueueEntries, users } from "@repo/db";
import { asc, eq } from "drizzle-orm";
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

describe.skipIf(!process.env.DATABASE_URL)("dispatch integration", () => {
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

  it("expires two ordered private attempts, moves to waiting queue, and stays idempotent on repeated reprocessing", async () => {
    const { db } = assertDb();
    const suffix = Date.now();

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Dispatch",
      email: `company.dispatch.${suffix}@sendro.test`,
      companyName: "Company Dispatch"
    });
    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Dispatch",
      email: `retailer.dispatch.${suffix}@sendro.test`,
      retailerName: "Retailer Dispatch"
    });
    const driverAgentA = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Queue A",
      email: `driver.queuea.${suffix}@sendro.test`,
      driverName: "Driver Queue A",
      phone: `+5541${String(suffix).slice(-8)}`
    });
    const driverAgentB = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Queue B",
      email: `driver.queueb.${suffix}@sendro.test`,
      driverName: "Driver Queue B",
      phone: `+5542${String(suffix).slice(-8)}`
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const retailerProfile = trpcJson(await retailerAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfileA = trpcJson(await driverAgentA.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfileB = trpcJson(await driverAgentB.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `retailer.dispatch.${suffix}@sendro.test`)).limit(1);
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
      .send({ companyId: companyProfile.id, externalReference: `DISPATCH-${suffix}` });
    expect(createResponse.status, createResponse.text).toBe(200);
    const created = trpcJson(createResponse);
    expect(created.dispatch.phase).toBe("offered");
    expect(created.dispatch.attempts).toHaveLength(1);
    expect(created.dispatch.attempts[0].driverId).toBe(driverProfileA.id);

    const [queueEntry] = await db.select().from(dispatchQueueEntries).where(eq(dispatchQueueEntries.deliveryId, created.deliveryId)).limit(1);
    expect(queueEntry).toBeTruthy();

    const expireFirstAt = new Date(Date.now() + 121_000).toISOString();
    const firstReprocessResponse = await companyAgent
      .post("/trpc/deliveries.reprocessTimeouts")
      .set("origin", "http://localhost:3000")
      .send({ nowIso: expireFirstAt });
    expect(firstReprocessResponse.status, firstReprocessResponse.text).toBe(200);
    const firstReprocess = trpcJson(firstReprocessResponse);
    expect(firstReprocess).toMatchObject({
      scannedEntries: 1,
      expiredAttempts: 1,
      advancedAttempts: 1,
      movedToWaiting: 0,
      deliveryIds: [created.deliveryId]
    });

    const queueAfterFirst = trpcJson(
      await companyAgent.get("/trpc/deliveries.dispatchQueue?input=%7B%7D").set("origin", "http://localhost:3000")
    );
    expect(queueAfterFirst).toHaveLength(1);
    expect(queueAfterFirst[0].dispatch.activeAttemptNumber).toBe(2);
    expect(queueAfterFirst[0].dispatch.attempts).toHaveLength(2);
    expect(queueAfterFirst[0].dispatch.attempts[0].status).toBe("expired");
    expect(queueAfterFirst[0].dispatch.attempts[1]).toMatchObject({ status: "pending", driverId: driverProfileB.id });

    const expireSecondAt = new Date(Date.now() + 242_000).toISOString();
    const secondReprocessResponse = await companyAgent
      .post("/trpc/deliveries.reprocessTimeouts")
      .set("origin", "http://localhost:3000")
      .send({ nowIso: expireSecondAt });
    expect(secondReprocessResponse.status, secondReprocessResponse.text).toBe(200);
    const secondReprocess = trpcJson(secondReprocessResponse);
    expect(secondReprocess).toMatchObject({
      scannedEntries: 1,
      expiredAttempts: 1,
      advancedAttempts: 0,
      movedToWaiting: 1,
      deliveryIds: [created.deliveryId]
    });

    const waitingResponse = await companyAgent.get("/trpc/deliveries.waitingQueue?input=%7B%7D").set("origin", "http://localhost:3000");
    expect(waitingResponse.status, waitingResponse.text).toBe(200);
    const waitingQueue = trpcJson(waitingResponse);
    expect(waitingQueue).toHaveLength(1);
    expect(waitingQueue[0].deliveryId).toBe(created.deliveryId);
    expect(waitingQueue[0].dispatch).toMatchObject({
      phase: "waiting",
      waitingReason: "max_private_attempts_reached",
      activeAttemptId: null
    });
    expect(waitingQueue[0].dispatch.attempts.map((attempt: { attemptNumber: number; status: string }) => [attempt.attemptNumber, attempt.status])).toEqual([
      [1, "expired"],
      [2, "expired"]
    ]);

    const repeatReprocessResponse = await companyAgent
      .post("/trpc/deliveries.reprocessTimeouts")
      .set("origin", "http://localhost:3000")
      .send({ nowIso: new Date(Date.now() + 500_000).toISOString() });
    expect(repeatReprocessResponse.status, repeatReprocessResponse.text).toBe(200);
    const repeatReprocess = trpcJson(repeatReprocessResponse);
    expect(repeatReprocess).toMatchObject({
      scannedEntries: 0,
      expiredAttempts: 0,
      advancedAttempts: 0,
      movedToWaiting: 0,
      unchangedEntries: 0,
      deliveryIds: []
    });

    const attempts = await db
      .select()
      .from(dispatchAttempts)
      .where(eq(dispatchAttempts.deliveryId, created.deliveryId))
      .orderBy(asc(dispatchAttempts.attemptNumber));
    expect(attempts).toHaveLength(2);
    expect(attempts.every((attempt) => attempt.status === "expired")).toBe(true);

    const storedQueueEntry = await db
      .select()
      .from(dispatchQueueEntries)
      .where(eq(dispatchQueueEntries.deliveryId, created.deliveryId))
      .limit(1);
    expect(storedQueueEntry[0].phase).toBe("waiting");
    expect(storedQueueEntry[0].waitingReason).toBe("max_private_attempts_reached");

    const storedEvents = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, created.deliveryId))
      .orderBy(asc(deliveryEvents.sequence));
    expect(storedEvents.map((event) => event.status)).toEqual(["created", "queued", "offered", "failed_attempt", "offered", "failed_attempt", "queued"]);
    expect(storedEvents[3].metadata).toMatchObject({ attemptNumber: 1 });
    expect(storedEvents[5].metadata).toMatchObject({ attemptNumber: 2 });
    expect(storedEvents[6].metadata).toMatchObject({ waitingReason: "max_private_attempts_reached" });
  }, 30000);

  it("keeps dispatch company-scoped, ignores early reprocessing, and does not reopen waiting deliveries", async () => {
    const { db } = assertDb();
    const suffix = Date.now() + 1;

    const companyAgentA = await registerAndLogin(app, {
      role: "company",
      name: "Company Scope A",
      email: `company.scopea.${suffix}@sendro.test`,
      companyName: "Company Scope A"
    });
    const companyAgentB = await registerAndLogin(app, {
      role: "company",
      name: "Company Scope B",
      email: `company.scopeb.${suffix}@sendro.test`,
      companyName: "Company Scope B"
    });
    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Scope",
      email: `retailer.scope.${suffix}@sendro.test`,
      retailerName: "Retailer Scope"
    });
    const driverAgentA = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Scope A",
      email: `driver.scopea.${suffix}@sendro.test`,
      driverName: "Driver Scope A",
      phone: `+5551${String(suffix).slice(-8)}`
    });
    const driverAgentB = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Scope B",
      email: `driver.scopeb.${suffix}@sendro.test`,
      driverName: "Driver Scope B",
      phone: `+5552${String(suffix).slice(-8)}`
    });

    const companyProfileA = trpcJson(await companyAgentA.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const companyProfileB = trpcJson(await companyAgentB.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const retailerProfile = trpcJson(await retailerAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfileA = trpcJson(await driverAgentA.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfileB = trpcJson(await driverAgentB.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `retailer.scope.${suffix}@sendro.test`)).limit(1);
    await db.insert(bonds).values([
      {
        companyId: companyProfileA.id,
        entityId: retailerProfile.id,
        entityType: "retailer",
        status: "active",
        requestedByUserId: retailerUser!.id
      },
      {
        companyId: companyProfileA.id,
        entityId: driverProfileA.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: retailerUser!.id
      },
      {
        companyId: companyProfileB.id,
        entityId: driverProfileB.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: retailerUser!.id
      }
    ]);

    const createResponse = await retailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({ companyId: companyProfileA.id, externalReference: `SCOPE-${suffix}` });
    expect(createResponse.status, createResponse.text).toBe(200);
    const created = trpcJson(createResponse);
    expect(created.dispatch.latestSnapshot).toHaveLength(1);
    expect(created.dispatch.latestSnapshot[0].driverId).toBe(driverProfileA.id);
    expect(created.dispatch.latestSnapshot.some((candidate: { driverId: string }) => candidate.driverId === driverProfileB.id)).toBe(false);

    const foreignQueueResponse = await companyAgentB.get("/trpc/deliveries.dispatchQueue?input=%7B%7D").set("origin", "http://localhost:3000");
    expect(foreignQueueResponse.status, foreignQueueResponse.text).toBe(200);
    expect(trpcJson(foreignQueueResponse)).toEqual([]);

    const earlyReprocessResponse = await companyAgentA
      .post("/trpc/deliveries.reprocessTimeouts")
      .set("origin", "http://localhost:3000")
      .send({ nowIso: new Date(Date.now() + 30_000).toISOString() });
    expect(earlyReprocessResponse.status, earlyReprocessResponse.text).toBe(200);
    const earlyReprocess = trpcJson(earlyReprocessResponse);
    expect(earlyReprocess).toMatchObject({
      scannedEntries: 1,
      expiredAttempts: 0,
      advancedAttempts: 0,
      movedToWaiting: 0,
      unchangedEntries: 1,
      deliveryIds: []
    });

    await companyAgentA
      .post("/trpc/deliveries.reprocessTimeouts")
      .set("origin", "http://localhost:3000")
      .send({ nowIso: new Date(Date.now() + 130_000).toISOString() });

    await companyAgentA
      .post("/trpc/deliveries.reprocessTimeouts")
      .set("origin", "http://localhost:3000")
      .send({ nowIso: new Date(Date.now() + 260_000).toISOString() });

    const beforeRepeat = await db
      .select()
      .from(dispatchAttempts)
      .where(eq(dispatchAttempts.deliveryId, created.deliveryId))
      .orderBy(asc(dispatchAttempts.attemptNumber));
    expect(beforeRepeat).toHaveLength(1);
    expect(beforeRepeat[0].status).toBe("expired");

    const repeatResponse = await companyAgentA
      .post("/trpc/deliveries.reprocessTimeouts")
      .set("origin", "http://localhost:3000")
      .send({ nowIso: new Date(Date.now() + 360_000).toISOString() });
    expect(repeatResponse.status, repeatResponse.text).toBe(200);
    const repeatResult = trpcJson(repeatResponse);
    expect(repeatResult.deliveryIds).toEqual([]);

    const afterRepeat = await db
      .select()
      .from(dispatchAttempts)
      .where(eq(dispatchAttempts.deliveryId, created.deliveryId))
      .orderBy(asc(dispatchAttempts.attemptNumber));
    expect(afterRepeat).toHaveLength(1);
    expect(afterRepeat[0].status).toBe("expired");

    const waitingResponse = await companyAgentA.get("/trpc/deliveries.waitingQueue?input=%7B%7D").set("origin", "http://localhost:3000");
    expect(waitingResponse.status, waitingResponse.text).toBe(200);
    const waitingQueue = trpcJson(waitingResponse);
    expect(waitingQueue).toHaveLength(1);
    expect(waitingQueue[0].dispatch.waitingReason).toBe("no_candidates_available");

    const foreignReprocessResponse = await companyAgentB
      .post("/trpc/deliveries.reprocessTimeouts")
      .set("origin", "http://localhost:3000")
      .send({ nowIso: new Date(Date.now() + 720_000).toISOString() });
    expect(foreignReprocessResponse.status, foreignReprocessResponse.text).toBe(200);
    expect(trpcJson(foreignReprocessResponse).deliveryIds).toEqual([]);

    const storedEvents = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, created.deliveryId))
      .orderBy(asc(deliveryEvents.sequence));
    expect(storedEvents.map((event) => event.status)).toEqual(["created", "queued", "offered", "failed_attempt", "queued"]);
  }, 30000);
});
