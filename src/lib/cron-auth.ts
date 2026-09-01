/**
 * Autenticação dos endpoints chamados por pg_cron (server-only).
 *
 * Antes, os hooks comparavam o header `apikey` com SUPABASE_PUBLISHABLE_KEY —
 * que é exatamente o mesmo JWT `role: anon` que o Vite injeta no bundle e que
 * qualquer visitante lê no DevTools. Na prática os endpoints eram públicos:
 * dava para disparar o worker de WhatsApp em laço para todas as academias.
 *
 * Agora existe um segredo dedicado. A transição é sem janela de quebra:
 *
 *   - CRON_SECRET definida  -> é o ÚNICO segredo aceito (a chave anon não passa)
 *   - CRON_SECRET ausente   -> mantém o comportamento antigo e registra aviso
 *
 * Ordem de virada, sem perder execução:
 *   1. subir este código (CRON_SECRET ainda ausente, cron segue funcionando)
 *   2. definir CRON_SECRET nos secrets do projeto
 *   3. atualizar os jobs do pg_cron para mandar o header novo
 *   4. conferir em notification_worker_runs que voltou a executar
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

/**
 * Valida a chamada de um hook de cron. Aceita o segredo em `x-cron-secret`
 * ou, por compatibilidade com os jobs já cadastrados, em `apikey`.
 */
export function authorizeCronRequest(request: Request): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET;
  const received = request.headers.get("x-cron-secret") ?? request.headers.get("apikey") ?? "";

  if (cronSecret) {
    return secretsMatch(received, cronSecret)
      ? { ok: true }
      : { ok: false, response: unauthorized() };
  }

  // Modo legado — ainda vulnerável, por isso o aviso é ruidoso de propósito.
  const legacy = process.env.SUPABASE_PUBLISHABLE_KEY;
  console.warn(
    "[cron-auth] CRON_SECRET não configurada: os hooks continuam aceitando a " +
      "chave anon, que é pública. Defina CRON_SECRET e atualize os jobs do pg_cron.",
  );
  if (!legacy || !secretsMatch(received, legacy)) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true };
}

/** Segredo que as chamadas internas (runDispatch) devem apresentar. */
export function internalCronSecret(): string {
  return process.env.CRON_SECRET ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
}
