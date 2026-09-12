// Regras da matricula do Portal do Aluno. Ficam separadas do resto do portal
// porque nao dependem de request nem de banco — e e o unico segredo de acesso
// a /portal, entao precisa ser possivel prova-las em teste.

// Sem I, O, 0 e 1: a matricula e lida em voz alta no balcao e copiada da
// planilha impressa, onde esses quatro caracteres se confundem.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PREFIXO = "AXK-";
const DIGITOS = 8;

/** Menor e maior texto que vale a pena mandar ao servidor. */
export const MATRICULA_MIN = 4;
export const MATRICULA_MAX = 40;

/**
 * Reduz o que o aluno digitou a forma canonica gravada no banco.
 * Aceita "axk abcd2345", "AXKABCD2345" e "AXK-ABCD2345" como a mesma
 * matricula: o hifen nao pode decidir quem entra.
 */
export function normalizeEnrollment(value: string): string {
  const limpo = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const corpo = limpo.startsWith("AXK") ? limpo.slice(3) : limpo;
  return `${PREFIXO}${corpo}`;
}

/** Gera uma matricula nova. A unicidade e conferida contra o banco por quem chama. */
export function generateEnrollment(): string {
  // 32 divide 256, entao o resto nao enviesa nenhum caractere.
  const bytes = crypto.getRandomValues(new Uint8Array(DIGITOS));
  return `${PREFIXO}${Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join("")}`;
}

/** Verdadeiro para o formato que generateEnrollment() produz. */
export function isEnrollmentShaped(value: string): boolean {
  return new RegExp(`^${PREFIXO}[${ALFABETO}]{${DIGITOS}}$`).test(value);
}

/** O que a academia ve na lista e na planilha, para cada aluno. */
export type EstadoAcesso = "nao_gerado" | "ativo" | "bloqueado" | "indisponivel";

export const ESTADO_ACESSO_LABEL: Record<EstadoAcesso, string> = {
  nao_gerado: "Não gerado",
  ativo: "Ativo",
  bloqueado: "Bloqueado",
  indisponivel: "Indisponível",
};

/**
 * Estado real do acesso, do jeito que o login vai se comportar.
 * "indisponivel" e a matricula que existe e nao esta bloqueada, mas pertence a
 * um aluno que nao esta ativo: o portal so abre para aluno ativo, entao mostrar
 * "Ativo" aqui faria a academia entregar um numero que nao entra.
 */
export function estadoAcesso(
  credencial: { ativo: boolean } | null | undefined,
  statusDoAluno: string,
): EstadoAcesso {
  if (!credencial) return "nao_gerado";
  if (!credencial.ativo) return "bloqueado";
  return statusDoAluno === "ativo" ? "ativo" : "indisponivel";
}
