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
  const months = duracao === "mensal" ? 1 : duracao === "trimestral" ? 3 : duracao === "semestral" ? 6 : 12;
  d.setMonth(d.getMonth() + months);
  return d;
};

export const toISODate = (d: Date) => d.toISOString().slice(0, 10);
