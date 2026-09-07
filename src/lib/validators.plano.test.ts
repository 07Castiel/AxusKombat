import { describe, expect, it } from "vitest";
import { planoSchema } from "./validators";

/**
 * `planos.frequencia_semanal` e o denominador de toda a leitura de frequencia:
 * frequencia_aluno() usa esse numero como meta semanal do aluno. Um valor
 * inventado aqui erra a aderencia de todo mundo naquele plano, e um valor
 * proibido aqui obriga o admin a inventar um.
 *
 * Em producao dois planos vieram com a DURACAO em meses neste campo — "Plano
 * Mensal" com 1 e "Adulto - TRIMESTRAL" com 3 — porque nao havia como dizer
 * "este plano nao combina treinos por semana".
 */
const base = {
  nome: "Plano Mensal",
  valor: "150",
  duracao: "mensal",
  categoria: "adulto" as const,
  modalidades: [],
  descricao: "",
};

describe("planoSchema.frequencia_semanal", () => {
  it("aceita vazio e grava NULL: existe plano sem treinos por semana combinados", () => {
    const r = planoSchema.safeParse({ ...base, frequencia_semanal: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.frequencia_semanal).toBeNull();
  });

  it("aceita ausente e undefined como NULL", () => {
    for (const v of [undefined, null]) {
      const r = planoSchema.safeParse({ ...base, frequencia_semanal: v });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.frequencia_semanal).toBeNull();
    }
  });

  it("converte o texto do input em numero quando preenchido", () => {
    const r = planoSchema.safeParse({ ...base, frequencia_semanal: "3" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.frequencia_semanal).toBe(3);
  });

  it("continua barrando 0 — meta 0 dividia por zero em frequencia_aluno()", () => {
    expect(planoSchema.safeParse({ ...base, frequencia_semanal: "0" }).success).toBe(false);
  });

  it("continua barrando negativo, acima de 7 e nao inteiro", () => {
    for (const v of ["-1", "8", "2.5"]) {
      expect(planoSchema.safeParse({ ...base, frequencia_semanal: v }).success).toBe(false);
    }
  });

  it("barra texto que nao e numero", () => {
    expect(planoSchema.safeParse({ ...base, frequencia_semanal: "tres" }).success).toBe(false);
  });
});
