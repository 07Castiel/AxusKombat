/**
 * Data "de hoje" no fuso da academia.
 *
 * `new Date().toISOString().slice(0, 10)` devolve a data em UTC. O servidor
 * roda em UTC e as academias estão no Brasil, então entre 21h e a meia-noite
 * (horário de Brasília) o UTC já virou o dia seguinte — e uma mensalidade que
 * vence HOJE era comparada contra AMANHÃ e marcada como vencida um dia antes.
 * Na prática: o aluno recebia cobrança de atraso no próprio dia do vencimento.
 *
 * O fuso vem de notification_settings.timezone, que a academia já configura na
 * tela de notificações (o disparador de mensagens sempre respeitou isso; era a
 * lógica de negócio que não acompanhava). Sem configuração, América/São_Paulo.
 */

export const FUSO_PADRAO = "America/Sao_Paulo";

function formatarData(timezone: string): string {
  // en-CA é o locale que formata como YYYY-MM-DD, o mesmo formato das colunas
  // `date` do Postgres — assim a comparação continua sendo string vs string.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Hoje (YYYY-MM-DD) no fuso informado.
 *
 * Um fuso inválido gravado no banco não derruba a operação: cai no padrão.
 * Intl lança RangeError para nomes desconhecidos, e uma cobrança não deve
 * falhar porque alguém digitou errado numa tela de configuração.
 */
export function hojeNoFuso(timezone: string | null | undefined = FUSO_PADRAO): string {
  try {
    return formatarData(timezone || FUSO_PADRAO);
  } catch {
    return formatarData(FUSO_PADRAO);
  }
}

/** Primeiro dia do mês corrente (YYYY-MM-01) no fuso informado. */
export function inicioDoMesNoFuso(timezone: string | null | undefined = FUSO_PADRAO): string {
  return hojeNoFuso(timezone).slice(0, 7) + "-01";
}

/**
 * Forma mínima que este módulo precisa de um client Supabase.
 *
 * O client real é tipado com o Database inteiro, e aceitá-lo diretamente faz o
 * TypeScript estourar em "Type instantiation is excessively deep" (TS2589) ao
 * conferir a compatibilidade. Por isso o parâmetro entra como `unknown` e é
 * estreitado aqui dentro, uma vez só — em vez de espalhar `any`.
 */
type LeituraDeFuso = {
  from: (tabela: string) => {
    select: (colunas: string) => {
      eq: (
        coluna: string,
        valor: string,
      ) => { maybeSingle: () => PromiseLike<{ data: { timezone?: string | null } | null }> };
    };
  };
};

/**
 * Lê o fuso configurado pela academia. Nunca lança: sem linha de configuração,
 * ou com erro de leitura, devolve o padrão — o pior caso é a data ficar como
 * estava antes desta correção para academias fora de São Paulo.
 */
export async function fusoDoTenant(supabase: unknown, tenantId: string): Promise<string> {
  try {
    const { data } = await (supabase as LeituraDeFuso)
      .from("notification_settings")
      .select("timezone")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    return data?.timezone || FUSO_PADRAO;
  } catch {
    return FUSO_PADRAO;
  }
}
