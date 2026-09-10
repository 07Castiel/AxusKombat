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
    apiVersion: "2024-06-20" as never,
    httpClient: Stripe.createFetchHttpClient(),
  });
  return _stripe;
}

export type PlanKey = "start" | "pro" | "elite";
export type PlanPeriod = "monthly" | "annual";

// Price IDs criados na conta Stripe do projeto. Ficam no código de propósito:
// assim o checkout funciona sem depender de seis variáveis de ambiente, e cada
// venda cai no produto certo dentro do Stripe. Uma variável de ambiente, quando
// existir, continua tendo prioridade (útil para o ambiente de testes).
const PRECOS: Record<string, string> = {
  start_monthly: "price_1UE8HLLdeCv1CMT5dQHyY27q",
  start_annual: "price_1UE8HiLdeCv1CMT5Dilu9xBG",
  pro_monthly: "price_1UE8IBLdeCv1CMT53kuLm2lx",
  pro_annual: "price_1UE8IfLdeCv1CMT5XOiQoNoV",
  elite_monthly: "price_1UE8J0LdeCv1CMT52WBymGxT",
  elite_annual: "price_1UE8JQLdeCv1CMT5G5dcF4AT",
};

export function getPriceId(plan: PlanKey, period: PlanPeriod): string {
  const map: Record<string, string | undefined> = {
    start_monthly: process.env.STRIPE_PRICE_START_MONTHLY ?? PRECOS.start_monthly,
    start_annual: process.env.STRIPE_PRICE_START_ANNUAL ?? PRECOS.start_annual,
    pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? PRECOS.pro_monthly,
    pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? PRECOS.pro_annual,
    elite_monthly: process.env.STRIPE_PRICE_ELITE_MONTHLY ?? PRECOS.elite_monthly,
    elite_annual: process.env.STRIPE_PRICE_ELITE_ANNUAL ?? PRECOS.elite_annual,
  };
  const id = map[`${plan}_${period}`];
  if (!id) {
    throw new Error(
      `Price ID não configurado para ${plan}/${period}. Verifique STRIPE_PRICE_${plan.toUpperCase()}_${period.toUpperCase()}.`,
    );
  }
  return id;
}
