import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { assertDb, companies, drivers, retailers, users } from "@repo/db";
import type { EntityRole } from "@repo/shared";
import { createStripeCustomerForRole } from "../../lib/stripe";

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

const uniqueSlug = (base: string) => `${base || "profile"}-${randomUUID().slice(0, 8)}`;

export const ensureProfileForUser = async (input: { userId: string; role: EntityRole }) => {
  const { db } = assertDb();
  const [user] = await db.select().from(users).where(and(eq(users.id, input.userId), eq(users.role, input.role))).limit(1);

  if (!user) {
    throw new Error(`profile_user_not_found:${input.userId}`);
  }

  if (input.role === "company") {
    const [existing] = await db.select().from(companies).where(eq(companies.userId, input.userId)).limit(1);
    if (existing) {
      return { role: input.role, profile: existing, created: false, stripeStage: existing.stripeCustomerId ? "reused" : "missing" };
    }

    let stripeCustomerId: string | null = null;
    try {
      stripeCustomerId = (await createStripeCustomerForRole({ role: input.role, email: user.email, name: user.name, userId: user.id })).customerId;
    } catch (error) {
      throw new Error(`stripe_profile_bootstrap_failed:company:${error instanceof Error ? error.message : "unknown"}`);
    }

    const [created] = await db.insert(companies).values({
      userId: user.id,
      name: user.name,
      slug: uniqueSlug(slugify(user.name)),
      stripeCustomerId
    }).returning();

    return { role: input.role, profile: created, created: true, stripeStage: stripeCustomerId ? "created" : "missing" };
  }

  if (input.role === "retailer") {
    const [existing] = await db.select().from(retailers).where(eq(retailers.userId, input.userId)).limit(1);
    if (existing) {
      return { role: input.role, profile: existing, created: false, stripeStage: existing.stripeCustomerId ? "reused" : "missing" };
    }

    let stripeCustomerId: string | null = null;
    try {
      stripeCustomerId = (await createStripeCustomerForRole({ role: input.role, email: user.email, name: user.name, userId: user.id })).customerId;
    } catch (error) {
      throw new Error(`stripe_profile_bootstrap_failed:retailer:${error instanceof Error ? error.message : "unknown"}`);
    }

    const [created] = await db.insert(retailers).values({
      userId: user.id,
      name: user.name,
      slug: uniqueSlug(slugify(user.name)),
      stripeCustomerId
    }).returning();

    return { role: input.role, profile: created, created: true, stripeStage: stripeCustomerId ? "created" : "missing" };
  }

  const [existing] = await db.select().from(drivers).where(eq(drivers.userId, input.userId)).limit(1);
  if (existing) {
    return { role: input.role, profile: existing, created: false, stripeStage: "skipped" };
  }

  const [created] = await db.insert(drivers).values({
    userId: user.id,
    name: user.name,
    phone: null
  }).returning();

  return { role: input.role, profile: created, created: true, stripeStage: "skipped" };
};
