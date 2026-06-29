import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sig = request.headers.get("stripe-signature");
        const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!sig || !whSecret) {
          return new Response("Missing signature or secret", { status: 400 });
        }

        const rawBody = await request.text();

        const { getStripe } = await import("@/lib/stripe.server");
        const stripe = getStripe();

        let event;
        try {
          // constructEventAsync é compatível com runtime Worker (sem crypto sync)
          event = await stripe.webhooks.constructEventAsync(rawBody, sig, whSecret);
        } catch (err) {
          console.error("[stripe-webhook] signature verification failed:", err);
          return new Response("Invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const updateByCustomer = async (
          customerId: string,
          patch: Record<string, unknown>,
        ) => {
          await supabaseAdmin
            .from("tenants")
            .update(patch)
            .eq("stripe_customer_id", customerId);
        };

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as {
                customer: string;
                subscription: string | null;
                metadata?: Record<string, string> | null;
              };
              if (!session.customer) break;

              let trialEndsAt: string | null = null;
              let status: "trialing" | "active" = "active";
              let stripeSubId: string | null = session.subscription;

              if (session.subscription) {
                const sub = await stripe.subscriptions.retrieve(session.subscription);
                stripeSubId = sub.id;
                status = sub.status === "trialing" ? "trialing" : "active";
                if (sub.trial_end) {
                  trialEndsAt = new Date(sub.trial_end * 1000).toISOString();
                }
              }

              await updateByCustomer(session.customer, {
                status,
                stripe_subscription_id: stripeSubId,
                trial_ends_at: trialEndsAt,
                plan: session.metadata?.plan ?? null,
                plan_period: session.metadata?.plan_period ?? null,
                is_trial: session.metadata?.is_trial === "1",
              });
              break;
            }
            case "invoice.paid":
            case "invoice.payment_succeeded": {
              const inv = event.data.object as { customer: string };
              if (inv.customer) {
                await updateByCustomer(inv.customer, {
                  status: "active",
                  is_trial: false,
                });
              }
              break;
            }
            case "customer.subscription.updated": {
              const sub = event.data.object as {
                customer: string;
                status: string;
                trial_end: number | null;
              };
              const badStates = ["past_due", "canceled", "unpaid", "incomplete_expired"];
              if (badStates.includes(sub.status)) {
                await updateByCustomer(sub.customer, { status: "trial_expired" });
              } else if (sub.status === "trialing") {
                await updateByCustomer(sub.customer, {
                  status: "trialing",
                  trial_ends_at: sub.trial_end
                    ? new Date(sub.trial_end * 1000).toISOString()
                    : null,
                });
              } else if (sub.status === "active") {
                await updateByCustomer(sub.customer, { status: "active" });
              }
              break;
            }
            case "customer.subscription.deleted": {
              const sub = event.data.object as { customer: string };
              await updateByCustomer(sub.customer, { status: "trial_expired" });
              break;
            }
            default:
              break;
          }
        } catch (err) {
          console.error("[stripe-webhook] handler error:", err);
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
