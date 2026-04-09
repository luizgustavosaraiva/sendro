import { and, eq } from "drizzle-orm";
import { bonds, companies, drivers, retailers, users, whatsappContactMappings } from "@repo/db";
import type { ContextSnapshot } from "./conversation-types";
import { getOrCreateConversationState } from "./conversation-memory";
import { assertDb } from "@repo/db";

type DrizzleDb = ReturnType<typeof assertDb>["db"];

export type ResolvedWhatsAppContact =
  | {
      category: "known_retailer_operational";
      role: "retailer";
      userId: string;
      retailerId: string;
      conversationStateId: string;
      contextSnapshot: ContextSnapshot;
      blockedReason: null;
    }
  | {
      category: "known_retailer_blocked";
      role: "retailer";
      userId: string;
      retailerId: string;
      conversationStateId: string;
      contextSnapshot: ContextSnapshot;
      blockedReason: { code: "bond_inactive_or_missing"; bondStatus: string | null };
    }
  | {
      category: "known_driver";
      role: "driver";
      userId: string;
      driverId: string;
      conversationStateId: string;
      contextSnapshot: ContextSnapshot;
      blockedReason: null;
    }
  | {
      category: "unknown_contact";
      role: "unknown";
      userId: null;
      conversationStateId: string;
      contextSnapshot: ContextSnapshot;
      blockedReason: null;
    };

export async function resolveWhatsAppContact(db: DrizzleDb, companyId: string, contactJid: string): Promise<ResolvedWhatsAppContact> {
  const state = await getOrCreateConversationState(db, companyId, contactJid);

  const [mapping] = await db
    .select({ userId: whatsappContactMappings.userId, role: whatsappContactMappings.role })
    .from(whatsappContactMappings)
    .where(
      and(eq(whatsappContactMappings.companyId, companyId), eq(whatsappContactMappings.contactJid, contactJid))
    )
    .limit(1);

  if (!mapping) {
    console.info(`[conversation] context_resolved category=unknown_contact companyId=${companyId} contactJid=${contactJid}`);
    return {
      category: "unknown_contact",
      role: "unknown",
      userId: null,
      conversationStateId: state.id,
      contextSnapshot: { knownContact: false },
      blockedReason: null
    };
  }

  if (mapping.role === "driver") {
    const [driver] = await db.select({ id: drivers.id, name: drivers.name }).from(drivers).where(eq(drivers.userId, mapping.userId)).limit(1);

    if (!driver) {
      console.warn(`[conversation] context_resolved missing-driver-profile companyId=${companyId} contactJid=${contactJid}`);
      return {
        category: "unknown_contact",
        role: "unknown",
        userId: null,
        conversationStateId: state.id,
        contextSnapshot: { knownContact: false },
        blockedReason: null
      };
    }

    console.info(`[conversation] context_resolved category=known_driver companyId=${companyId} contactJid=${contactJid}`);
    return {
      category: "known_driver",
      role: "driver",
      userId: mapping.userId,
      driverId: driver.id,
      conversationStateId: state.id,
      contextSnapshot: { knownContact: true, role: "driver", driverName: driver.name },
      blockedReason: null
    };
  }

  const [retailer] = await db.select({ id: retailers.id, name: retailers.name }).from(retailers).where(eq(retailers.userId, mapping.userId)).limit(1);
  const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);

  if (!retailer) {
    console.warn(`[conversation] context_resolved missing-retailer-profile companyId=${companyId} contactJid=${contactJid}`);
    return {
      category: "unknown_contact",
      role: "unknown",
      userId: null,
      conversationStateId: state.id,
      contextSnapshot: { knownContact: false },
      blockedReason: null
    };
  }

  const [bond] = await db
    .select({ status: bonds.status })
    .from(bonds)
    .where(and(eq(bonds.companyId, companyId), eq(bonds.entityId, retailer.id), eq(bonds.entityType, "retailer")))
    .limit(1);

  const contextSnapshot: ContextSnapshot = {
    knownContact: true,
    role: "retailer",
    retailerName: retailer.name,
    companyName: company?.name ?? null,
    bondStatus: bond?.status ?? null
  };

  if (!bond || bond.status !== "active") {
    console.info(`[conversation] context_resolved category=known_retailer_blocked companyId=${companyId} contactJid=${contactJid} bondStatus=${bond?.status ?? "missing"}`);
    return {
      category: "known_retailer_blocked",
      role: "retailer",
      userId: mapping.userId,
      retailerId: retailer.id,
      conversationStateId: state.id,
      contextSnapshot,
      blockedReason: { code: "bond_inactive_or_missing", bondStatus: bond?.status ?? null }
    };
  }

  console.info(`[conversation] context_resolved category=known_retailer_operational companyId=${companyId} contactJid=${contactJid}`);
  return {
    category: "known_retailer_operational",
    role: "retailer",
    userId: mapping.userId,
    retailerId: retailer.id,
    conversationStateId: state.id,
    contextSnapshot,
    blockedReason: null
  };
}
