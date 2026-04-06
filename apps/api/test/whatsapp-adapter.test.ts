import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvolutionGoAdapter } from "../src/lib/whatsapp/evolution-go";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let idx = 0;
  return vi.fn().mockImplementation(async () => {
    const r = responses[idx++] ?? { status: 200, body: {} };
    const body = JSON.stringify(r.body);
    return {
      status: r.status,
      text: async () => body
    } as unknown as Response;
  });
}

const INSTANCE = "sendro-test-company-id";
const adapter = new EvolutionGoAdapter({ apiUrl: "http://evo.local", apiKey: "test-key" });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EvolutionGoAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("connect", () => {
    it("returns qrCode from a successful create response", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{ status: 200, body: { base64: "data:image/png;base64,abc123" } }])
      );

      const result = await adapter.connect(INSTANCE);
      expect(result.qrCode).toBe("data:image/png;base64,abc123");
    });

    it("falls back to connect endpoint on 409 and returns qrCode", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          { status: 409, body: { message: "instance already exists" } },
          { status: 200, body: { base64: "qr-reconnect" } }
        ])
      );

      const result = await adapter.connect(INSTANCE);
      expect(result.qrCode).toBe("qr-reconnect");
    });

    it("returns null qrCode when response has no base64 field", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: {} }]));

      const result = await adapter.connect(INSTANCE);
      expect(result.qrCode).toBeNull();
    });

    it("throws on non-409 error response", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 500, body: { error: "internal" } }]));

      await expect(adapter.connect(INSTANCE)).rejects.toThrow("Evolution Go connect error: 500");
    });
  });

  describe("disconnect", () => {
    it("resolves without throwing on 200", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: {} }]));

      await expect(adapter.disconnect(INSTANCE)).resolves.toBeUndefined();
    });

    it("ignores 404 (already disconnected)", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 404, body: { message: "not found" } }]));

      await expect(adapter.disconnect(INSTANCE)).resolves.toBeUndefined();
    });

    it("throws on non-404 error response", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 500, body: {} }]));

      await expect(adapter.disconnect(INSTANCE)).rejects.toThrow("Evolution Go disconnect error: 500");
    });
  });

  describe("getStatus", () => {
    it("maps Evolution Go 'open' state to 'connected'", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          {
            status: 200,
            body: [{ instance: { instanceName: INSTANCE, state: "open" } }]
          }
        ])
      );

      const result = await adapter.getStatus(INSTANCE);
      expect(result.status).toBe("connected");
    });

    it("maps 'connecting' state to 'connecting'", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          {
            status: 200,
            body: [{ instance: { instanceName: INSTANCE, state: "connecting" } }]
          }
        ])
      );

      const result = await adapter.getStatus(INSTANCE);
      expect(result.status).toBe("connecting");
    });

    it("maps unknown/absent state to 'disconnected'", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          {
            status: 200,
            body: [{ instance: { instanceName: INSTANCE, state: "close" } }]
          }
        ])
      );

      const result = await adapter.getStatus(INSTANCE);
      expect(result.status).toBe("disconnected");
    });

    it("returns disconnected when instance not found in list", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: [] }]));

      const result = await adapter.getStatus(INSTANCE);
      expect(result.status).toBe("disconnected");
    });

    it("throws on HTTP error", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 403, body: {} }]));

      await expect(adapter.getStatus(INSTANCE)).rejects.toThrow("Evolution Go getStatus error: 403");
    });
  });

  describe("sendText", () => {
    it("resolves on 200 success", async () => {
      const fetchMock = mockFetch([{ status: 200, body: { key: { id: "msg-id" } } }]);
      vi.stubGlobal("fetch", fetchMock);

      await expect(adapter.sendText(INSTANCE, "5511999999999", "Hello")).resolves.toBeUndefined();

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://evo.local/message/sendText/${INSTANCE}`);
      const sentBody = JSON.parse(init.body as string);
      expect(sentBody).toEqual({ number: "5511999999999", text: "Hello" });
    });

    it("throws on HTTP error", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 400, body: { error: "invalid number" } }]));

      await expect(adapter.sendText(INSTANCE, "bad", "msg")).rejects.toThrow(
        "Evolution Go sendText error: 400"
      );
    });
  });
});
