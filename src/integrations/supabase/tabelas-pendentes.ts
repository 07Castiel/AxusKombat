/**
 * Ponte tipada para tabelas que a migration cria mas que ainda não estão no
 * `types.ts`.
 *
 * `types.ts` é gerado pelo Lovable a partir do schema publicado. Editá-lo à mão
 * seria desfeito na próxima regeneração — e, pior, se a regeneração acontecesse
 * antes de a migration rodar, o build quebraria.
 *
 * Aqui as tabelas ganham tipos de verdade (não é `as any` disfarçado), e o
 * arquivo sobrevive a qualquer regeneração. Quando `types.ts` já trouxer as duas
 * tabelas, este módulo pode ser apagado e os chamadores voltam a usar
 * `supabaseAdmin.from(...)` direto.
 *
 * Criadas em: supabase/HARDENING_4_APLICAR.sql (tabelas)
 *             supabase/HARDENING_7_APLICAR.sql (funcoes de agregacao)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Tabela<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

/** Tentativas de login no painel mestre — base do teto por IP (A6). */
type MasterLoginAttempt = {
  id: string;
  ip: string;
  sucesso: boolean;
  criado_em: string;
};

/** Eventos já processados do Stripe — de-dupe e guarda de ordem (M8). */
type StripeWebhookEvent = {
  event_id: string;
  event_type: string;
  event_created: string;
  customer_id: string | null;
  processed_at: string;
};

/** Retorno de dashboard_resumo() — A4. */
export type DashboardResumo = {
  alunos: { ativos: number; inativos: number; total: number };
  financeiro: {
    receita_recebida: number;
    receita_prevista: number;
    total_vencidas: number;
    qtd_vencidas: number;
    qtd_pendentes: number;
    inadimplentes: number;
  };
  despesas_mes: number;
  lucro_mes: number;
  serie_receita: { mes: string; receita: number }[];
  proximos_vencimentos: {
    id: string;
    aluno: string;
    data_vencimento: string;
    valor: number;
  }[];
  aniversariantes: { id: string; nome_completo: string; data_nascimento: string }[];
};

/** Retorno de relatorio_periodo(date, date) — A4. */
export type RelatorioPeriodo = {
  totais: { recebido: number; vencido: number; pendente: number };
  despesas: number;
  mensal: { mes: string; receita: number; despesa: number }[];
  inadimplentes: { nome: string; atrasadas: number; total: number }[];
  despesas_por_categoria: { categoria: string; total: number }[];
  composicao_alunos: { adulto: number; kids: number; ativos: number; total: number };
};

/**
 * Campos de `notificacoes` que o worker grava, incluindo `reivindicado_em`,
 * criada na ETAPA 4 e ainda ausente de types.ts. Forma parcial de propósito:
 * cobre só o que o worker escreve.
 */
type NotificacaoEscrita = {
  status: string;
  erro: string | null;
  erro_codigo: string | null;
  tentativas: number;
  proxima_tentativa: string | null;
  motivo_cancelamento: string | null;
  enviada_em: string | null;
  destinatario: string | null;
  mensagem: string;
  updated_at: string;
  reivindicado_em: string | null;
};

/** Retorno de master_excluir_tenant(uuid) — M12. */
export type ExclusaoTenant = { nome: string; usuarios: string[] };

type Fn<Args, Returns> = { Args: Args; Returns: Returns };

export type PendingDatabase = {
  public: {
    Tables: {
      master_login_attempts: Tabela<
        MasterLoginAttempt,
        { ip: string; sucesso: boolean; id?: string; criado_em?: string }
      >;
      notificacoes: Tabela<NotificacaoEscrita & { id: string }, Partial<NotificacaoEscrita>>;
      stripe_webhook_events: Tabela<
        StripeWebhookEvent,
        {
          event_id: string;
          event_type: string;
          event_created: string;
          customer_id?: string | null;
          processed_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      dashboard_resumo: Fn<Record<string, never>, DashboardResumo>;
      relatorio_periodo: Fn<{ p_de: string; p_ate: string }, RelatorioPeriodo>;
      master_excluir_tenant: Fn<{ p_tenant_id: string }, ExclusaoTenant>;
      reivindicar_notificacoes: Fn<
        {
          p_tenant: string | null;
          p_limite_agendadas: number;
          p_limite_retry: number;
          p_max_tentativas: number;
        },
        string[]
      >;
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/** Reinterpreta o client para enxergar o schema ainda não tipado. */
export function comTabelasPendentes(client: unknown): SupabaseClient<PendingDatabase> {
  return client as unknown as SupabaseClient<PendingDatabase>;
}
