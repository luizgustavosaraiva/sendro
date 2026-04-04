import Stripe from "stripe";
import type { EntityRole } from "@repo/shared";
import { env } from "../env";

export type StripeCustomerResult = {
  customerId: string | null;
  skipped: boolean;
};

const stripe = env.STRIPE_API_KEY ? new Stripe(env.STRIPE_API_KEY) : null;
const isLocalStubKey = env.STRIPE_API_KEY?.startsWith("sk_test_sendro_") ?? false;

export const createStripeCustomerForRole = async (input: {
  role: EntityRole;
  email: string;
  name: string;
  userId: string;
}) : Promise<StripeCustomerResult> => {
  if (input.role === "driver") {
    return { customerId: null, skipped: true };
  }

  if (!stripe && !isLocalStubKey) {
    throw new Error(`stripe_unavailable:${input.role}`);
  }

  if (isLocalStubKey) {
    return {
      customerId: `cus_local_${input.role}_${input.userId.slice(0, 8)}`,
      skipped: false
    };
  }

  const customer = await stripe!.customers.create({
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
