import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  assertDb,
  companies,
  users,
  bonds,
  drivers,
  whatsappContactMappings,
  whatsappSessions,
  deliveries,
  dispatchQueueEntries,
  dispatchAttempts
} from "@repo/db";
import { retailers } from "@repo/db";
import { setAdapter } from "../src/lib/whatsapp/sessions";
import {
  notifyDriverOfferViaWhatsApp,
  OFFER_NOTIFICATION_TEXT
} from "../src/lib/whatsapp/notifications";
import type { WhatsAppProvider } from "@repo/shared";

// ─── Mock adapter ─────────────────────────────────────────────────────────────

const sentMessages: Array<{ instanceName: string; to: string; text: string }> = [];
let sendShouldThrow = false;

const mockAdapter: WhatsAppProvider = {
  async connect(_instanceName) {
    return { qrCode: "MOCK_QR" };
  },
  async disconnect(_instanceName) {},
  async getStatus(_instanceName) {
    return { status: "disconnected" as const };
  },
  async sendText(instanceName, to, text) {
    if (sendShouldThrow) throw new Error("mock sendText failure");
    sentMessages.push({ instanceName, to, text });
  }
};

// ─── Seed helper ──────────────────────────────────────────────────────────────

async function seedNotificationScenario(suffix: string) {
  const { db } = assertDb();

  const [companyUser] = await db
    .insert(users)
    .values({
      id: `co-notif-${suffix}`,
      name: "Co Notif",
      email: `co.notif.${suffix}@test.com`,
      emailVerified: true,
      role: "company"
    })
    .returning();
  const [company] = await db
    .insert(companies)
    .values({ userId: companyUser.id, name: `Co Notif ${suffix}`, slug: `co-notif-${suffix}` })
    .returning();

  const [driverUser] = await db
    .insert(users)
    .values({
      id: `drv-notif-${suffix}`,
      name: "Drv Notif",
      email: `drv.notif.${suffix}@test.com`,
      emailVerified: true,
      role: "driver"
    })
    .returning();
  const [driver] = await db
    .insert(drivers)
    .values({ userId: driverUser.id, name: `Driver Notif ${suffix}` })
    .returning();
  await db.insert(bonds).values({
    companyId: company.id,
    entityId: driver.id,
    entityType: "driver",
    status: "active"
  });

  const driverJid = `drvnotif${suffix}@s.whatsapp.net`;
  await db.insert(whatsappContactMappings).values({
    companyId: company.id,
    contactJid: driverJid,
    userId: driverUser.id,
    role: "driver"
  });

  const instanceName = `sendro-${company.id.slice(0, 8)}`;
  await db.insert(whatsappSessions).values({
    companyId: company.id,
    instanceName,
    status: "connected"
  });

  return { company, driverUser, driver, driverJid, instanceName };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("notifyDriverOfferViaWhatsApp", () => {
  beforeAll(() => {
    setAdapter(mockAdapter);
  });

  afterAll(async () => {
    // Clean up seeded data by suffix pattern would be complex; rely on test DB reset
  });

  it("sends the offer notification text to the driver JID", async () => {
    sentMessages.length = 0;
    const suffix = `n1-${Date.now()}`;
    const { company, driverUser, driver, driverJid, instanceName } =
      await seedNotificationScenario(suffix);

    await notifyDriverOfferViaWhatsApp({
      companyId: company.id,
      driverId: driver.id,
      userId: driverUser.id
    });

    const msg = sentMessages.find((m) => m.to === driverJid);
    expect(msg).toBeDefined();
    expect(msg!.text).toBe(OFFER_NOTIFICATION_TEXT);
    expect(msg!.instanceName).toBe(instanceName);
  });

  it("does NOT throw when sendText fails — delivery dispatch is unaffected", async () => {
    sentMessages.length = 0;
    sendShouldThrow = true;
    const suffix = `n2-${Date.now()}`;
    const { company, driverUser, driver } = await seedNotificationScenario(suffix);

    // Must resolve without throwing even when the adapter throws
    await expect(
      notifyDriverOfferViaWhatsApp({
        companyId: company.id,
        driverId: driver.id,
        userId: driverUser.id
      })
    ).resolves.toBeUndefined();

    sendShouldThrow = false;
  });

  it("silently no-ops when no WhatsApp mapping exists for the driver", async () => {
    sentMessages.length = 0;
    const { db } = assertDb();

    // Create a driver with no WhatsApp mapping
    const suffix = `n3-${Date.now()}`;
    const [companyUser] = await db
      .insert(users)
      .values({
        id: `co-nomap-${suffix}`,
        name: "Co NoMap",
        email: `co.nomap.${suffix}@test.com`,
        emailVerified: true,
        role: "company"
      })
      .returning();
    const [company] = await db
      .insert(companies)
      .values({ userId: companyUser.id, name: `Co NoMap ${suffix}`, slug: `co-nomap-${suffix}` })
      .returning();
    const [driverUser] = await db
      .insert(users)
      .values({
        id: `drv-nomap-${suffix}`,
        name: "Drv NoMap",
        email: `drv.nomap.${suffix}@test.com`,
        emailVerified: true,
        role: "driver"
      })
      .returning();
    const [driver] = await db
      .insert(drivers)
      .values({ userId: driverUser.id, name: `Driver NoMap ${suffix}` })
      .returning();

    // No mapping inserted — should silently return
    await expect(
      notifyDriverOfferViaWhatsApp({
        companyId: company.id,
        driverId: driver.id,
        userId: driverUser.id
      })
    ).resolves.toBeUndefined();

    expect(sentMessages.length).toBe(0);
  });

  it("silently no-ops when no WhatsApp session exists for the company", async () => {
    sentMessages.length = 0;
    const { db } = assertDb();

    // Create mapping but no session
    const suffix = `n4-${Date.now()}`;
    const [companyUser] = await db
      .insert(users)
      .values({
        id: `co-noses-${suffix}`,
        name: "Co NoSes",
        email: `co.noses.${suffix}@test.com`,
        emailVerified: true,
        role: "company"
      })
      .returning();
    const [company] = await db
      .insert(companies)
      .values({ userId: companyUser.id, name: `Co NoSes ${suffix}`, slug: `co-noses-${suffix}` })
      .returning();
    const [driverUser] = await db
      .insert(users)
      .values({
        id: `drv-noses-${suffix}`,
        name: "Drv NoSes",
        email: `drv.noses.${suffix}@test.com`,
        emailVerified: true,
        role: "driver"
      })
      .returning();
    const [driver] = await db
      .insert(drivers)
      .values({ userId: driverUser.id, name: `Driver NoSes ${suffix}` })
      .returning();

    const driverJid = `drvnoses${suffix}@s.whatsapp.net`;
    await db.insert(whatsappContactMappings).values({
      companyId: company.id,
      contactJid: driverJid,
      userId: driverUser.id,
      role: "driver"
    });
    // No session inserted

    await expect(
      notifyDriverOfferViaWhatsApp({
        companyId: company.id,
        driverId: driver.id,
        userId: driverUser.id
      })
    ).resolves.toBeUndefined();

    expect(sentMessages.length).toBe(0);
  });
});
