import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/index";
import { setAdapter } from "../src/lib/whatsapp/sessions";
import type { WhatsAppProvider } from "@repo/shared";

// ─── Mock adapter ─────────────────────────────────────────────────────────────

const mockConnect = vi.fn().mockResolvedValue({ qrCode: "MOCK_QR_CODE" });
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockGetStatus = vi.fn().mockResolvedValue({ status: "disconnected" as const });
const mockSendText = vi.fn().mockResolvedValue(undefined);

const mockAdapter: WhatsAppProvider = {
  connect: mockConnect,
  disconnect: mockDisconnect,
  getStatus: mockGetStatus,
  sendText: mockSendText
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const registerAndLogin = async (
  app: FastifyInstance,
  input: { role: "company"; name: string; email: string; companyName: string }
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

describe.skipIf(!process.env.DATABASE_URL)("whatsapp integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    setAdapter(mockAdapter);
    app = await buildApp();
    await app.ready();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  }, 30000);

  it("connectSession transitions status to connecting and stores qrCode", async () => {
    const suffix = Date.now();
    const agent = await registerAndLogin(app, {
      role: "company",
      name: "WA Company 1",
      email: `wa1.${suffix}@sendro.test`,
      companyName: "WA Company 1"
    });

    mockConnect.mockResolvedValueOnce({ qrCode: "MOCK_QR_CONNECT" });

    const res = await agent
      .post("/trpc/whatsapp.connect")
      .set("origin", "http://localhost:3000")
      .set("content-type", "application/json")
      .send({});

    expect(res.status, res.text).toBeLessThan(400);
    const data = trpcJson(res);
    expect(data.status).toBe("connecting");
    expect(data.qrCode).toBe("MOCK_QR_CONNECT");
  });

  it("webhook connection.update with state 'open' transitions to connected", async () => {
    const suffix = Date.now();
    const agent = await registerAndLogin(app, {
      role: "company",
      name: "WA Company 2",
      email: `wa2.${suffix}@sendro.test`,
      companyName: "WA Company 2"
    });

    // First connect to create session
    mockConnect.mockResolvedValueOnce({ qrCode: "QR2" });
    const connectRes = await agent
      .post("/trpc/whatsapp.connect")
      .set("origin", "http://localhost:3000")
      .set("content-type", "application/json")
      .send({});
    expect(connectRes.status, connectRes.text).toBeLessThan(400);

    // Determine instance name from sessionStatus
    const statusRes = await agent
      .get("/trpc/whatsapp.sessionStatus")
      .set("origin", "http://localhost:3000");
    expect(statusRes.status, statusRes.text).toBeLessThan(400);
    const sessionData = trpcJson(statusRes);
    const instanceName = sessionData.instanceName as string;

    // Send webhook event
    const webhookRes = await request(app.server)
      .post("/webhooks/whatsapp")
      .set("content-type", "application/json")
      .send({ event: "connection.update", instance: instanceName, data: { state: "open" } });
    expect(webhookRes.status).toBe(200);

    // Verify status is now connected
    const statusRes2 = await agent
      .get("/trpc/whatsapp.sessionStatus")
      .set("origin", "http://localhost:3000");
    const sessionData2 = trpcJson(statusRes2);
    expect(sessionData2.status).toBe("connected");
  });

  it("webhook connection.update with state 'close' transitions to disconnected with reason", async () => {
    const suffix = Date.now();
    const agent = await registerAndLogin(app, {
      role: "company",
      name: "WA Company 3",
      email: `wa3.${suffix}@sendro.test`,
      companyName: "WA Company 3"
    });

    mockConnect.mockResolvedValueOnce({ qrCode: "QR3" });
    const connectRes = await agent
      .post("/trpc/whatsapp.connect")
      .set("origin", "http://localhost:3000")
      .set("content-type", "application/json")
      .send({});
    expect(connectRes.status).toBeLessThan(400);

    const statusRes = await agent
      .get("/trpc/whatsapp.sessionStatus")
      .set("origin", "http://localhost:3000");
    const sessionData = trpcJson(statusRes);
    const instanceName = sessionData.instanceName as string;

    const webhookRes = await request(app.server)
      .post("/webhooks/whatsapp")
      .set("content-type", "application/json")
      .send({
        event: "connection.update",
        instance: instanceName,
        data: { state: "close", reason: "loggedOut" }
      });
    expect(webhookRes.status).toBe(200);

    const statusRes2 = await agent
      .get("/trpc/whatsapp.sessionStatus")
      .set("origin", "http://localhost:3000");
    const sessionData2 = trpcJson(statusRes2);
    expect(sessionData2.status).toBe("disconnected");
    expect(sessionData2.lastError).toBe("loggedOut");
  });

  it("webhook messages.upsert triggers sendText call (mock adapter)", async () => {
    const suffix = Date.now();
    const agent = await registerAndLogin(app, {
      role: "company",
      name: "WA Company 4",
      email: `wa4.${suffix}@sendro.test`,
      companyName: "WA Company 4"
    });

    mockConnect.mockResolvedValueOnce({ qrCode: "QR4" });
    await agent
      .post("/trpc/whatsapp.connect")
      .set("origin", "http://localhost:3000")
      .set("content-type", "application/json")
      .send({});

    const statusRes = await agent
      .get("/trpc/whatsapp.sessionStatus")
      .set("origin", "http://localhost:3000");
    const sessionData = trpcJson(statusRes);
    const instanceName = sessionData.instanceName as string;

    // Move to connected so handleMessage fires
    await request(app.server)
      .post("/webhooks/whatsapp")
      .set("content-type", "application/json")
      .send({ event: "connection.update", instance: instanceName, data: { state: "open" } });

    mockSendText.mockClear();

    const webhookRes = await request(app.server)
      .post("/webhooks/whatsapp")
      .set("content-type", "application/json")
      .send({
        event: "messages.upsert",
        instance: instanceName,
        data: {
          messages: [
            {
              key: { remoteJid: "5511999990000@s.whatsapp.net" },
              message: { conversation: "Olá" }
            }
          ]
        }
      });
    expect(webhookRes.status).toBe(200);
    expect(mockSendText).toHaveBeenCalledOnce();
    expect(mockSendText).toHaveBeenCalledWith(
      instanceName,
      "5511999990000@s.whatsapp.net",
      "Olá! Bot Sendro ativo."
    );
  });

  it("disconnectSession calls adapter.disconnect and sets status disconnected", async () => {
    const suffix = Date.now();
    const agent = await registerAndLogin(app, {
      role: "company",
      name: "WA Company 5",
      email: `wa5.${suffix}@sendro.test`,
      companyName: "WA Company 5"
    });

    mockConnect.mockResolvedValueOnce({ qrCode: "QR5" });
    await agent
      .post("/trpc/whatsapp.connect")
      .set("origin", "http://localhost:3000")
      .set("content-type", "application/json")
      .send({});

    mockDisconnect.mockClear();

    const res = await agent
      .post("/trpc/whatsapp.disconnect")
      .set("origin", "http://localhost:3000")
      .set("content-type", "application/json")
      .send({});

    expect(res.status, res.text).toBeLessThan(400);
    const data = trpcJson(res);
    expect(data.status).toBe("disconnected");
    expect(mockDisconnect).toHaveBeenCalledOnce();
  });
});
