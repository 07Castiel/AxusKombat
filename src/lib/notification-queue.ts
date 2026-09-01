/**
 * Regras de seleção da fila de notificações (lista + envio).
 *
 * 1. Somente modelos ativos: mensagens cujo (tipo, dias_offset) não tem
 *    modelo ativo são ignoradas (nunca exibidas nem enviadas).
 * 2. Janela dinâmica: apenas agendadas entre agora e exatamente +1 mês.
 * 3. Deduplicação: quando há várias versões da mesma mensagem
 *    (mesmo aluno/mensalidade + tipo + dias_offset), mantém apenas a
 *    mais recente (created_at); as antigas são descartadas do fluxo.
 * 4. Ordem cronológica crescente por data/hora de envio.
 */

export type TemplateLike = { tipo: string; dias_offset: number | null; ativo?: boolean | null };

export type QueueRow = {
  id: string;
  tipo: string;
  dias_offset?: number | null;
  aluno_id?: string | null;
  mensalidade_id?: string | null;
  agendada_para?: string | null;
  created_at?: string | null;
  status?: string | null;
};

/** Fim da janela: exatamente 1 mês à frente da data informada. */
export function janelaFim(from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  const dia = d.getDate();
  d.setMonth(d.getMonth() + 1);
  // ajusta meses mais curtos (31/01 -> 28/02)
  if (d.getDate() < dia) d.setDate(0);
  return d;
}

/** Tipos que não dependem de modelo automático (envio avulso). */
export const TIPOS_SEM_TEMPLATE = new Set(["manual", "COMUNICADO", "teste"]);

export function temTemplateAtivo(row: QueueRow, templates: TemplateLike[]): boolean {
  if (TIPOS_SEM_TEMPLATE.has(row.tipo)) return true;
  const ativos = templates.filter((t) => t.ativo !== false);
  return (
    ativos.some((t) => t.tipo === row.tipo && t.dias_offset === (row.dias_offset ?? 0)) ||
    ativos.some((t) => t.tipo === row.tipo)
  );
}

function dedupeKey(r: QueueRow): string {
  // Envio avulso não tem "versão anterior" para descartar: cada linha é uma
  // mensagem distinta, escrita à mão. Sem esta ressalva, dois comunicados para
  // o mesmo aluno na mesma janela cairiam na mesma chave
  // (aluno_id|COMUNICADO|0) e um deles sumiria da fila em silêncio — nunca
  // enviado, nunca cancelado, filtrado a cada rodada do worker.
  if (TIPOS_SEM_TEMPLATE.has(r.tipo)) return r.id;
  return [r.mensalidade_id ?? r.aluno_id ?? r.id, r.tipo, r.dias_offset ?? 0].join("|");
}

function ts(r: QueueRow): number {
  return new Date(r.agendada_para ?? r.created_at ?? 0).getTime();
}

/** Mantém apenas a versão mais recente de cada mensagem duplicada. */
export function apenasVersaoMaisRecente<T extends QueueRow>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) {
    const k = dedupeKey(r);
    const atual = map.get(k);
    if (!atual) {
      map.set(k, r);
      continue;
    }
    const novo = new Date(r.created_at ?? 0).getTime();
    const velho = new Date(atual.created_at ?? 0).getTime();
    if (novo >= velho) map.set(k, r);
  }
  return [...map.values()];
}

/**
 * Aplica as regras da fila (modelo ativo, janela, dedupe, ordenação).
 *
 * `aplicarJanela` desliga o recorte de 1 mês — o worker envia o que já venceu.
 *
 * `aplicarTemplates` desliga o filtro de modelo. O worker precisa disso: ele
 * carrega os modelos por tenant dentro do próprio laço (e cancela a mensagem
 * quando o modelo sumiu), então não tem a lista completa para passar aqui.
 * Passar `[]` com o filtro ligado descartava silenciosamente TODA notificação
 * automática — `[].some(...)` é sempre falso para lembrete/vencimento/atraso.
 *
 * `ordem` controla a ordenação: 'desc' para a tela (a última a ser enviada
 * aparece no topo), 'asc' para o worker (fila cronológica, mais antiga primeiro).
 */
export function filtrarFila<T extends QueueRow>(
  rows: T[],
  templates: TemplateLike[],
  opts: {
    agora?: Date;
    aplicarJanela?: boolean;
    aplicarTemplates?: boolean;
    ordem?: "asc" | "desc";
  } = {},
): T[] {
  const agora = opts.agora ?? new Date();
  const fim = janelaFim(agora).getTime();
  const inicio = agora.getTime();

  let out =
    opts.aplicarTemplates === false
      ? [...rows]
      : rows.filter((r) => temTemplateAtivo(r, templates));
  if (opts.aplicarJanela !== false) {
    out = out.filter((r) => {
      const t = ts(r);
      return t >= inicio - 60_000 && t <= fim;
    });
  }
  out = apenasVersaoMaisRecente(out);
  out.sort((a, b) => (opts.ordem === "asc" ? ts(a) - ts(b) : ts(b) - ts(a)));
  return out;
}
