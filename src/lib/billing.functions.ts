import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const planSchema = z.enum(["start", "pro", "elite"]);
const periodSchema = z.enum(["monthly", "annual"]);

const checkoutInput = z.object({
  plan: planSchema,
  period: periodSchema,
  isTrial: z.boolean().optional().default(false),
});

/**
 * Origem para onde o Stripe devolve o usuário depois do checkout.
 *
 * Antes vinha do cliente como `origin: z.string().url()` e era usada direto em
 * success_url e cancel_url — qualquer domínio passava, e uma página legítima do
 * Stripe podia devolver o usuário a um site de terceiros.
 *
 * Agora é decidida no servidor: APP_URL quando configurada, senão a origem da
 * própria requisição. O que o cliente manda é ignorado.
 */
function resolverOrigem(): string {
  const configurada = process.env.APP_URL;
  if (configurada) return configurada.replace(/\/$/, "");
  const req = getRequest();
  const origem = req?.headers.get("origin");
  if (origem) return origem.replace(/\/$/, "");
  if (req?.url) return new URL(req.url).origin;
  throw new Error("Não foi possível determinar a origem para o checkout.");
}

/**
 * Cria uma Stripe Checkout Session para o tenant do usuário logado.
 * Retorna { url } para o cliente redirecionar.
 */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => checkoutInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Pega o tenant do usuário
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("tenant_id, email, nome_completo")
      .eq("id", userId)
      .maybeSingle();
    if (pErr || !profile?.tenant_id) {
      throw new Error("Perfil não encontrado.");
    }

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, nome, stripe_customer_id, responsavel_email")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    if (tErr || !tenant) {
      throw new Error("Academia não encontrada.");
    }

    const { getStripe, getPriceId } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();
    const priceId = getPriceId(data.plan, data.period);

    // Cria ou recupera Customer
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: tenant.responsavel_email || profile.email,
        name: tenant.nome,
        metadata: { tenant_id: tenant.id },
      });
      customerId = customer.id;
      await supabaseAdmin
        .from("tenants")
        .update({ stripe_customer_id: customerId })
        .eq("id", tenant.id);
    }

    const origem = resolverOrigem();
    const successUrl = `${origem}/bem-vindo?plano=${data.plan}&trial=${data.isTrial ? "1" : "0"}`;
    const cancelUrl = `${origem}/precos`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        tenant_id: tenant.id,
        plan: data.plan,
        plan_period: data.period,
        is_trial: data.isTrial ? "1" : "0",
      },
      subscription_data: {
        metadata: {
          tenant_id: tenant.id,
          plan: data.plan,
          plan_period: data.period,
        },
        ...(data.isTrial ? { trial_period_days: 14 } : {}),
      },
      ...(data.isTrial ? { payment_method_collection: "if_required" as const } : {}),
    });

    if (!session.url) throw new Error("Stripe não retornou URL de checkout.");
    return { url: session.url };
  });

/**
 * Marca o onboarding como concluído.
 */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.tenant_id) throw new Error("Tenant não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("tenants")
      .update({ onboarding_completed: true })
      .eq("id", profile.tenant_id);
    return { ok: true };
  });

/**
 * Retorna status de assinatura do tenant do usuário logado.
 */
export const getMyTenantStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.tenant_id) return null;
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, status, plan, plan_period, is_trial, trial_ends_at, onboarding_completed")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    return tenant;
  });
