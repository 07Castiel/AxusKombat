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
];

export function isRetentavel(codigo: string | null | undefined): boolean {
  return !NAO_RETENTAVEIS.includes((codigo ?? "desconhecido") as ErroCodigo);
}

export function classifyErro(mensagem: string | null | undefined): ErroCodigo {
  const m = (mensagem ?? "").toLowerCase();
  if (!m) return "desconhecido";
  if (m.includes("sem telefone")) return "sem_telefone";
  if (m.includes("telefone inválido") || m.includes("numero inválido") || m.includes("número inválido"))
    return "telefone_invalido";
  if (m.includes("modelo")) return "sem_modelo";
  if (m.includes("desconectado") || m.includes("não conectado") || m.includes("nao conectado"))
    return "whatsapp_desconectado";
  if (
    m.includes("timeout") || m.includes("fetch") || m.includes("network") ||
    m.includes("502") || m.includes("503") || m.includes("504") || m.includes("econn")
  ) return "servico_indisponivel";
  return "desconhecido";
}

export const ERRO_LABEL: Record<ErroCodigo, string> = {
  whatsapp_desconectado: "WhatsApp desconectado",
  sem_telefone: "Aluno sem telefone cadastrado",
  telefone_invalido: "Número de telefone inválido",
  sem_modelo: "Modelo de mensagem não configurado",
  servico_indisponivel: "Serviço de envio indisponível",
  desconhecido: "Falha no envio",
};

export const ERRO_ACAO: Record<ErroCodigo, string> = {
  whatsapp_desconectado: "Reconecte o WhatsApp na aba WhatsApp — o reenvio é automático.",
  sem_telefone: "Cadastre o telefone do aluno e reenvie manualmente.",
  telefone_invalido: "Corrija o telefone do aluno e reenvie manualmente.",
  sem_modelo: "Crie o modelo correspondente na aba Modelos.",
  servico_indisponivel: "Nova tentativa automática em instantes.",
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
