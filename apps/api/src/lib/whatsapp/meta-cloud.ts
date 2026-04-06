import type { WhatsAppProvider } from "@repo/shared";

interface MetaCloudConfig {
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
}

/**
 * Stub adapter for Meta Cloud API (https://developers.facebook.com/docs/whatsapp/cloud-api).
 * Enterprise / Meta-official channel — no third-party intermediary.
 * Provider column value: 'meta-cloud-api'
 *
 * To switch to this provider:
 *   1. Import MetaCloudApiAdapter in apps/api/src/lib/whatsapp/sessions.ts
 *   2. Call setAdapter(new MetaCloudApiAdapter({ phoneNumberId, accessToken, wabaId }))
 *   3. Update provider column to 'meta-cloud-api'
 *
 * BotOrchestrator (intake.ts / driver.ts) requires zero changes.
 */
export class MetaCloudApiAdapter implements WhatsAppProvider {
  constructor(_config: MetaCloudConfig) {
    // Config accepted for documentation purposes — implementation pending.
    void _config;
  }

  async connect(_instanceName: string): Promise<{ qrCode: string | null }> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new MetaCloudApiAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }

  async disconnect(_instanceName: string): Promise<void> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new MetaCloudApiAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }

  async getStatus(
    _instanceName: string
  ): Promise<{ status: "connected" | "disconnected" | "connecting" }> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new MetaCloudApiAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }

  async sendText(_instanceName: string, _to: string, _text: string): Promise<void> {
    throw new Error(
      "not implemented — switch provider by calling setAdapter(new MetaCloudApiAdapter(config)) in apps/api/src/lib/whatsapp/sessions.ts"
    );
  }
}
