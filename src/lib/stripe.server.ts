// Cliente Stripe (server-only). Não importar deste arquivo no client.
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY não configurada. Adicione a chave nos secrets do projeto.",
    );
  }
  _stripe = new Stripe(key, {
    apiVersion: "2024-06-20" as Stripe.StripeConfig["apiVersion"],
    httpClient: Stripe.createFetchHttpClient(),
  });
  return _stripe;
}

export type PlanKey = "start" | "pro" | "elite";
export type PlanPeriod = "monthly" | "annual";

export function getPriceId(plan: PlanKey, period: PlanPeriod): string {
  const map: Record<string, string | undefined> = {
    start_monthly: process.env.STRIPE_PRICE_START_MONTHLY,
    start_annual: process.env.STRIPE_PRICE_START_ANNUAL,
    pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
    elite_monthly: process.env.STRIPE_PRICE_ELITE_MONTHLY,
    elite_annual: process.env.STRIPE_PRICE_ELITE_ANNUAL,
  };
  const id = map[`${plan}_${period}`];
  if (!id) {
    throw new Error(
      `Price ID não configurado para ${plan}/${period}. Verifique STRIPE_PRICE_${plan.toUpperCase()}_${period.toUpperCase()}.`,
    );
  }
  return id;
}
