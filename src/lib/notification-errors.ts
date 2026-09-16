/**
 * Classificação de erros de envio de notificações.
 * Client-safe: usado tanto pelo worker quanto pela interface.
 */

export type ErroCodigo =
  | "whatsapp_desconectado"
  | "sem_telefone"
  | "telefone_invalido"
  | "sem_modelo"
  | "servico_indisponivel"
  | "configuracao_invalida"
  | "desconhecido";

export const MAX_TENTATIVAS = 5;

/** Espera antes da próxima tentativa, em minutos, por número de tentativas já feitas. */
export const BACKOFF_MINUTOS = [5, 30, 120, 360, 1440];

/**
 * Erros que exigem correção manual — não adianta retentar sozinho.
 * `whatsapp_desconectado` NÃO é retentável automaticamente: após a reconexão
 * o reenvio só acontece se o usuário autorizar no diálogo de reconexão.
 */
const NAO_RETENTAVEIS: ErroCodigo[] = [
  "sem_telefone", "telefone_invalido", "sem_modelo", "whatsapp_desconectado",
  "configuracao_invalida",
];

export function isRetentavel(codigo: string | null | undefined): boolean {
  return !NAO_RETENTAVEIS.includes((codigo ?? "desconhecido") as ErroCodigo);
}

/**
 * Códigos HTTP em que a culpa é do transporte, não da mensagem: vale tentar de
 * novo mais tarde.
 *
 * A faixa 52x/530 é do Cloudflare, que fica na frente da Evolution. O 530
 * ("error code: 1016") significa que o Cloudflare não conseguiu nem resolver o
 * DNS da origem — a requisição não chegou ao servidor de WhatsApp. Sem isto na
 * lista, a queda do servidor virava "desconhecido" e o painel mandava o admin
 * "verificar o histórico" de uma falha que se resolve sozinha.
 */
const STATUS_INDISPONIVEL = new Set([
  408, 425, 429,
  500, 502, 503, 504, 507, 508,
  520, 521, 522, 523, 524, 525, 526, 527, 529, 530,
]);

/** Sinais de rede que aparecem no lugar de um código HTTP (a resposta nem veio). */
const SINAIS_INDISPONIVEL = [
  "timeout", "timed out", "tempo esgotado",
  "fetch", "network", "socket", "abort",
  "econn", "enotfound", "eai_again", "etimedout", "ehostunreach", "enetunreach",
  "dns", "gateway", "unavailable", "indisponível", "indisponivel",
  "inacessível", "inacessivel",
];

/**
 * Credencial recusada ou ausente. Retentar não muda nada: a Evolution vai
 * recusar as cinco tentativas igual, e cinco POSTs recusados por minuto é
 * justamente o tráfego que não se quer gerar. Precisa de correção humana.
 */
const STATUS_CONFIGURACAO = new Set([401, 403, 407]);

const SINAIS_CONFIGURACAO = [
  "não configurado", "nao configurado",
  "unauthorized", "forbidden", "apikey", "api key",
];

/**
 * A Evolution respondeu, mas o socket do Baileys com o WhatsApp está fechado.
 *
 * Vem como HTTP 500 com `{"message":"Connection Closed"}` no corpo, então sem
 * isto caía em "servico_indisponivel" e era retentado 5x — e as cinco falham
 * igual, porque o que falta é alguém ler o QR Code de novo. Como
 * `whatsapp_desconectado`, para de retentar e entra no diálogo de reconexão,
 * que pergunta ao admin se as pendentes devem sair.
 *
 * Só os motivos que exigem reconexão. `restart required` e `timed out` são
 * transitórios e continuam retentáveis de propósito.
 */
const SINAIS_SESSAO_MORTA = [
  "connection closed", "connection lost", "connection replaced", "logged out",
];

function pareceSessaoMorta(m: string): boolean {
  return SINAIS_SESSAO_MORTA.some((s) => m.includes(s));
}

function pareceConfiguracao(m: string): boolean {
  for (const t of m.match(/\b\d{3}\b/g) ?? []) {
    if (STATUS_CONFIGURACAO.has(Number(t))) return true;
  }
  return SINAIS_CONFIGURACAO.some((s) => m.includes(s));
}

