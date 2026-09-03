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
        const { comTabelasPendentes } = await import("@/integrations/supabase/tabelas-pendentes");
        const dbPendente = comTabelasPendentes(supabaseAdmin);

        // ---- Idempotência (M8) -------------------------------------------
        // O Stripe reentrega evento quando não recebe 200 rápido o bastante, e
        // não garante ordem. Sem registro, a mesma cobrança era processada duas
        // vezes e um `subscription.updated` atrasado podia reativar uma
        // assinatura já cancelada.
        //
        // A PK de stripe_webhook_events faz o de-dupe: se o insert conflitar,
        // o evento já passou por aqui.
        const clienteDoEvento =
          (event.data.object as { customer?: string | null } | null)?.customer ?? null;

        const { error: dupErr } = await dbPendente.from("stripe_webhook_events").insert({
          event_id: event.id,
          event_type: event.type,
          event_created: new Date(event.created * 1000).toISOString(),
          customer_id: clienteDoEvento,
        });
        if (dupErr) {
          // 23505 = unique_violation. Já processado: responde 200 para o Stripe
          // parar de reentregar.
          if ((dupErr as { code?: string }).code === "23505") {
            return new Response("duplicate", { status: 200 });
          }
          console.error("[stripe-webhook] falha ao registrar evento:", dupErr);
          return new Response("Handler error", { status: 500 });
        }

        // ---- Guarda de ordem ----------------------------------------------
        // Ignora evento mais antigo que o último já aplicado para este cliente.
        if (clienteDoEvento) {
          const { data: maisRecente } = await dbPendente
            .from("stripe_webhook_events")
            .select("event_created")
            .eq("customer_id", clienteDoEvento)
            .neq("event_id", event.id)
            .order("event_created", { ascending: false })
            .limit(1)
            .maybeSingle();
          const anterior = (maisRecente as { event_created?: string } | null)?.event_created;
          if (anterior && new Date(anterior) > new Date(event.created * 1000)) {
            console.warn(
              `[stripe-webhook] evento ${event.id} (${event.type}) chegou fora de ordem; ignorado.`,
            );
            return new Response("stale", { status: 200 });
          }
        }

        // O erro do update é verificado de propósito: o supabase-js devolve
        // { error } em vez de lançar, e um CHECK recusando o status novo
        // deixaria a assinatura parada no status antigo sem nenhum sinal.
        // Lançando aqui, o handler responde 500 e o Stripe reentrega.
        const updateByCustomer = async (customerId: string, patch: Record<string, unknown>) => {
          const { error } = await (
            supabaseAdmin.from("tenants") as unknown as {
              update: (p: Record<string, unknown>) => {
                eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
              };
            }
          )
            .update(patch)
            .eq("stripe_customer_id", customerId);
          if (error) {
            throw new Error(
              `Falha ao atualizar tenant do customer ${customerId}: ${error.message}`,
            );
          }
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

              // trial_ends_at é zerado de propósito: quem assinou não depende
              // mais do teste gratuito de 14 dias para ter acesso.
              await updateByCustomer(session.customer, {
                status,
                stripe_subscription_id: stripeSubId,
                trial_ends_at: trialEndsAt,
                plan: session.metadata?.plan ?? null,
                plan_period: session.metadata?.plan_period ?? null,
                is_trial: status === "trialing",
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
              // O status do Stripe é traduzido para o vocabulário do tenant
              // ('trialing' | 'active' | 'past_due' | 'canceled' | 'expired').
              // Antes tudo que dava errado virava 'trial_expired', o que
              // confundia inadimplência com teste vencido — e 'past_due', que
              // aqui continua liberado, derrubava o acesso de quem já pagava.
              if (sub.status === "past_due") {
                await updateByCustomer(sub.customer, { status: "past_due" });
              } else if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status)) {
                await updateByCustomer(sub.customer, { status: "canceled", is_trial: false });
              } else if (sub.status === "trialing") {
                // Assinatura antiga, criada quando o trial ainda era do Stripe.
                // trial_ends_at só é sobrescrito quando o Stripe manda a data:
                // gravar null aqui faria o gatilho do banco conceder mais 14
                // dias de teste do nada.
                await updateByCustomer(sub.customer, {
                  status: "trialing",
                  is_trial: true,
                  ...(sub.trial_end
                    ? { trial_ends_at: new Date(sub.trial_end * 1000).toISOString() }
                    : {}),
                });
              } else if (sub.status === "active") {
                await updateByCustomer(sub.customer, { status: "active", is_trial: false });
              }
              break;
            }
            case "customer.subscription.deleted": {
              const sub = event.data.object as { customer: string };
              await updateByCustomer(sub.customer, { status: "canceled", is_trial: false });
              break;
            }
            default:
              break;
          }
        } catch (err) {
          console.error("[stripe-webhook] handler error:", err);
          // Libera o registro de idempotência antes de devolver 500.
          //
          // O registro é gravado ANTES do processamento, para que duas entregas
          // simultâneas não processem o mesmo evento. Mas se o processamento
          // falha e o registro fica, a reentrega do Stripe bate no de-dupe,
          // responde 200 e o evento se perde para sempre — uma falha temporária
          // do banco viraria assinatura que nunca ativa.
          const { error: delErr } = await dbPendente
            .from("stripe_webhook_events")
            .delete()
            .eq("event_id", event.id);
          if (delErr) {
            console.error(
              `[stripe-webhook] evento ${event.id} falhou e o registro de ` +
                `idempotência não pôde ser removido. A reentrega do Stripe será ` +
                `descartada como duplicada — reprocesse manualmente.`,
              delErr,
            );
          }
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
