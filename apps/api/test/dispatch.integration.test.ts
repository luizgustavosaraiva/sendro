import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { assertDb, bonds, deliveryEvents, dispatchAttempts, dispatchQueueEntries, driverStrikes, users } from "@repo/db";
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

  it("resolves an offered attempt exactly once across driver accept and timeout reprocessing", async () => {
    const { db } = assertDb();
    const suffix = Date.now();

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Race",
      email: `company.race.${suffix}@sendro.test`,
      companyName: "Company Race"
    });
    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Race",
      email: `retailer.race.${suffix}@sendro.test`,
      retailerName: "Retailer Race"
    });
    const driverAgentA = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Race A",
      email: `driver.racea.${suffix}@sendro.test`,
      driverName: "Driver Race A",
      phone: `+5541${String(suffix).slice(-8)}`
    });
    const driverAgentB = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Race B",
      email: `driver.raceb.${suffix}@sendro.test`,
      driverName: "Driver Race B",
      phone: `+5542${String(suffix).slice(-8)}`
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const retailerProfile = trpcJson(await retailerAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfileA = trpcJson(await driverAgentA.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfileB = trpcJson(await driverAgentB.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `retailer.race.${suffix}@sendro.test`)).limit(1);
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
      .send({ companyId: companyProfile.id, externalReference: `RACE-${suffix}` });
    expect(createResponse.status, createResponse.text).toBe(200);
    const created = trpcJson(createResponse);
    expect(created.dispatch.attempts).toHaveLength(1);
    expect(created.dispatch.attempts[0].offerStatus).toBe("pending");

    const acceptResponse = await driverAgentA
      .post("/trpc/deliveries.resolveOffer")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, decision: "accept" });
    expect(acceptResponse.status, acceptResponse.text).toBe(200);
    const accepted = trpcJson(acceptResponse);
    expect(accepted.resolution).toBe("accepted");
    expect(accepted.strike).toBeNull();
    expect(accepted.delivery.status).toBe("accepted");
    expect(accepted.delivery.dispatch.phase).toBe("completed");
    expect(accepted.delivery.dispatch.attempts[0].offerStatus).toBe("accepted");

    const reprocessResponse = await companyAgent
      .post("/trpc/deliveries.reprocessTimeouts")
      .set("origin", "http://localhost:3000")
      .send({ nowIso: new Date(Date.now() + 300_000).toISOString() });
    expect(reprocessResponse.status, reprocessResponse.text).toBe(200);
    expect(trpcJson(reprocessResponse).deliveryIds).toEqual([]);

    const duplicateAccept = await driverAgentA
      .post("/trpc/deliveries.resolveOffer")
      .set("origin", "http://localhost:3000")
      .send({ deliveryId: created.deliveryId, decision: "accept" });
    expect(duplicateAccept.status).toBe(409);
    expect(trpcErrorMessage(duplicateAccept)).toContain("driver_offer_already_resolved:queue_not_offered");

    const attempts = await db
      .select()
      .from(dispatchAttempts)
      .where(eq(dispatchAttempts.deliveryId, created.deliveryId))
      .orderBy(asc(dispatchAttempts.attemptNumber));
    expect(attempts).toHaveLength(1);
    expect(attempts[0].offerStatus).toBe("accepted");

    const events = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, created.deliveryId))
      .orderBy(asc(deliveryEvents.sequence));
    expect(events.map((event) => event.status)).toEqual(["created", "queued", "offered", "accepted"]);
    expect(events[3].actorType).toBe("driver");
  }, 30000);

  it("progresses rejection strikes per company and blocks further offers after suspension and revocation", async () => {
    const { db } = assertDb();
    const suffix = Date.now() + 1;

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Strikes",
      email: `company.strikes.${suffix}@sendro.test`,
      companyName: "Company Strikes"
    });
    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Strikes",
      email: `retailer.strikes.${suffix}@sendro.test`,
      retailerName: "Retailer Strikes"
    });
    const driverAgent = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Strikes",
      email: `driver.strikes.${suffix}@sendro.test`,
      driverName: "Driver Strikes",
      phone: `+5551${String(suffix).slice(-8)}`
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const retailerProfile = trpcJson(await retailerAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfile = trpcJson(await driverAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `retailer.strikes.${suffix}@sendro.test`)).limit(1);
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

    const createAndReject = async (label: string) => {
      const createResponse = await retailerAgent
        .post("/trpc/deliveries.create")
        .set("origin", "http://localhost:3000")
        .send({ companyId: companyProfile.id, externalReference: label });
      expect(createResponse.status, createResponse.text).toBe(200);
      const created = trpcJson(createResponse);

      const rejectResponse = await driverAgent
        .post("/trpc/deliveries.resolveOffer")
        .set("origin", "http://localhost:3000")
        .send({ deliveryId: created.deliveryId, decision: "reject", reason: "driver_declined_capacity" });
      expect(rejectResponse.status, rejectResponse.text).toBe(200);
      return trpcJson(rejectResponse);
    };

    const first = await createAndReject(`STRIKE-1-${suffix}`);
    expect(first.resolution).toBe("rejected");
    expect(first.strike.consequence).toBe("warning");
    expect(first.delivery.dispatch.phase).toBe("waiting");
    expect(first.delivery.dispatch.waitingReason).toBe("no_candidates_available");

    const second = await createAndReject(`STRIKE-2-${suffix}`);
    expect(second.strike.consequence).toBe("bond_suspended");

    const [suspendedBond] = await db
      .select()
      .from(bonds)
      .where(eq(bonds.entityId, driverProfile.id))
      .limit(1);
    expect(suspendedBond.status).toBe("suspended");

    const blockedCreate = await retailerAgent
      .post("/trpc/deliveries.create")
      .set("origin", "http://localhost:3000")
      .send({ companyId: companyProfile.id, externalReference: `BLOCKED-${suffix}` });
    expect(blockedCreate.status, blockedCreate.text).toBe(200);
    const blocked = trpcJson(blockedCreate);
    expect(blocked.dispatch.phase).toBe("waiting");
    expect(blocked.dispatch.latestSnapshot).toEqual([]);

    await db
      .update(bonds)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(bonds.entityId, driverProfile.id));

    const third = await createAndReject(`STRIKE-3-${suffix}`);
    expect(third.strike.consequence).toBe("bond_revoked");

    const [revokedBond] = await db
      .select()
      .from(bonds)
      .where(eq(bonds.entityId, driverProfile.id))
      .limit(1);
    expect(revokedBond.status).toBe("revoked");

    const strikeRows = await db
      .select()
      .from(driverStrikes)
      .where(eq(driverStrikes.driverId, driverProfile.id))
      .orderBy(asc(driverStrikes.createdAt));
    expect(strikeRows.map((row) => row.consequence)).toEqual(["warning", "bond_suspended", "bond_revoked"]);
  }, 30000);
});
