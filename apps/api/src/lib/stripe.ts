import Stripe from "stripe";
import type { EntityRole } from "@repo/shared";
import { env } from "../env";

export type StripeCustomerResult = {
  customerId: string | null;
  skipped: boolean;
};

const stripe = env.STRIPE_API_KEY ? new Stripe(env.STRIPE_API_KEY) : null;

export const createStripeCustomerForRole = async (input: {
  role: EntityRole;
  email: string;
  name: string;
  userId: string;
}) : Promise<StripeCustomerResult> => {
  if (input.role === "driver") {
    return { customerId: null, skipped: true };
  }

  if (!stripe) {
    throw new Error(`stripe_unavailable:${input.role}`);
  }

  const customer = await stripe.customers.create({
    email: input.email,
    name: input.name,
    metadata: {
      userId: input.userId,
      role: input.role
    }
  });

  return {
    customerId: customer.id,
    skipped: false
  };
};
