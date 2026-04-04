import { eq } from "drizzle-orm";
import { assertDb, companies, drivers, retailers } from "@repo/db";
import { ensureProfileForUser } from "../routes/auth/register";
import { protectedProcedure, router } from "./procedures";

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
  })
});

export type AppRouter = typeof appRouter;
