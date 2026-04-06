import { eq } from "drizzle-orm";
import { assertDb } from "@repo/db";
import { whatsappSessions } from "@repo/db/schema";
import type { WhatsAppProvider } from "@repo/shared";
import type { WhatsAppSessionStatus } from "@repo/shared";
import { EvolutionGoAdapter } from "./evolution-go";
import { env } from "../../env";

// ─── No-op stub for tests (env vars absent) ───────────────────────────────────

class NoOpWhatsAppAdapter implements WhatsAppProvider {
  async connect(_instanceName: string) {
    return { qrCode: "STUB_QR" };
  }
  async disconnect(_instanceName: string) {}
  async getStatus(_instanceName: string) {
    return { status: "disconnected" as const };
  }
  async sendText(_instanceName: string, _to: string, _text: string) {}
}

// ─── Adapter singleton ────────────────────────────────────────────────────────

let _adapter: WhatsAppProvider | null = null;

export function getAdapter(): WhatsAppProvider {
  if (!_adapter) {
    if (env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY) {
      _adapter = new EvolutionGoAdapter({
        apiUrl: env.EVOLUTION_API_URL,
        apiKey: env.EVOLUTION_API_KEY
      });
    } else {
      _adapter = new NoOpWhatsAppAdapter();
    }
  }
  return _adapter;
}

/** Override the adapter (useful in tests). */
export function setAdapter(adapter: WhatsAppProvider) {
  _adapter = adapter;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function instanceNameFor(companyId: string): string {
  return `sendro-${companyId.slice(0, 8)}`;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getOrCreateSession(companyId: string) {
  const { db } = assertDb();
  const existing = await db
    .select()
    .from(whatsappSessions)
    .where(eq(whatsappSessions.companyId, companyId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const instanceName = instanceNameFor(companyId);
  const [created] = await db
    .insert(whatsappSessions)
    .values({ companyId, instanceName, status: "disconnected" })
    .returning();
  return created;
}

export async function connectSession(companyId: string) {
  const { db } = assertDb();
  const session = await getOrCreateSession(companyId);
  const adapter = getAdapter();

  const prevStatus = session.status;
  await db
    .update(whatsappSessions)
    .set({ status: "connecting", updatedAt: new Date() })
    .where(eq(whatsappSessions.companyId, companyId));

  console.info(
    `[WhatsApp] connect companyId=${companyId} instanceName=${session.instanceName} ${prevStatus} → connecting`
  );

  let qrCode: string | null = null;
  try {
    const result = await adapter.connect(session.instanceName);
    qrCode = result.qrCode;
  } catch (err) {
    console.error(
      `[WhatsApp] connect error companyId=${companyId} instanceName=${session.instanceName}`,
      err
    );
    await db
      .update(whatsappSessions)
      .set({ status: "disconnected", lastError: String(err), updatedAt: new Date() })
      .where(eq(whatsappSessions.companyId, companyId));
    throw err;
  }

  await db
    .update(whatsappSessions)
    .set({ qrCode, updatedAt: new Date() })
    .where(eq(whatsappSessions.companyId, companyId));

  return { status: "connecting" as WhatsAppSessionStatus, qrCode };
}

export async function disconnectSession(companyId: string) {
  const { db } = assertDb();
  const session = await getOrCreateSession(companyId);
  const adapter = getAdapter();
  const prevStatus = session.status;

  try {
    await adapter.disconnect(session.instanceName);
  } catch (err) {
    console.error(
      `[WhatsApp] disconnect error companyId=${companyId} instanceName=${session.instanceName}`,
      err
    );
    throw err;
  }

  await db
    .update(whatsappSessions)
    .set({ status: "disconnected", qrCode: null, disconnectedAt: new Date(), updatedAt: new Date() })
    .where(eq(whatsappSessions.companyId, companyId));

  console.info(
    `[WhatsApp] disconnect companyId=${companyId} instanceName=${session.instanceName} ${prevStatus} → disconnected`
  );

  return { status: "disconnected" as WhatsAppSessionStatus };
}

export async function getSessionStatus(companyId: string) {
  const session = await getOrCreateSession(companyId);
  return {
    id: session.id,
    companyId: session.companyId,
    instanceName: session.instanceName,
    status: session.status as WhatsAppSessionStatus,
    qrCode: session.qrCode ?? null,
    provider: session.provider,
    lastError: session.lastError ?? null,
    connectedAt: session.connectedAt ?? null,
    disconnectedAt: session.disconnectedAt ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

export async function handleConnectionUpdate({
  instanceName,
  state,
  reason
}: {
  instanceName: string;
  state: string;
  reason?: string;
}) {
  const { db } = assertDb();
  const rows = await db
    .select()
    .from(whatsappSessions)
    .where(eq(whatsappSessions.instanceName, instanceName))
    .limit(1);

  if (rows.length === 0) {
    console.warn(`[WhatsApp] handleConnectionUpdate: unknown instanceName=${instanceName}`);
    return;
  }

  const session = rows[0];
  const prevStatus = session.status;

  let newStatus: WhatsAppSessionStatus;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (state === "open") {
    newStatus = "connected";
    updates.status = "connected";
    updates.connectedAt = new Date();
    updates.lastError = null;
    updates.qrCode = null;
  } else if (state === "connecting") {
    newStatus = "connecting";
    updates.status = "connecting";
  } else {
    newStatus = "disconnected";
    updates.status = "disconnected";
    updates.disconnectedAt = new Date();
    updates.qrCode = null;
    if (reason) updates.lastError = reason;
  }

  await db.update(whatsappSessions).set(updates).where(eq(whatsappSessions.instanceName, instanceName));

  console.info(
    `[WhatsApp] connectionUpdate instanceName=${instanceName} companyId=${session.companyId} ${prevStatus} → ${newStatus} state=${state}${reason ? ` reason=${reason}` : ""} ts=${new Date().toISOString()}`
  );
}

export async function handleMessage({
  instanceName,
  from,
  body
}: {
  instanceName: string;
  from: string;
  body?: string;
}) {
  const { db } = assertDb();
  const rows = await db
    .select()
    .from(whatsappSessions)
    .where(eq(whatsappSessions.instanceName, instanceName))
    .limit(1);

  if (rows.length === 0) {
    console.warn(`[WhatsApp] handleMessage: unknown instanceName=${instanceName}`);
    return;
  }

  const session = rows[0];
  if (session.status !== "connected" && session.status !== "connecting") {
    return;
  }

  const adapter = getAdapter();
  try {
    await adapter.sendText(instanceName, from, "Olá! Bot Sendro ativo.");
  } catch (err) {
    console.error(
      `[WhatsApp] handleMessage sendText error instanceName=${instanceName} from=${from}`,
      err
    );
  }
}
