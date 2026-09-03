import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtMoney = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return date.toLocaleDateString("pt-BR");
};

export type DuracaoPlano = "mensal" | "trimestral" | "semestral" | "anual" | "personalizado";

export const addDuracao = (start: Date, duracao: DuracaoPlano, dias?: number | null) => {
  const d = new Date(start);
  if (duracao === "personalizado") {
    d.setDate(d.getDate() + (dias ?? 30));
    return d;
  }
  const months =
    duracao === "mensal" ? 1 : duracao === "trimestral" ? 3 : duracao === "semestral" ? 6 : 12;
  d.setMonth(d.getMonth() + months);
  return d;
};

export const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Lê um parâmetro de URL usado como sinalizador (?retomar=true, ?trial=1).
 *
 * O TanStack Router faz JSON.parse de cada parâmetro, então `?retomar=true`
 * chega como o booleano `true` e `?trial=1` como o número `1` — nunca como as
 * strings "true" e "1".
 *
 * Os schemas antigos exigiam exatamente essas strings (`z.literal("true")`,
 * `z.string()`), então o validateSearch falhava com `invalid_union` e derrubava
 * a rota inteira antes de renderizar. Era o que quebrava /precos toda vez que o
 * app redirecionava por assinatura pendente, e o que quebraria /bem-vindo no
 * retorno do checkout do Stripe.
 *
 * Aceita todas as formas e devolve booleano.
 */
export const flagDeBusca = (v: unknown): boolean =>
  v === true || v === "true" || v === "1" || v === 1;

/**
 * Mesma leitura, para uso em `validateSearch`: devolve `true` ou `undefined`,
 * nunca `false`.
 *
 * O router serializa de volta na URL tudo que o schema devolve. Com `false`,
 * abrir /precos disparava um 307 para /precos?expirado=false a cada visita, e
 * /bem-vindo estampava ?trial=false na barra de endereços justamente para quem
 * tinha acabado de entrar no teste. `undefined` simplesmente não aparece.
 */
export const flagDeBuscaOpcional = (v: unknown): true | undefined =>
  flagDeBusca(v) || undefined;
