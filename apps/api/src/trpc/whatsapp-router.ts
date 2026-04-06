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
  })
});
