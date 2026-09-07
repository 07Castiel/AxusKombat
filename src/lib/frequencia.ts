/**
 * Apresentação dos dados de frequencia_aluno(). SEM conta nenhuma.
 *
 * Aderência, ritmo, expectativa, dias sem treinar e confiabilidade saem prontos
 * do Postgres (supabase/migrations/20260906120000_frequencia_aluno_com_guardas.sql).
 * Refazer qualquer uma delas aqui criaria uma segunda fonte de verdade que
 * divergiria da primeira no dia em que a regra mudasse. Este arquivo só
 * formata, rotula e decide o que a tela mostra quando o valor é `null`.
 *
 * A regra que este módulo carrega é uma só, e ela é a mais importante:
 *
 *     null NÃO é zero.
 *
 * A função devolve `null` de propósito quando não há expectativa a cobrar —
 * categoria sem grade ativa, sem chamada suficiente no período, ou expectativa
 * menor que um dia inteiro de treino. Renderizar isso como "0%" inventa um
 * número que ninguém mediu, e é exatamente o erro que as guardas do banco
 * existem para evitar. Todo formatador aqui devolve `null` para o chamador
 * desenhar o estado "sem dados", em vez de um zero.
 */
import type { FrequenciaLinha } from "@/integrations/supabase/tabelas-pendentes";

export const SEM_DADOS = "Sem dados suficientes";

/** Percentual da aderência, ou `null` quando não houve o que medir. */
export function fmtAderencia(v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return `${Math.round(v * 100)}%`;
}

/** "2,0" — dias por semana. `null` quando não há linha de base. */
export function fmtRitmo(v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** "8" ou "8,5" — a expectativa vem fracionária para quem entrou no meio. */
export function fmtDias(v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** De onde saiu a meta, em português de tela. */
export const ORIGEM_META: Record<FrequenciaLinha["meta_origem"], string> = {
  plano: "do plano contratado",
  historico: "estimada pelo histórico do aluno",
  padrao: "padrão, sem plano nem histórico",
};

/**
 * O aluno está sem treinar há mais tempo que o intervalo normal DELE.
 *
 * Não é um veredito nem uma classificação: é a comparação entre dois números
 * que a própria função devolve — `dias_sem_treinar` (oportunidades perdidas) e
 * `gap_esperado` (7 / meta semanal, o intervalo entre treinos que o plano dele
 * pressupõe). Quem treina 2x por semana tem intervalo normal de 3,5 dias; 5
 * oportunidades perdidas é fora do padrão dele, e para quem treina 5x por
 * semana o mesmo 5 é muito mais fora.
 *
 * Serve para ORDENAR e DESTACAR, não para rotular ninguém. A tela mostra o
 * fato ("está há mais tempo sem treinar que o intervalo do plano"), nunca um
 * juízo sobre o aluno.
 *
 * Devolve `false` quando não dá para afirmar: dados não confiáveis (a academia
 * não registrou chamada suficiente) ou aluno em carência (entrou agora e ainda
 * não teve tempo de formar rotina). São as mesmas guardas do banco, respeitadas
 * aqui em vez de contornadas.
 */
export function acimaDoIntervaloDoPlano(l: FrequenciaLinha): boolean {
  if (!l.confiavel || l.em_carencia) return false;
  return l.dias_sem_treinar > l.gap_esperado;
}

/**
 * Há sinal de chamada não registrada nesta linha.
 *
 * Zero oportunidade perdida com muitos dias corridos desde o último treino só
 * pode significar uma coisa: ninguém fez chamada nesse intervalo. É o par que
 * a função devolve justamente para a tela não ler "0 faltas" como "o aluno
 * está treinando".
 */
export function chamadaInterrompida(l: FrequenciaLinha): boolean {
  if (l.dias_corridos_sem_treinar === null) return false;
  return l.dias_sem_treinar === 0 && l.dias_corridos_sem_treinar > l.gap_esperado;
}

/** "há 3 dias" / "hoje" / "ontem" — para os dias corridos. */
export function fmtDiasCorridos(v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (v === 0) return "hoje";
  if (v === 1) return "ontem";
  return `há ${v} dias`;
}

/** Plural correto para as oportunidades perdidas. */
export function fmtOportunidades(v: number): string {
  return v === 1 ? "1 aula perdida" : `${v} aulas perdidas`;
}
