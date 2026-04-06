import type { WhatsAppProvider } from "@repo/shared";

interface EvolutionGoConfig {
  apiUrl: string;
  apiKey: string;
}

/**
 * Adapter for Evolution Go (https://evolution-api.com).
 * Implements WhatsAppProvider so callers are decoupled from this vendor.
 *
 * Observability: all HTTP errors are logged to console.error with status,
 * response body, and instanceName. No errors are suppressed — callers
 * receive thrown exceptions for upper-layer handling.
 */
export class EvolutionGoAdapter implements WhatsAppProvider {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(config: EvolutionGoConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, ""); // strip trailing slash
    this.apiKey = config.apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      apikey: this.apiKey
    };
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: T }> {
    const url = `${this.apiUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    let data: T;
    const text = await res.text();
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as unknown as T;
    }

    return { status: res.status, data };
  }

  /**
   * Creates the Evolution Go instance. If it already exists (409), fetches
   * the existing connection (which contains the QR code). Returns `{ qrCode }`.
   */
  async connect(instanceName: string): Promise<{ qrCode: string | null }> {
    const { status, data } = await this.request<any>("POST", "/instance/create", {
      instanceName,
      integration: "WHATSAPP-BAILEYS"
    });

    if (status === 409) {
      // Instance already exists — fetch connection details to get QR
      const { status: s2, data: d2 } = await this.request<any>(
        "GET",
        `/instance/connect/${instanceName}`
      );
      if (s2 >= 400) {
        console.error(
          `[EvolutionGo] connect (re-connect) failed instanceName=${instanceName} status=${s2} body=${JSON.stringify(d2)}`
        );
        throw new Error(`Evolution Go connect error: ${s2}`);
      }
      return { qrCode: d2?.base64 ?? null };
    }

    if (status >= 400) {
      console.error(
        `[EvolutionGo] connect failed instanceName=${instanceName} status=${status} body=${JSON.stringify(data)}`
      );
      throw new Error(`Evolution Go connect error: ${status}`);
    }

    return { qrCode: (data as any)?.base64 ?? null };
  }

  /**
   * Logs out the instance. Ignores 404 (already disconnected / never existed).
   */
  async disconnect(instanceName: string): Promise<void> {
    const { status, data } = await this.request<any>("DELETE", `/instance/logout/${instanceName}`);

    if (status === 404) {
      // Already gone — treat as success
      return;
    }

    if (status >= 400) {
      console.error(
        `[EvolutionGo] disconnect failed instanceName=${instanceName} status=${status} body=${JSON.stringify(data)}`
      );
      throw new Error(`Evolution Go disconnect error: ${status}`);
    }
  }

  /**
   * Returns the current connection state, mapped to our enum values.
   * Evolution Go 'open' → 'connected', 'connecting' → 'connecting', else 'disconnected'.
   */
  async getStatus(
    instanceName: string
  ): Promise<{ status: "connected" | "disconnected" | "connecting" }> {
    const { status, data } = await this.request<any[]>("GET", "/instance/fetchInstances");

    if (status >= 400) {
      console.error(
        `[EvolutionGo] getStatus failed instanceName=${instanceName} status=${status} body=${JSON.stringify(data)}`
      );
      throw new Error(`Evolution Go getStatus error: ${status}`);
    }

    const instances = Array.isArray(data) ? data : [];
    const found = instances.find(
      (i: any) => i?.instance?.instanceName === instanceName || i?.instanceName === instanceName
    );

    const rawState: string =
      found?.instance?.state ?? found?.connectionStatus ?? found?.state ?? "";

    if (rawState === "open") return { status: "connected" };
    if (rawState === "connecting") return { status: "connecting" };
    return { status: "disconnected" };
  }

  /**
   * Sends a plain-text WhatsApp message via Evolution Go.
   */
  async sendText(instanceName: string, to: string, text: string): Promise<void> {
    const { status, data } = await this.request<any>(
      "POST",
      `/message/sendText/${instanceName}`,
      { number: to, text }
    );

    if (status >= 400) {
      console.error(
        `[EvolutionGo] sendText failed instanceName=${instanceName} to=${to} status=${status} body=${JSON.stringify(data)}`
      );
      throw new Error(`Evolution Go sendText error: ${status}`);
    }
  }
}
