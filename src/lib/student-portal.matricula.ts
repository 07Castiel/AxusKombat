// Regras de acesso ao Portal do Aluno. Ficam separadas do resto do portal
// porque nao dependem de request nem de banco, e o login inteiro se apoia
// nelas — precisa ser possivel prova-las em teste.
//
// O acesso pede dois campos: a matricula, que a academia entrega, e a data de
// nascimento, que so o aluno e a academia sabem. A matricula sozinha e curta
// de proposito, para caber num recado de WhatsApp e ser ditada no balcao; e a
// data que impede alguem de varrer numeros ate cair numa conta.

const DIGITOS = 6;
const MENOR = 10 ** (DIGITOS - 1); // 100000
const MAIOR = 10 ** DIGITOS - 1; // 999999

/** Quantidade exata de digitos de uma matricula. */
export const MATRICULA_DIGITOS = DIGITOS;

/**
 * Reduz o que o aluno digitou a forma canonica gravada no banco.
 * Descarta espaco, ponto, hifen e qualquer letra: "48 27 39" e "482.739"
 * chegam como "482739".
 */
export function normalizeEnrollment(value: string): string {
  return value.replace(/\D/g, "");
}

/** Gera uma matricula nova. A unicidade e conferida contra o banco por quem chama. */
export function generateEnrollment(): string {
  // rejection sampling: 900000 nao divide 2^32, entao o resto enviesaria os
  // primeiros numeros da faixa.
  const faixa = MAIOR - MENOR + 1;
  const teto = Math.floor(0xffffffff / faixa) * faixa;
  let sorteado = 0;
  do {
    sorteado = crypto.getRandomValues(new Uint32Array(1))[0]!;
  } while (sorteado >= teto);
  return String(MENOR + (sorteado % faixa));
}

/** Verdadeiro para o formato que generateEnrollment() produz. */
export function isEnrollmentShaped(value: string): boolean {
  return new RegExp(`^[1-9]\\d{${DIGITOS - 1}}$`).test(value);
}

/**
 * Reduz a data digitada a "AAAA-MM-DD", que e como o banco guarda.
 * Aceita "14/03/1998", "14-03-1998" e "1998-03-14". Devolve null para
 * qualquer coisa que nao seja uma data de calendario real, incluindo
 * 31/02 e ano fora de 1900 ate hoje.
 */
export function normalizeBirthDate(value: string): string | null {
  const digitos = value.replace(/\D/g, "");
  let ano: number, mes: number, dia: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    [ano, mes, dia] = value.trim().split("-").map(Number) as [number, number, number];
  } else if (digitos.length === 8) {
    dia = Number(digitos.slice(0, 2));
    mes = Number(digitos.slice(2, 4));
    ano = Number(digitos.slice(4, 8));
  } else {
    return null;
  }
  if (ano < 1900 || ano > new Date().getUTCFullYear()) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  // Confere contra o calendario: o Date normaliza 31/02 para 03/03, entao se
  // os campos voltarem diferentes a data digitada nao existe.
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

/** O que a academia ve na lista e na planilha, para cada aluno. */
export type EstadoAcesso = "nao_gerado" | "ativo" | "bloqueado" | "indisponivel" | "sem_nascimento";

export const ESTADO_ACESSO_LABEL: Record<EstadoAcesso, string> = {
  nao_gerado: "Não gerado",
  ativo: "Ativo",
  bloqueado: "Bloqueado",
  indisponivel: "Indisponível",
  sem_nascimento: "Falta nascimento",
};

/**
 * Estado real do acesso, do jeito que o login vai se comportar.
 *
 * "sem_nascimento" e a matricula liberada de aluno sem data de nascimento no
 * cadastro: o login pede os dois campos, entao esse aluno nao entra ate
 * alguem preencher a data. Aparece como pendencia em vez de falhar calado.
 *
 * "indisponivel" e a matricula liberada de aluno que nao esta ativo. O portal
 * so abre para aluno ativo, entao anunciar "Ativo" faria a academia entregar
 * um numero que nao entra.
 */
export function estadoAcesso(
  credencial: { ativo: boolean } | null | undefined,
  aluno: { status: string; data_nascimento?: string | null },
): EstadoAcesso {
  if (!credencial) return "nao_gerado";
  if (!credencial.ativo) return "bloqueado";
  if (aluno.status !== "ativo") return "indisponivel";
  return aluno.data_nascimento ? "ativo" : "sem_nascimento";
}

/** Só quem está neste estado consegue entrar no portal hoje. */
export function podeEntrar(estado: EstadoAcesso): boolean {
  return estado === "ativo";
}
