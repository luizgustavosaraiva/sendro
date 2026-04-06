import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/index";
import { assertDb } from "@repo/db";
import { whatsappSessions, companies } from "@repo/db/schema";
import { eq } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const registerCompany = async (
  app: FastifyInstance,
  suffix: string
): Promise<string> => {
  const agent = request.agent(app.server);
  const res = await agent
    .post("/api/auth/sign-up/email")
    .set("origin", "http://localhost:3000")
    .send({
      role: "company",
      name: `Health Test ${suffix}`,
      email: `health.${suffix}@sendro.test`,
      companyName: `Health Co ${suffix}`,
      password: "secret123"
    });
  if (res.status >= 400) {
    throw new Error(`sign-up failed: ${res.text}`);
  }
  // Fetch companyId from DB by name
  const { db } = assertDb();
  // company.name is set from user.name (not companyName) — see register.ts line 41
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.name, `Health Test ${suffix}`))
    .limit(1);
  if (!company) throw new Error("company not found after sign-up");
  return company.id;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.DATABASE_URL)("whatsapp health endpoint", () => {
  let app: FastifyInstance;
  const insertedSessionIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  }, 30000);

  afterAll(async () => {
    if (insertedSessionIds.length > 0) {
      const { db } = assertDb();
      for (const id of insertedSessionIds) {
        await db.delete(whatsappSessions).where(eq(whatsappSessions.id, id));
      }
    }
    if (app) await app.close();
  }, 30000);

  it("returns 404 for unknown companyId", async () => {
    const res = await request(app.server)
      .get("/health/whatsapp/00000000-0000-0000-0000-000000000000")
      .expect(404);
    expect(res.body).toEqual({ error: "session not found" });
  });

  it("returns degraded:true for a disconnected session", async () => {
    const suffix = `disc-${Date.now()}`;
    const companyId = await registerCompany(app, suffix);
    const { db } = assertDb();
    const [row] = await db
      .insert(whatsappSessions)
      .values({
        companyId,
        instanceName: `test-instance-${companyId}`,
        status: "disconnected",
        provider: "evolution-go",
        lastError: null
      })
      .returning();
    insertedSessionIds.push(row!.id);

    const res = await request(app.server)
      .get(`/health/whatsapp/${companyId}`)
      .expect(200);

    expect(res.body.status).toBe("disconnected");
    expect(res.body.provider).toBe("evolution-go");
    expect(res.body.lastError).toBeNull();
    expect(res.body.degraded).toBe(true);
  });

  it("returns degraded:false for a connected session", async () => {
    const suffix = `conn-${Date.now()}`;
    const companyId = await registerCompany(app, suffix);
    const { db } = assertDb();
    const [row] = await db
      .insert(whatsappSessions)
      .values({
        companyId,
        instanceName: `test-instance-${companyId}`,
        status: "connected",
        provider: "evolution-go",
        lastError: null
      })
      .returning();
    insertedSessionIds.push(row!.id);

    const res = await request(app.server)
      .get(`/health/whatsapp/${companyId}`)
      .expect(200);

    expect(res.body.status).toBe("connected");
    expect(res.body.degraded).toBe(false);
  });

  it("returns lastError when present", async () => {
    const suffix = `err-${Date.now()}`;
    const companyId = await registerCompany(app, suffix);
    const { db } = assertDb();
    const [row] = await db
      .insert(whatsappSessions)
      .values({
        companyId,
        instanceName: `test-instance-${companyId}`,
        status: "disconnected",
        provider: "evolution-go",
        lastError: "LOGGED_OUT"
      })
      .returning();
    insertedSessionIds.push(row!.id);

    const res = await request(app.server)
      .get(`/health/whatsapp/${companyId}`)
      .expect(200);

    expect(res.body.lastError).toBe("LOGGED_OUT");
  });
});
