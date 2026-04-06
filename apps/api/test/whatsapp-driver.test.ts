import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  assertDb,
  companies,
  users,
  bonds,
  drivers,
  whatsappContactMappings,
  conversationStates,
  deliveries,
  dispatchQueueEntries,
  dispatchAttempts
} from "@repo/db";
import { setAdapter } from "../src/lib/whatsapp/sessions";
import { processDriverMessage } from "../src/lib/whatsapp/driver";
import type { WhatsAppProvider } from "@repo/shared";

// ─── Mock adapter ─────────────────────────────────────────────────────────────

const sentMessages: Array<{ to: string; text: string }> = [];

const mockAdapter: WhatsAppProvider = {
  async connect(_instanceName) {
    return { qrCode: "MOCK_QR" };
  },
  async disconnect(_instanceName) {},
  async getStatus(_instanceName) {
    return { status: "disconnected" as const };
  },
  async sendText(_instanceName, to, text) {
    sentMessages.push({ to, text });
  }
};

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedDriverScenario(suffix: string) {
  const { db } = assertDb();

  // Company user + company
  const [companyUser] = await db
    .insert(users)
    .values({ id: `co-user-drv-${suffix}`, name: "Co Drv", email: `co.drv.${suffix}@test.com`, emailVerified: true, role: "company" })
    .returning();
  const [company] = await db
    .insert(companies)
    .values({ userId: companyUser.id, name: `Co Drv ${suffix}`, slug: `co-drv-${suffix}` })
    .returning();

  // Driver user + driver profile + active bond
  const [driverUser] = await db
    .insert(users)
    .values({ id: `drv-user-${suffix}`, name: "Drv User", email: `drv.${suffix}@test.com`, emailVerified: true, role: "driver" })
    .returning();
  const [driver] = await db
    .insert(drivers)
    .values({ userId: driverUser.id, name: `Driver ${suffix}`, phone: `+55${suffix.replace(/\D/g, "").slice(0, 11)}` })
    .returning();
  await db.insert(bonds).values({
    companyId: company.id,
    entityId: driver.id,
    entityType: "driver",
    status: "active"
  });

  // WhatsApp contact mapping with role='driver'
  const contactJid = `drv${suffix}@s.whatsapp.net`;
  await db.insert(whatsappContactMappings).values({
    companyId: company.id,
    contactJid,
    userId: driverUser.id,
    role: "driver"
  });

  return { company, driverUser, driver, contactJid };
}

async function seedDeliveryWithOffer(companyId: string, driverId: string) {
  const { db } = assertDb();
  const suffix = Date.now().toString();

  // Need a retailer user for the delivery (just set companyId, retailerId can be null-ish)
  // Use a system retailer placeholder
  const [retailerUser] = await db
    .insert(users)
    .values({ id: `ret-user-d-${suffix}`, name: "Ret", email: `ret.d.${suffix}@test.com`, emailVerified: true, role: "retailer" })
    .returning();
  const { retailers } = await import("@repo/db");
  const [retailer] = await db
    .insert(retailers)
    .values({ userId: retailerUser.id, name: `Ret ${suffix}`, slug: `ret-d-${suffix}` })
    .returning();

  const [delivery] = await db
    .insert(deliveries)
    .values({
      companyId,
      retailerId: retailer.id,
      status: "offered",
      pickupAddress: "Rua Pickup, 1",
      dropoffAddress: "Rua Dropoff, 2"
    })
    .returning();

  const expiresAt = new Date(Date.now() + 120_000);
  const [queueEntry] = await db
    .insert(dispatchQueueEntries)
    .values({
      deliveryId: delivery.id,
      companyId,
      phase: "offered",
      timeoutSeconds: 120,
      rankingVersion: "dispatch-v1",
      offeredDriverId: driverId,
      offeredDriverName: "Test Driver",
      offeredAt: new Date(),
      deadlineAt: expiresAt,
      assumptions: sql`'[]'::jsonb`,
      latestSnapshot: sql`'[]'::jsonb`
    })
    .returning();

  const [attempt] = await db
    .insert(dispatchAttempts)
    .values({
      deliveryId: delivery.id,
      queueEntryId: queueEntry.id,
      companyId,
      attemptNumber: 1,
      driverId,
      offerStatus: "pending",
      expiresAt,
      candidateSnapshot: sql`'{}'::jsonb`
    })
    .returning();

  // Update queue entry to reference the attempt
  await db
    .update(dispatchQueueEntries)
    .set({ activeAttemptId: attempt.id })
    .where(eq(dispatchQueueEntries.id, queueEntry.id));

  return { delivery, queueEntry, attempt };
}

