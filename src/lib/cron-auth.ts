/**
 * Autenticação dos endpoints chamados por pg_cron (server-only).
 *
 * CRON_SECRET é OBRIGATÓRIA (issue #21). Antes, quando ela não estava
 * configurada, os hooks caíam num modo legado que aceitava
 * SUPABASE_PUBLISHABLE_KEY — o mesmo JWT `role: anon` que o Vite injeta no
 * bundle e que qualquer visitante lê no DevTools. Na prática os endpoints
 * ficavam públicos: dava para disparar o worker de WhatsApp em laço para todas
 * as academias. Não havia validação de startup que recusasse subir assim.
 *
 * Agora não há mais fallback: sem CRON_SECRET, os hooks respondem 503 e não
 * executam nada. Só o segredo dedicado é aceito, em `x-cron-secret` ou, por
 * compatibilidade com os jobs já cadastrados, em `apikey`.
 *
 * Configuração: defina CRON_SECRET nos secrets do projeto (um valor longo e
 * aleatório) e faça os jobs do pg_cron mandarem o header `x-cron-secret`.
 */
import { timingSafeEqual } from "crypto";

/** Comparação de tempo constante que não vaza o tamanho pelo caminho rápido. */
function secretsMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // timingSafeEqual exige tamanhos iguais. Comparar contra o próprio buffer
  // mantém o custo constante quando os tamanhos diferem.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export type CronAuthResult = { ok: true } | { ok: false; response: Response };

const unauthorized = (): Response =>
  new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

const serviceUnavailable = (): Response =>
  new Response(JSON.stringify({ error: "cron_secret_nao_configurado" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Valida a chamada de um hook de cron. Aceita o segredo em `x-cron-secret`
 * ou, por compatibilidade com os jobs já cadastrados, em `apikey`.
 *
 * Sem CRON_SECRET configurada, recusa com 503: os hooks ficam desabilitados até
 * o segredo dedicado existir, em vez de aceitar a chave anon (que é pública).
 */
export function authorizeCronRequest(request: Request): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(
      "[cron-auth] CRON_SECRET não configurada: os hooks de cron estão " +
        "DESABILITADOS (503). Defina CRON_SECRET nos secrets do projeto e " +
        "faça os jobs do pg_cron mandarem o header x-cron-secret.",
    );
    return { ok: false, response: serviceUnavailable() };
  }

  const received =
    request.headers.get("x-cron-secret") ?? request.headers.get("apikey") ?? "";
  return secretsMatch(received, cronSecret)
    ? { ok: true }
    : { ok: false, response: unauthorized() };
}

/**
 * Segredo que as chamadas internas (runDispatch) devem apresentar.
 *
 * Só CRON_SECRET. Se ela não existir, devolve string vazia — e o hook recusa
 * com 503, sinalizando a configuração faltando em vez de rodar sem proteção.
 */
export function internalCronSecret(): string {
  return process.env.CRON_SECRET ?? "";
}
