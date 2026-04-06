import type { WhatsAppProvider } from "@repo/shared";

interface ZApiConfig {
  instanceId: string;
  token: string;
  clientToken: string;
}

/**
 * Stub adapter for Z-API (https://z-api.io).
 * SaaS-managed fallback — no self-hosting required.
 * Provider column value: 'z-api'
 *
 * To switch to this provider:
 *   1. Import ZApiAdapter in apps/api/src/lib/whatsapp/sessions.ts
 *   2. Call setAdapter(new ZApiAdapter({ instanceId, token, clientToken }))
 *   3. Update provider column to 'z-api'
 *
 * BotOrchestrator (intake.ts / driver.ts) requires zero changes.
 */
export class ZApiAdapter implements WhatsAppProvider {
  constructor(_config: ZApiConfig) {
    // Config accepted for documentation purposes — implementation pending.
    void _config;
  }

  async connect(_instanceName: string): Promise<{ qrCode: string | null }> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new ZApiAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }

  async disconnect(_instanceName: string): Promise<void> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new ZApiAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }

  async getStatus(
    _instanceName: string
  ): Promise<{ status: "connected" | "disconnected" | "connecting" }> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new ZApiAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }

  async sendText(_instanceName: string, _to: string, _text: string): Promise<void> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new ZApiAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }
}
