import type { WhatsAppProvider } from "@repo/shared";

interface EvolutionGoConfig {
  apiUrl: string;
  apiKey: string;
  webhookUrl?: string;
}

type EvolutionErrorPayload = { error?: string; message?: string };

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
  private readonly webhookUrl: string;

  constructor(config: EvolutionGoConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, ""); // strip trailing slash
    this.apiKey = config.apiKey;
    this.webhookUrl = (config.webhookUrl ?? "").trim();
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      apikey: this.apiKey
    };
  }

  private instanceToken(instanceName: string): string {
    // Deterministic token for Evolution-Go variants that require per-instance auth.
    return instanceName;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    headersOverride?: Record<string, string>
  ): Promise<{ status: number; data: T }> {
    const url = `${this.apiUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        ...(headersOverride ?? this.headers)
      },
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

  private extractError(data: unknown): string {
    if (typeof data === "string") return data;
    if (!data || typeof data !== "object") return "";
    const payload = data as EvolutionErrorPayload;
    return String(payload.error ?? payload.message ?? "");
  }

  /**
   * Connect flow with compatibility for two Evolution contracts:
   * - Path-style contract (/instance/{name}/qrcode, /message/sendText/{name})
   * - Token-style contract (/instance/create name+token, /instance/connect, /instance/qr, /send/text)
   */
  async connect(instanceName: string): Promise<{ qrCode: string | null }> {
    const instanceDefaults = {
      alwaysOnline: false,
      rejectCall: true,
      readMessages: false,
      ignoreGroups: true,
      ignoreStatus: true
    };

    const legacyCreate = await this.request<any>("POST", "/instance/create", {
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      ...instanceDefaults
    });

    if (legacyCreate.status < 400) {
      return { qrCode: legacyCreate.data?.base64 ?? null };
    }

    const legacyError = this.extractError(legacyCreate.data).toLowerCase();

    // Fallback for token-style Evolution-Go APIs.
    if (legacyCreate.status === 400 && (legacyError.includes("name is required") || legacyError.includes("token is required"))) {
      const token = this.instanceToken(instanceName);

      const created = await this.request<any>("POST", "/instance/create", {
        name: instanceName,
        token,
        ...instanceDefaults
      });

      if (created.status >= 400) {
        const createErr = this.extractError(created.data).toLowerCase();
        const alreadyExists = createErr.includes("already") || createErr.includes("exists");
        if (!alreadyExists) {
          console.error(
            `[EvolutionGo] connect(create-token-style) failed instanceName=${instanceName} status=${created.status} body=${JSON.stringify(created.data)}`
          );
          throw new Error(`Evolution Go connect error: ${created.status}`);
        }
      }

      const tokenHeaders = {
        "Content-Type": "application/json",
        apikey: token
      };

      const connectPayload: Record<string, unknown> = {
        webhookUrl: this.webhookUrl
      };
      const connectRes = await this.request<any>("POST", "/instance/connect", connectPayload, tokenHeaders);
      if (connectRes.status >= 400 && connectRes.status !== 401) {
        console.error(
          `[EvolutionGo] connect(token-style connect) failed instanceName=${instanceName} status=${connectRes.status} body=${JSON.stringify(connectRes.data)}`
        );
      }

      const qrRes = await this.request<any>("GET", "/instance/qr", undefined, tokenHeaders);
      if (qrRes.status >= 400) {
        console.error(
          `[EvolutionGo] connect(token-style qr) failed instanceName=${instanceName} status=${qrRes.status} body=${JSON.stringify(qrRes.data)}`
        );
        throw new Error(`Evolution Go connect error: ${qrRes.status}`);
      }

      return { qrCode: qrRes.data?.data?.Qrcode ?? qrRes.data?.Qrcode ?? null };
    }

    console.error(
      `[EvolutionGo] connect failed instanceName=${instanceName} status=${legacyCreate.status} body=${JSON.stringify(legacyCreate.data)}`
    );
    throw new Error(`Evolution Go connect error: ${legacyCreate.status}`);
  }

  async disconnect(instanceName: string): Promise<void> {
    const legacy = await this.request<any>("DELETE", `/instance/logout/${instanceName}`);

    if (legacy.status < 400 || legacy.status === 404) {
      return;
    }

    // Token-style fallback
    const tokenHeaders = {
      "Content-Type": "application/json",
      apikey: this.instanceToken(instanceName)
    };
    const tokenStyle = await this.request<any>("DELETE", "/instance/logout", undefined, tokenHeaders);
    if (tokenStyle.status >= 400 && tokenStyle.status !== 404) {
      console.error(
        `[EvolutionGo] disconnect failed instanceName=${instanceName} status=${tokenStyle.status} body=${JSON.stringify(tokenStyle.data)}`
      );
      throw new Error(`Evolution Go disconnect error: ${tokenStyle.status}`);
    }
  }

  async getStatus(
    instanceName: string
  ): Promise<{ status: "connected" | "disconnected" | "connecting" }> {
    const legacy = await this.request<any[]>("GET", "/instance/fetchInstances");

    if (legacy.status < 400) {
      const instances = Array.isArray(legacy.data) ? legacy.data : [];
      const found = instances.find(
        (i: any) => i?.instance?.instanceName === instanceName || i?.instanceName === instanceName
      );

      const rawState: string =
        found?.instance?.state ?? found?.connectionStatus ?? found?.state ?? "";

      if (rawState === "open") return { status: "connected" };
      if (rawState === "connecting") return { status: "connecting" };
      return { status: "disconnected" };
    }

    // Token-style fallback
    const tokenHeaders = {
      "Content-Type": "application/json",
      apikey: this.instanceToken(instanceName)
    };
    const tokenStyle = await this.request<any>("GET", "/instance/status", undefined, tokenHeaders);
    if (tokenStyle.status >= 400) {
      console.error(
        `[EvolutionGo] getStatus failed instanceName=${instanceName} status=${tokenStyle.status} body=${JSON.stringify(tokenStyle.data)}`
      );
      throw new Error(`Evolution Go getStatus error: ${tokenStyle.status}`);
    }

    const rawState = String(
      tokenStyle.data?.data?.status ?? tokenStyle.data?.status ?? tokenStyle.data?.data?.state ?? ""
    ).toLowerCase();

    if (rawState.includes("open") || rawState.includes("connected")) return { status: "connected" };
    if (rawState.includes("connect")) return { status: "connecting" };
    return { status: "disconnected" };
  }

  async sendText(instanceName: string, to: string, text: string): Promise<void> {
    const legacy = await this.request<any>(
      "POST",
      `/message/sendText/${instanceName}`,
      { number: to, text }
    );

    if (legacy.status < 400) {
      return;
    }

    // Token-style fallback
    const tokenHeaders = {
      "Content-Type": "application/json",
      apikey: this.instanceToken(instanceName)
    };
    const tokenStyle = await this.request<any>(
      "POST",
      "/send/text",
      { number: to, text },
      tokenHeaders
    );

    if (tokenStyle.status >= 400) {
      console.error(
        `[EvolutionGo] sendText failed instanceName=${instanceName} to=${to} status=${tokenStyle.status} body=${JSON.stringify(tokenStyle.data)}`
      );
      throw new Error(`Evolution Go sendText error: ${tokenStyle.status}`);
    }
  }
}
