import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { assertDb, bonds, invitations } from "@repo/db";
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

describe.skipIf(!process.env.DATABASE_URL)("invitations integration", () => {
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

  it("creates, lists, looks up publicly, and redeems a single-use invitation", async () => {
    const { db } = assertDb();
    const suffix = Date.now();

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Invite",
      email: `company-invite.${suffix}@sendro.test`,
      companyName: "Company Invite"
    });

    const driverAgent = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Invite",
      email: `driver-invite.${suffix}@sendro.test`,
      driverName: "Driver Invite",
      phone: `+5511${String(suffix).slice(-8)}`
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfile = trpcJson(await driverAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const createResponse = await companyAgent
      .post("/trpc/invitations.createCompanyInvitation")
      .set("origin", "http://localhost:3000")
      .send({ channel: "link", invitedContact: "driver-invite@lookup.test" });
    expect(createResponse.status, createResponse.text).toBe(200);

    const createdInvitation = trpcJson(createResponse);
    expect(createdInvitation.companyId).toBe(companyProfile.id);
    expect(createdInvitation.status).toBe("pending");
    expect(createdInvitation.channel).toBe("link");
    expect(createdInvitation.token.length).toBeGreaterThanOrEqual(16);

    const listResponse = await companyAgent.get("/trpc/invitations.listCompanyInvitations").set("origin", "http://localhost:3000");
    expect(listResponse.status, listResponse.text).toBe(200);
    expect(trpcJson(listResponse)).toHaveLength(1);
    expect(trpcJson(listResponse)[0]).toMatchObject({
      invitationId: createdInvitation.invitationId,
      status: "pending",
      invitedContact: "driver-invite@lookup.test"
    });

    const lookupResponse = await request(app.server)
      .get(`/api/invitations/${createdInvitation.token}`)
      .set("origin", "http://localhost:3000");
    expect(lookupResponse.status, lookupResponse.text).toBe(200);
    expect(lookupResponse.body).toMatchObject({
      invitationId: createdInvitation.invitationId,
      companyId: companyProfile.id,
      companyName: "Company Invite",
      companySlug: companyProfile.slug,
      token: createdInvitation.token,
      channel: "link",
      status: "pending"
    });

    const redeemResponse = await driverAgent
      .post("/trpc/invitations.redeemInvitation")
      .set("origin", "http://localhost:3000")
      .send({ token: createdInvitation.token });
    expect(redeemResponse.status, redeemResponse.text).toBe(200);
    expect(trpcJson(redeemResponse)).toMatchObject({
      invitationId: createdInvitation.invitationId,
      companyId: companyProfile.id,
      driverId: driverProfile.id,
      invitationStatus: "accepted",
      bondStatus: "active",
      diagnostics: { bondAction: "created" }
    });

    const [acceptedInvitation] = await db.select().from(invitations).where(eq(invitations.id, createdInvitation.invitationId)).limit(1);
    expect(acceptedInvitation?.status).toBe("accepted");
    expect(acceptedInvitation?.acceptedAt).toBeTruthy();

    const [driverBond] = await db
      .select()
      .from(bonds)
      .where(
        and(
          eq(bonds.companyId, companyProfile.id),
          eq(bonds.entityId, driverProfile.id),
          eq(bonds.entityType, "driver")
        )
      )
      .limit(1);
    expect(driverBond).toMatchObject({ companyId: companyProfile.id, entityId: driverProfile.id, entityType: "driver", status: "active" });
  }, 30000);

  it("rejects missing, expired, accepted, and wrong-role invitation flows while reusing existing driver bonds", async () => {
    const { db } = assertDb();
    const suffix = Date.now() + 1;

    const companyAgent = await registerAndLogin(app, {
      role: "company",
      name: "Company Invite Negative",
      email: `company-invite-negative.${suffix}@sendro.test`,
      companyName: "Company Invite Negative"
    });

    const driverAgent = await registerAndLogin(app, {
      role: "driver",
      name: "Driver Invite Negative",
      email: `driver-invite-negative.${suffix}@sendro.test`,
      driverName: "Driver Invite Negative",
      phone: `+5521${String(suffix).slice(-8)}`
    });

    const retailerAgent = await registerAndLogin(app, {
      role: "retailer",
      name: "Retailer Invite Negative",
      email: `retailer-invite-negative.${suffix}@sendro.test`,
      retailerName: "Retailer Invite Negative"
    });

    const companyProfile = trpcJson(await companyAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;
    const driverProfile = trpcJson(await driverAgent.get("/trpc/user.me").set("origin", "http://localhost:3000")).profile;

    const missingLookup = await request(app.server).get("/api/invitations/missing-token-value-1234").set("origin", "http://localhost:3000");
    expect(missingLookup.status).toBe(404);
    expect(missingLookup.body.message).toContain("invitation_token_not_found");

    const wrongRoleCreate = await driverAgent
      .post("/trpc/invitations.createCompanyInvitation")
      .set("origin", "http://localhost:3000")
      .send({ channel: "link" });
    expect(wrongRoleCreate.status).toBe(403);
    expect(trpcErrorMessage(wrongRoleCreate)).toContain("bond_role_forbidden:company_required");

    const malformedRedeem = await driverAgent
      .post("/trpc/invitations.redeemInvitation")
      .set("origin", "http://localhost:3000")
      .send({ token: "short" });
    expect(malformedRedeem.status).toBe(400);

    const expiredCreate = await companyAgent
      .post("/trpc/invitations.createCompanyInvitation")
      .set("origin", "http://localhost:3000")
      .send({ channel: "email", invitedContact: "expired@test.dev", expiresAt: new Date(Date.now() + 1000).toISOString() });
    expect(expiredCreate.status, expiredCreate.text).toBe(200);
    const expiredInvitation = trpcJson(expiredCreate);

    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 60_000), updatedAt: new Date() })
      .where(eq(invitations.id, expiredInvitation.invitationId));

    const expiredLookup = await request(app.server)
      .get(`/api/invitations/${expiredInvitation.token}`)
      .set("origin", "http://localhost:3000");
    expect(expiredLookup.status).toBe(200);
    expect(expiredLookup.body.status).toBe("expired");

    const expiredRedeem = await driverAgent
      .post("/trpc/invitations.redeemInvitation")
      .set("origin", "http://localhost:3000")
      .send({ token: expiredInvitation.token });
    expect(expiredRedeem.status).toBe(403);
    expect(trpcErrorMessage(expiredRedeem)).toContain("invitation_token_expired");

    const reusableCreate = await companyAgent
      .post("/trpc/invitations.createCompanyInvitation")
      .set("origin", "http://localhost:3000")
      .send({ channel: "whatsapp", invitedContact: "+5511999887766" });
    expect(reusableCreate.status, reusableCreate.text).toBe(200);
    const reusableInvitation = trpcJson(reusableCreate);

    await db.insert(bonds).values({
      companyId: companyProfile.id,
      entityId: driverProfile.id,
      entityType: "driver",
      status: "suspended",
      requestedByUserId: null
    });

    const reactivatedRedeem = await driverAgent
      .post("/trpc/invitations.redeemInvitation")
      .set("origin", "http://localhost:3000")
      .send({ token: reusableInvitation.token });
    expect(reactivatedRedeem.status, reactivatedRedeem.text).toBe(200);
    expect(trpcJson(reactivatedRedeem)).toMatchObject({
      invitationId: reusableInvitation.invitationId,
      bondStatus: "active",
      diagnostics: { bondAction: "reactivated" }
    });

    const repeatedRedeem = await driverAgent
      .post("/trpc/invitations.redeemInvitation")
      .set("origin", "http://localhost:3000")
      .send({ token: reusableInvitation.token });
    expect(repeatedRedeem.status).toBe(409);
    expect(trpcErrorMessage(repeatedRedeem)).toContain("invitation_token_already_accepted");

    const [activeBond] = await db
      .select()
      .from(bonds)
      .where(
        and(
          eq(bonds.companyId, companyProfile.id),
          eq(bonds.entityId, driverProfile.id),
          eq(bonds.entityType, "driver")
        )
      )
      .limit(1);
    expect(activeBond?.status).toBe("active");

    const retailerRedeem = await retailerAgent
      .post("/trpc/invitations.redeemInvitation")
      .set("origin", "http://localhost:3000")
      .send({ token: expiredInvitation.token });
    expect(retailerRedeem.status).toBe(403);
    expect(trpcErrorMessage(retailerRedeem)).toContain("bond_role_forbidden:driver_required");
  }, 30000);
});
