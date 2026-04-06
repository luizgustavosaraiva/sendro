import { and, eq } from "drizzle-orm";
import { assertDb } from "@repo/db";
import { whatsappContactMappings, whatsappSessions } from "@repo/db/schema";
import { getAdapter } from "./sessions";

export const OFFER_NOTIFICATION_TEXT = "Nova entrega disponível — Aceitar ou Recusar?";

/**
 * Looks up the driver's WhatsApp JID and sends an offer notification.
 * Failures are swallowed — a WhatsApp error must never fail the dispatch transaction.
 */
export async function notifyDriverOfferViaWhatsApp(input: {
  companyId: string;
  driverId: string;
  userId: string;
}): Promise<void> {
  const { db } = assertDb();

  try {
    // Look up the driver's WhatsApp JID
    const [mapping] = await db
      .select()
      .from(whatsappContactMappings)
      .where(
        and(
          eq(whatsappContactMappings.companyId, input.companyId),
          eq(whatsappContactMappings.userId, input.userId),
          eq(whatsappContactMappings.role, "driver")
        )
      )
      .limit(1);

    if (!mapping) {
      console.info(
        `[whatsapp] offer-notification no-mapping driverId=${input.driverId} userId=${input.userId} companyId=${input.companyId}`
      );
      return;
    }

    const driverJid = mapping.contactJid;

    // Look up the company's WhatsApp instance
    const [session] = await db
      .select()
      .from(whatsappSessions)
      .where(eq(whatsappSessions.companyId, input.companyId))
      .limit(1);

    if (!session) {
      console.info(
        `[whatsapp] offer-notification no-session driverId=${input.driverId} jid=${driverJid} companyId=${input.companyId}`
      );
      return;
    }

    const instanceName = session.instanceName;

    await getAdapter().sendText(instanceName, driverJid, OFFER_NOTIFICATION_TEXT);

    console.info(
      `[whatsapp] offer-notification sent driverId=${input.driverId} jid=${driverJid} companyId=${input.companyId} instanceName=${instanceName}`
    );
  } catch (err) {
    console.error(
      `[whatsapp] offer-notification error driverId=${input.driverId} userId=${input.userId} companyId=${input.companyId}`,
      err
    );
  }
}
