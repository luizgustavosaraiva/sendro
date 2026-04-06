import type { WhatsAppProvider } from "@repo/shared";

interface WahaConfig {
  apiUrl: string;
  apiKey: string;
}

/**
 * Stub adapter for WAHA (WhatsApp HTTP API — https://waha.devlike.pro).
 * Self-hosted alternative to Evolution Go.
 * Provider column value: 'waha'
 *
 * To switch to this provider:
 *   1. Import WahaAdapter in apps/api/src/lib/whatsapp/sessions.ts
 *   2. Call setAdapter(new WahaAdapter({ apiUrl, apiKey }))
 *   3. Update provider column to 'waha'
 *
 * BotOrchestrator (intake.ts / driver.ts) requires zero changes.
 */
export class WahaAdapter implements WhatsAppProvider {
  constructor(_config: WahaConfig) {
    // Config accepted for documentation purposes — implementation pending.
    void _config;
  }

  async connect(_instanceName: string): Promise<{ qrCode: string | null }> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new WahaAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }

  async disconnect(_instanceName: string): Promise<void> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new WahaAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }

  async getStatus(
    _instanceName: string
  ): Promise<{ status: "connected" | "disconnected" | "connecting" }> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new WahaAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }

  async sendText(_instanceName: string, _to: string, _text: string): Promise<void> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new WahaAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }
}
