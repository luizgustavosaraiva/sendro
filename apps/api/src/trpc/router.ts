import { eq } from "drizzle-orm";
import { assertDb, companies, drivers, retailers } from "@repo/db";
import {
  bondDecisionSchema,
  companyBondListsSchema,
  companyInvitationListSchema,
  createDeliverySchema,
  createInvitationSchema,
  deliveryDetailSchema,
  deliveryListSchema,
  getDeliveryDetailSchema,
  lookupInvitationResultSchema,
  redeemInvitationResultSchema,
  redeemInvitationSchema,
  retailerBondRequestSchema,
  retailerCompanyBondGateResultSchema,
  retailerCompanyBondGateSchema,
  transitionDeliverySchema,
  listDeliveriesSchema
} from "@repo/shared";
import { ensureProfileForUser } from "../routes/auth/register";
import {
  assertRetailerHasActiveBond,
  decideRetailerBond,
  listCompanyBondLists,
  requestRetailerBond
} from "../lib/bonds";
import { createDelivery, getDeliveryDetail, listDeliveries, transitionDelivery } from "../lib/deliveries";
import {
  createCompanyInvitation,
  listCompanyInvitations,
  lookupInvitationByToken,
  redeemInvitation
} from "../lib/invitations";
import { protectedProcedure, publicProcedure, router } from "./procedures";

export const appRouter = router({
  user: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const { db } = assertDb();
      const user = ctx.session.user;
      const role = (user as { role: "company" | "retailer" | "driver" }).role;

      const bootstrap = await ensureProfileForUser({ userId: user.id, role });

      let profile = bootstrap.profile;
      if (role === "company") {
        [profile] = await db.select().from(companies).where(eq(companies.userId, user.id)).limit(1);
      } else if (role === "retailer") {
        [profile] = await db.select().from(retailers).where(eq(retailers.userId, user.id)).limit(1);
      } else {
        [profile] = await db.select().from(drivers).where(eq(drivers.userId, user.id)).limit(1);
      }

      return {
        user,
        profile,
        diagnostics: {
          role,
          profileCreated: bootstrap.created,
          stripeStage: bootstrap.stripeStage
        }
      };
    })
  }),
  bonds: router({
    requestRetailerBond: protectedProcedure
      .input(retailerBondRequestSchema)
      .mutation(async ({ ctx, input }) => requestRetailerBond({ companyId: input.companyId, user: ctx.session.user as never })),
    listCompanyBonds: protectedProcedure
      .output(companyBondListsSchema)
      .query(async ({ ctx }) => listCompanyBondLists(ctx.session.user as never)),
    decideRetailerBond: protectedProcedure
      .input(bondDecisionSchema)
      .mutation(async ({ ctx, input }) => decideRetailerBond({ bondId: input.bondId, action: input.action, user: ctx.session.user as never })),
    assertRetailerCompanyActiveBond: protectedProcedure
      .input(retailerCompanyBondGateSchema)
      .output(retailerCompanyBondGateResultSchema)
      .query(async ({ ctx, input }) => assertRetailerHasActiveBond({ companyId: input.companyId, user: ctx.session.user as never }))
  }),
  invitations: router({
    createCompanyInvitation: protectedProcedure
      .input(createInvitationSchema)
      .mutation(async ({ ctx, input }) => createCompanyInvitation({ user: ctx.session.user as never, data: input })),
    listCompanyInvitations: protectedProcedure
      .output(companyInvitationListSchema)
      .query(async ({ ctx }) => listCompanyInvitations(ctx.session.user as never)),
    redeemInvitation: protectedProcedure
      .input(redeemInvitationSchema)
      .output(redeemInvitationResultSchema)
      .mutation(async ({ ctx, input }) => redeemInvitation({ user: ctx.session.user as never, token: input.token })),
    lookupInvitationByToken: publicProcedure
      .input(redeemInvitationSchema)
      .output(lookupInvitationResultSchema)
      .query(async ({ input }) => lookupInvitationByToken(input.token))
  }),
  deliveries: router({
    create: protectedProcedure
      .input(createDeliverySchema)
      .output(deliveryDetailSchema)
      .mutation(async ({ ctx, input }) => createDelivery({ user: ctx.session.user as never, data: input })),
    list: protectedProcedure
      .input(listDeliveriesSchema.optional())
      .output(deliveryListSchema)
      .query(async ({ ctx, input }) => listDeliveries({ user: ctx.session.user as never, filters: input })),
    detail: protectedProcedure
      .input(getDeliveryDetailSchema)
      .output(deliveryDetailSchema)
      .query(async ({ ctx, input }) => getDeliveryDetail({ user: ctx.session.user as never, deliveryId: input.deliveryId })),
    transition: protectedProcedure
      .input(transitionDeliverySchema)
      .output(deliveryDetailSchema)
      .mutation(async ({ ctx, input }) => transitionDelivery({ user: ctx.session.user as never, data: input }))
  })
});

export type AppRouter = typeof appRouter;
