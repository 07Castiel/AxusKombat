/**
 * A regra de acesso da academia, em um lugar só.
 *
 * Existiam três cópias dela: aqui no cliente (_app.tsx), no servidor
 * (subscription.ts) e no banco (tenant_liberado()). A do banco já divergiu uma
 * vez — tratava trial sem data como vencido enquanto as outras duas liberavam,
 * e o resultado era uma conta que navegava normalmente e tomava exceção em
 * toda escrita. Com o modo somente leitura a divergência fica pior: o cliente
 * mostraria botões que o banco vai recusar, ou uma faixa de bloqueio numa
 * conta saudável.
 *
 * Este arquivo é puro de propósito — sem import de Supabase, de middleware ou
 * de qualquer coisa server-only. Assim tanto a rota de cliente quanto a server
 * function podem importá-lo sem arrastar código do servidor para o bundle do
 * navegador.
 *
 * O par no banco é public.tenant_liberado(uuid); mudou aqui, mude lá.
 */

/** Situações em que a academia pode operar normalmente. */
export const STATUS_LIBERADOS = ["active", "past_due", "trialing"];

export type SituacaoTenant = {
  status: string;
  /** `false` = academia suspensa por um administrador. */
  ativo: boolean;
  trialEndsAt: string | null;
};

/** Trial só vale enquanto a data de término não passou. */
export function trialValido(status: string, trialEndsAt: string | null): boolean {
  if (status !== "trialing") return true;
  if (!trialEndsAt) return true;
  return new Date(trialEndsAt).getTime() > Date.now();
}

/** A academia pode ESCREVER? Leitura é sempre liberada — ver subscription.ts. */
export function tenantLiberado(s: SituacaoTenant): boolean {
  if (!s.ativo) return false;
  if (!STATUS_LIBERADOS.includes(s.status)) return false;
  return trialValido(s.status, s.trialEndsAt);
}

/**
 * Dias que faltam para o teste acabar, arredondando para cima: no último dia
 * ainda mostra "1", não "0". `null` quando não há data.
 */
export function diasRestantesDeTeste(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  return Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000);
}