function pareceIndisponivel(m: string): boolean {
  // \b\d{3}\b isola o status: casa "HTTP 530" e "504 gateway", mas não o
  // "1016" do corpo de erro do Cloudflare nem outros números de 4+ dígitos.
  for (const t of m.match(/\b\d{3}\b/g) ?? []) {
    if (STATUS_INDISPONIVEL.has(Number(t))) return true;
  }
  return SINAIS_INDISPONIVEL.some((s) => m.includes(s));
}

export function classifyErro(mensagem: string | null | undefined): ErroCodigo {
  const m = (mensagem ?? "").toLowerCase();
  if (!m) return "desconhecido";
  if (m.includes("sem telefone")) return "sem_telefone";
  if (m.includes("telefone inválido") || m.includes("numero inválido") || m.includes("número inválido"))
    return "telefone_invalido";
  if (m.includes("modelo")) return "sem_modelo";
  if (
    m.includes("desconectado") || m.includes("não conectado") || m.includes("nao conectado")
    || pareceSessaoMorta(m)
  ) return "whatsapp_desconectado";
  if (pareceConfiguracao(m)) return "configuracao_invalida";
  if (pareceIndisponivel(m)) return "servico_indisponivel";
  return "desconhecido";
}

export const ERRO_LABEL: Record<ErroCodigo, string> = {
  whatsapp_desconectado: "WhatsApp desconectado",
  sem_telefone: "Aluno sem telefone cadastrado",
  telefone_invalido: "Número de telefone inválido",
  sem_modelo: "Modelo de mensagem não configurado",
  servico_indisponivel: "Serviço de envio indisponível",
  configuracao_invalida: "Acesso ao serviço de WhatsApp recusado",
  desconhecido: "Falha no envio",
};

export const ERRO_ACAO: Record<ErroCodigo, string> = {
  whatsapp_desconectado: "Reconecte o WhatsApp na aba WhatsApp — ao reconectar você poderá autorizar o reenvio.",
  sem_telefone: "Cadastre o telefone do aluno e reenvie manualmente.",
  telefone_invalido: "Corrija o telefone do aluno e reenvie manualmente.",
  sem_modelo: "Crie o modelo correspondente na aba Modelos.",
  servico_indisponivel: "Nova tentativa automática em instantes.",
  configuracao_invalida:
    "A chave de acesso ao serviço foi recusada. Nenhuma mensagem sai até o suporte corrigir — fale com o suporte.",
  desconhecido: "Verifique o histórico para detalhes.",
};

export function erroLabel(codigo: string | null | undefined): string {
  return ERRO_LABEL[(codigo ?? "desconhecido") as ErroCodigo] ?? ERRO_LABEL.desconhecido;
}

export function erroAcao(codigo: string | null | undefined): string {
  return ERRO_ACAO[(codigo ?? "desconhecido") as ErroCodigo] ?? ERRO_ACAO.desconhecido;
}

export function proximaTentativaISO(tentativas: number): string | null {
  if (tentativas >= MAX_TENTATIVAS) return null;
  const min = BACKOFF_MINUTOS[Math.min(tentativas, BACKOFF_MINUTOS.length - 1)];
  return new Date(Date.now() + min * 60_000).toISOString();
}

/**
 * Ação a mostrar levando em conta as tentativas já feitas.
 *
 * `erroAcao("servico_indisponivel")` promete "nova tentativa automática", o que
 * deixa de ser verdade quando o teto de tentativas é atingido: a mensagem fica
 * parada em "falhou" esperando alguém clicar em Reenviar. Dizer isso é o que
 * separa uma falha temporária de uma mensagem que nunca vai sair sozinha.
 */
export function erroAcaoComTentativas(
  codigo: string | null | undefined,
  tentativas: number | null | undefined,
  proximaTentativa: string | null | undefined,
): string {
  const esgotou = !proximaTentativa
    && isRetentavel(codigo)
    && (tentativas ?? 0) >= MAX_TENTATIVAS;
  if (esgotou) {
    return `Tentamos ${MAX_TENTATIVAS} vezes sem sucesso. Use "Reenviar" quando o serviço voltar.`;
  }
  return erroAcao(codigo);
}
