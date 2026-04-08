import { applyStripeAccountUpdated } from "../../lib/billing-connect";
import { verifyStripeWebhookEvent } from "../../lib/stripe";

export const registerStripeWebhook = (app: import("fastify").FastifyInstance) => {
  app.post("/api/stripe/webhook", async (request, reply) => {
    const signature = request.headers["stripe-signature"];
    const signatureValue = Array.isArray(signature) ? signature[0] : signature;

    const rawPayload =
      (request as { rawBody?: string }).rawBody ??
      (typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {}));

    let event: ReturnType<typeof verifyStripeWebhookEvent>;

    try {
      event = verifyStripeWebhookEvent({
        payload: rawPayload,
        signature: signatureValue
      });
    } catch (error) {
      app.log.warn({ event: "webhook.stripe.signature_invalid", error }, "Stripe webhook signature verification failed.");
      reply.status(400).send({ ok: false, error: "invalid_signature" });
      return;
    }

    if (event.type !== "account.updated") {
      reply.status(200).send({ ok: true, ignored: true, type: event.type });
      return;
    }

    const account = event.data.object as { id?: string; charges_enabled?: boolean; payouts_enabled?: boolean };

    if (!account?.id) {
      app.log.warn({ event: "webhook.stripe.account_updated.malformed", eventId: event.id }, "Stripe account.updated payload missing account id.");
      reply.status(400).send({ ok: false, error: "malformed_event" });
      return;
    }

    const result = await applyStripeAccountUpdated({
      stripeAccountId: account.id,
      chargesEnabled: account.charges_enabled === true,
      payoutsEnabled: account.payouts_enabled === true
    });

    app.log.info(
      {
        event: "webhook.stripe.account_updated.applied",
        stripeAccountId: account.id,
        handled: result.handled,
        result
      },
      "Stripe account.updated processed."
    );

    reply.status(200).send({ ok: true, handled: result.handled });
  });
};
