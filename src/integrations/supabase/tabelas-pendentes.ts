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
 *             supabase/migrations/20260906120000_frequencia_aluno_com_guardas.sql
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

/** Uma linha de aluno em frequencia_aluno(). Medidas, nunca veredito. */
export type FrequenciaLinha = {
  aluno_id: string;
  nome_completo: string;
  categoria: "adulto" | "kids";
  /** Dias por semana contratados. */
  meta_semanal: number;
  /** De onde saiu a meta: o plano, o hábito do próprio aluno, ou o padrão 1. */
  meta_origem: "plano" | "historico" | "padrao";
  /** Dias DISTINTOS com presença na janela — duas aulas no mesmo dia são um dia. */
  dias_treinados: number;
  /** Meta traduzida para a janela, já encolhida pela operação real e pelo
   *  tempo de casa do aluno. `null` quando não há expectativa a cobrar. */
  dias_esperados: number | null;
  /** 0..1. `null` quando a expectativa é menor que um dia de treino, ou quando
   *  a academia não tem grade ativa nem chamada no período — não é 100%. */
  aderencia: number | null;
  /** Dias por semana na janela, SEM teto: é o que deixa a queda aparecer. */
  ritmo_semanal: number;
  /** O mesmo, na janela anterior (3x maior). `null` sem histórico. */
  ritmo_base_semanal: number | null;
  /** `null` quando não houve presença DENTRO do histórico analisado (janela +
   *  linha de base, 112 dias no padrão). Não significa "nunca treinou": quem
   *  parou antes disso também vem null, e para efeito de frequência os dois
   *  casos são o mesmo. Ficha que precise da data exata consulta `presencas`
   *  daquele aluno direto — é uma leitura barata para um id só. */
  ultima_presenca: string | null;
  /** Oportunidades perdidas: dias em que houve chamada NA CATEGORIA dele desde
   *  o último treino. Não são dias de calendário, e nunca contam dias
   *  anteriores à matrícula. Zero quando ninguém registrou chamada. */
  dias_sem_treinar: number;
  /** Dias de calendário desde o último treino; `null` sem presença no
   *  histórico analisado. O par com `dias_sem_treinar` é o que denuncia dado
   *  velho: 0 oportunidade perdida com 14 dias corridos quer dizer que ninguém
   *  fez chamada, não que ele treinou. */
  dias_corridos_sem_treinar: number | null;
  /** 7 / meta_semanal: o intervalo normal entre treinos deste aluno. */
  gap_esperado: number;
  /** Entrou dentro da janela; ainda não teve tempo de formar rotina. */
  em_carencia: boolean;
  dias_desde_entrada: number;
  /** A categoria dele teve chamada suficiente no período para sustentar
   *  conclusão (fator > 0,5). `false` obriga a tela a dizer "dados
   *  insuficientes" em vez de mostrar o aluno numa lista de risco. */
  confiavel: boolean;
};

/** Retorno de frequencia_aluno(uuid, int) — 20260906120000. */
export type FrequenciaAluno = {
  janela: { dias: number; de: string; ate: string; fuso: string };
  /** Uma entrada POR CATEGORIA. A operação é medida por categoria porque a
   *  interrupção quase nunca é da academia inteira: férias escolares param o
   *  kids e o adulto continua. */
  operacao: {
    categoria: "adulto" | "kids";
    dias_com_chamada: number;
    dias_por_semana: number;
    dias_esperados: number;
    /** Quanto a categoria de fato operou, 0..1. `null` sem grade ativa. */
    fator: number | null;
    /** Metade ou menos dos dias esperados com chamada: os números saem mas não
     *  sustentam conclusão sobre ninguém — a tela precisa dizer isso. */
    confiavel: boolean;
  }[];
  alunos: FrequenciaLinha[];
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
      frequencia_aluno: Fn<
        { p_aluno_id: string | null; p_dias: number },
        FrequenciaAluno
      >;
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
