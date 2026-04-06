import { z } from "zod";

// ─── Status ──────────────────────────────────────────────────────────────────

export const whatsappSessionStatusSchema = z.union([
  z.literal("disconnected"),
  z.literal("connecting"),
  z.literal("connected")
]);

export type WhatsAppSessionStatus = z.infer<typeof whatsappSessionStatusSchema>;

// ─── Connect result ───────────────────────────────────────────────────────────

export const connectResultSchema = z.object({
  qrCode: z.string().nullable(),
  status: whatsappSessionStatusSchema
});

export type ConnectResult = z.infer<typeof connectResultSchema>;

// ─── Full session DTO ─────────────────────────────────────────────────────────

export const whatsappSessionSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  instanceName: z.string(),
  status: whatsappSessionStatusSchema,
  qrCode: z.string().nullable(),
  provider: z.string(),
  lastError: z.string().nullable(),
  connectedAt: z.date().nullable(),
  disconnectedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type WhatsAppSession = z.infer<typeof whatsappSessionSchema>;

// ─── Provider interface ───────────────────────────────────────────────────────

export interface WhatsAppProvider {
  connect(instanceName: string): Promise<{ qrCode: string | null }>;
  disconnect(instanceName: string): Promise<void>;
  getStatus(instanceName: string): Promise<{ status: "connected" | "disconnected" | "connecting" }>;
  sendText(instanceName: string, to: string, text: string): Promise<void>;
}
