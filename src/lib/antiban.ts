/**
 * Proteções antibanimento do WhatsApp.
 *
 * O WhatsApp bloqueia números que se comportam como robô: rajadas de mensagens
 * idênticas, no mesmo milissegundo, em volume alto logo após conectar. As
 * quatro defesas abaixo atacam exatamente esse padrão.
 *
 *  1. Aquecimento gradual — um número recém-conectado começa com poucas
 *     mensagens por dia e sobe aos poucos até o teto configurado.
 *  2. Intervalo variável — pausa aleatória entre um envio e outro.
 *  3. Teto diário — nenhuma academia passa do limite de mensagens por dia.
 *  4. Variação de texto — a mesma mensagem nunca sai literalmente igual para
 *     dezenas de destinatários.
 *
 * Módulo puro (sem I/O) para poder ser usado no worker e testado isoladamente.
 */

export type AntibanConfig = {
  aquecimento_ativo?: boolean | null;
  numero_ativo_desde?: string | null; // YYYY-MM-DD
  limite_diario?: number | null;
  intervalo_min_seg?: number | null;
  intervalo_max_seg?: number | null;
  variacao_texto?: boolean | null;
};

export const PADROES = {
  limite_diario: 300,
  intervalo_min_seg: 8,
  intervalo_max_seg: 25,
};

/**
 * Curva de aquecimento: quantas mensagens o número pode enviar no dia N
 * depois de conectado (dia 1 = primeiro dia).
 */
const CURVA = [20, 30, 45, 60, 80, 110, 150, 200, 260];

/** Dias completos entre a data de ativação e hoje (dia 1 = dia da ativação). */
export function diaDeAquecimento(desde: string | null | undefined, hoje: Date = new Date()): number {
  if (!desde) return CURVA.length + 1; // sem data registrada: número já maduro
  const inicio = new Date(`${desde.slice(0, 10)}T12:00:00Z`).getTime();
  if (Number.isNaN(inicio)) return CURVA.length + 1;
  const agora = new Date(
    `${hoje.toISOString().slice(0, 10)}T12:00:00Z`,
  ).getTime();
  const dias = Math.floor((agora - inicio) / 86_400_000);
  return Math.max(1, dias + 1);
}

/** Teto de mensagens válido para hoje, já considerando o aquecimento. */
export function limiteDiarioEfetivo(cfg: AntibanConfig, hoje: Date = new Date()): number {
  const teto = Math.max(1, Number(cfg.limite_diario ?? PADROES.limite_diario));
  if (cfg.aquecimento_ativo === false) return teto;
  const dia = diaDeAquecimento(cfg.numero_ativo_desde, hoje);
  if (dia > CURVA.length) return teto;
  return Math.min(teto, CURVA[dia - 1]!);
}

/** Pausa aleatória (ms) entre dois envios consecutivos. */
export function intervaloAleatorioMs(cfg: AntibanConfig): number {
  const min = Math.max(0, Number(cfg.intervalo_min_seg ?? PADROES.intervalo_min_seg));
  const max = Math.max(min, Number(cfg.intervalo_max_seg ?? PADROES.intervalo_max_seg));
  return Math.round((min + Math.random() * (max - min)) * 1000);
}

// ---- variação de texto -------------------------------------------------

const ABERTURAS = ["", "Olá! ", "Oi! ", "Olá, tudo bem? ", "Oi, tudo bem? "];
const FECHAMENTOS = [
  "",
  "\n\nQualquer dúvida, estamos à disposição.",
  "\n\nQualquer dúvida, é só chamar.",
  "\n\nEstamos à disposição para ajudar.",
  "\n\nContamos com você!",
];

const TEM_SAUDACAO = /^\s*(ol[áa]|oi|bom dia|boa tarde|boa noite|e a[íi])/i;

/** Hash estável: a mesma notificação gera sempre a mesma variação. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Aplica pequenas variações que não mudam o sentido da mensagem.
 * Determinístico por `seed` (id da notificação): uma retentativa envia
 * exatamente o mesmo texto da tentativa anterior.
 */
export function variarTexto(mensagem: string, seed: string, ativo = true): string {
  const base = mensagem.trim();
  if (!ativo || !base) return mensagem;
  const h = hash(seed);
  const abertura = TEM_SAUDACAO.test(base) ? "" : ABERTURAS[h % ABERTURAS.length]!;
  const fechamento = base.length > 400 ? "" : FECHAMENTOS[(h >> 3) % FECHAMENTOS.length]!;
  return `${abertura}${base}${fechamento}`;
}