async function seedAcceptedDelivery(companyId: string, driverId: string) {
  const { db } = assertDb();
  const suffix = `acc-${Date.now()}`;
  const [retailerUser] = await db
    .insert(users)
    .values({ id: `ret-user-a-${suffix}`, name: "Ret A", email: `ret.a.${suffix}@test.com`, emailVerified: true, role: "retailer" })
    .returning();
  const { retailers } = await import("@repo/db");
  const [retailer] = await db
    .insert(retailers)
    .values({ userId: retailerUser.id, name: `Ret A ${suffix}`, slug: `ret-a-${suffix}` })
    .returning();

  const [delivery] = await db
    .insert(deliveries)
    .values({
      companyId,
      retailerId: retailer.id,
      driverId,
      status: "accepted",
      pickupAddress: "Rua Pickup, 10",
      dropoffAddress: "Rua Dropoff, 20"
    })
    .returning();

  return { delivery };
}

async function seedPickedUpDelivery(companyId: string, driverId: string) {
  const { db } = assertDb();
  const suffix = `pu-${Date.now()}`;
  const [retailerUser] = await db
    .insert(users)
    .values({ id: `ret-user-p-${suffix}`, name: "Ret P", email: `ret.p.${suffix}@test.com`, emailVerified: true, role: "retailer" })
    .returning();
  const { retailers } = await import("@repo/db");
  const [retailer] = await db
    .insert(retailers)
    .values({ userId: retailerUser.id, name: `Ret P ${suffix}`, slug: `ret-p-${suffix}` })
    .returning();

  const [delivery] = await db
    .insert(deliveries)
    .values({
      companyId,
      retailerId: retailer.id,
      driverId,
      status: "picked_up",
      pickupAddress: "Rua Pickup, 30",
      dropoffAddress: "Rua Dropoff, 40"
    })
    .returning();

  return { delivery };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.DATABASE_URL)("whatsapp driver", () => {
  beforeAll(() => {
    setAdapter(mockAdapter);
  });

  afterAll(() => {
    // Reset adapter
    setAdapter(mockAdapter);
  });

  it("accept offer: 'aceitar' → delivery status becomes accepted", async () => {
    const { db } = assertDb();
    const suffix = `${Date.now()}a`;
    const { company, driverUser, driver, contactJid } = await seedDriverScenario(suffix);
    const { delivery } = await seedDeliveryWithOffer(company.id, driver.id);

    const replies: string[] = [];
    await processDriverMessage({
      instanceName: `sendro-${company.id.slice(0, 8)}`,
      companyId: company.id,
      contactJid,
      messageId: "msg-accept-001",
      messageText: "aceitar",
      sendReply: async (t) => { replies.push(t); }
    });

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id)).limit(1);
    expect(updated.status).toBe("accepted");
    expect(replies[0]).toContain("aceita");
  });

  it("refuse offer: 'recusar' → offer rejected, reply confirms", async () => {
    const { db } = assertDb();
    const suffix = `${Date.now()}b`;
    const { company, driver, contactJid } = await seedDriverScenario(suffix);
    const { delivery } = await seedDeliveryWithOffer(company.id, driver.id);

    const replies: string[] = [];
    await processDriverMessage({
      instanceName: `sendro-${company.id.slice(0, 8)}`,
      companyId: company.id,
      contactJid,
      messageId: "msg-refuse-001",
      messageText: "recusar",
      sendReply: async (t) => { replies.push(t); }
    });

    // Delivery reverts to queued or waiting (not accepted)
    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id)).limit(1);
    expect(["queued", "waiting"]).toContain(updated.status);
    expect(replies[0]).toContain("recusada");
  });

  it("update to picked_up: 'coletado' → delivery becomes picked_up", async () => {
    const { db } = assertDb();
    const suffix = `${Date.now()}c`;
    const { company, driver, contactJid } = await seedDriverScenario(suffix);
    const { delivery } = await seedAcceptedDelivery(company.id, driver.id);

    const replies: string[] = [];
    await processDriverMessage({
      instanceName: `sendro-${company.id.slice(0, 8)}`,
      companyId: company.id,
      contactJid,
      messageId: "msg-pickup-001",
      messageText: "coletado",
      sendReply: async (t) => { replies.push(t); }
    });

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id)).limit(1);
    expect(updated.status).toBe("picked_up");
    expect(replies[0]).toContain("coletado");
  });

  it("update to in_transit: 'em entrega' → delivery becomes in_transit", async () => {
    const { db } = assertDb();
    const suffix = `${Date.now()}d`;
    const { company, driver, contactJid } = await seedDriverScenario(suffix);
    const { delivery } = await seedPickedUpDelivery(company.id, driver.id);

    const replies: string[] = [];
    await processDriverMessage({
      instanceName: `sendro-${company.id.slice(0, 8)}`,
      companyId: company.id,
      contactJid,
      messageId: "msg-transit-001",
      messageText: "em entrega",
      sendReply: async (t) => { replies.push(t); }
    });

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id)).limit(1);
    expect(updated.status).toBe("in_transit");
    expect(replies[0]).toContain("trânsito");
  });

  it("submit proof via mediaUrl → delivery becomes delivered with photoUrl", async () => {
    const { db } = assertDb();
    const suffix = `${Date.now()}e`;
    const { company, driver, contactJid } = await seedDriverScenario(suffix);
    const { delivery } = await seedPickedUpDelivery(company.id, driver.id);

    const replies: string[] = [];
    await processDriverMessage({
      instanceName: `sendro-${company.id.slice(0, 8)}`,
      companyId: company.id,
      contactJid,
      messageId: "msg-proof-001",
      messageText: "",
      imageUrl: "https://cdn.example.com/proof.jpg",
      sendReply: async (t) => { replies.push(t); }
    });

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id)).limit(1);
    expect(updated.status).toBe("delivered");
    expect(updated.proofPhotoUrl).toBe("https://cdn.example.com/proof.jpg");
    expect(replies[0]).toContain("concluída");
  });

  it("idempotency: same messageId twice → only one state change", async () => {
    const { db } = assertDb();
    const suffix = `${Date.now()}f`;
    const { company, driver, contactJid } = await seedDriverScenario(suffix);
    const { delivery } = await seedAcceptedDelivery(company.id, driver.id);

    const replies: string[] = [];
    const opts = {
      instanceName: `sendro-${company.id.slice(0, 8)}`,
      companyId: company.id,
      contactJid,
      messageId: "msg-dedup-driver",
      messageText: "coletado",
      sendReply: async (t: string) => { replies.push(t); }
    };

    await processDriverMessage(opts);
    await processDriverMessage(opts); // second call with same messageId

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id)).limit(1);
    expect(updated.status).toBe("picked_up");
    // Second call should be silently skipped, so only one reply
    expect(replies.length).toBe(1);
  });

  it("unknown driver JID → reply with não autorizado", async () => {
    const { db } = assertDb();
    const suffix = `${Date.now()}g`;
    const { company } = await seedDriverScenario(suffix);
    const unknownJid = `unknown${suffix}@s.whatsapp.net`;

    const replies: string[] = [];
    await processDriverMessage({
      instanceName: `sendro-${company.id.slice(0, 8)}`,
      companyId: company.id,
      contactJid: unknownJid,
      messageId: "msg-unauth-001",
      messageText: "aceitar",
      sendReply: async (t) => { replies.push(t); }
    });

    expect(replies[0]).toContain("não autorizado");
  });
});
