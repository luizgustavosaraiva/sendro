import { z } from "zod";
import { sql } from "drizzle-orm";
import { assertDb, whatsappContactMappings } from "@repo/db";
import { resolveAuthenticatedCompanyProfile } from "../lib/bonds";
import { connectSession, disconnectSession, getSessionStatus } from "../lib/whatsapp/sessions";
import { protectedProcedure, router } from "./procedures";

export const whatsappRouter = router({
  sessionStatus: protectedProcedure.query(async ({ ctx }) => {
    const company = await resolveAuthenticatedCompanyProfile(ctx.session.user as never);
    return getSessionStatus(company.id);
  }),

  connect: protectedProcedure.mutation(async ({ ctx }) => {
    const company = await resolveAuthenticatedCompanyProfile(ctx.session.user as never);
    return connectSession(company.id);
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const company = await resolveAuthenticatedCompanyProfile(ctx.session.user as never);
    return disconnectSession(company.id);
  }),

  registerContact: protectedProcedure
    .input(z.object({ contactJid: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db } = assertDb();
      const company = await resolveAuthenticatedCompanyProfile(ctx.session.user as never);
      const [row] = await db
        .insert(whatsappContactMappings)
        .values({ companyId: company.id, contactJid: input.contactJid, userId: input.userId })
        .onConflictDoUpdate({
          target: [whatsappContactMappings.companyId, whatsappContactMappings.contactJid],
          set: { userId: input.userId, updatedAt: new Date() }
        })
        .returning();
      return row;
    })
});
