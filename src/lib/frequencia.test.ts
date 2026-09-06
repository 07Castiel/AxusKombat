import { describe, it, expect } from "vitest";
import {
  SEM_DADOS,
  acimaDoIntervaloDoPlano,
  chamadaInterrompida,
  fmtAderencia,
  fmtDias,
  fmtDiasCorridos,
  fmtOportunidades,
  fmtRitmo,
} from "./frequencia";
import type { FrequenciaLinha } from "@/integrations/supabase/tabelas-pendentes";

/** Linha "normal": aluno de 2x por semana, em dia, dados confiáveis. */
function linha(over: Partial<FrequenciaLinha> = {}): FrequenciaLinha {
  return {
    aluno_id: "00000000-0000-0000-0000-000000000001",
    nome_completo: "Aluno Teste",
    categoria: "adulto",
    meta_semanal: 2,
    meta_origem: "plano",
    dias_treinados: 8,
    dias_esperados: 8,
    aderencia: 1,
    ritmo_semanal: 2,
    ritmo_base_semanal: 2,
    ultima_presenca: "2026-09-04",
    dias_sem_treinar: 0,
    dias_corridos_sem_treinar: 2,
    gap_esperado: 3.5,
    em_carencia: false,
    dias_desde_entrada: 400,
    confiavel: true,
    ...over,
  };
}

describe("null nunca vira zero", () => {
  it("aderência nula não é 0%", () => {
    expect(fmtAderencia(null)).toBeNull();
    expect(fmtAderencia(undefined)).toBeNull();
    // e o zero real continua sendo zero
    expect(fmtAderencia(0)).toBe("0%");
  });

  it("distingue aderência 0 (o aluno não treinou) de aderência nula (ninguém mediu)", () => {
    expect(fmtAderencia(0)).toBe("0%");
    expect(fmtAderencia(null)).toBeNull();
    expect(fmtAderencia(0)).not.toBe(fmtAderencia(null));
  });

  it("ritmo base nulo não é 0/sem", () => {
    expect(fmtRitmo(null)).toBeNull();
    expect(fmtRitmo(0)).toBe("0,0");
  });

  it("expectativa nula não é 0 dias", () => {
    expect(fmtDias(null)).toBeNull();
    expect(fmtDias(0)).toBe("0");
  });

  it("dias corridos nulos não viram 'hoje'", () => {
    expect(fmtDiasCorridos(null)).toBeNull();
    expect(fmtDiasCorridos(0)).toBe("hoje");
  });

  it("a mensagem de ausência é uma frase, não um número", () => {
    expect(SEM_DADOS).toBe("Sem dados suficientes");
    expect(SEM_DADOS).not.toMatch(/\d/);
  });
});

describe("formatação em português", () => {
  it("arredonda a aderência para inteiro", () => {
    expect(fmtAderencia(0.6432)).toBe("64%");
    expect(fmtAderencia(1)).toBe("100%");
  });

  it("usa vírgula decimal no ritmo", () => {
    expect(fmtRitmo(2)).toBe("2,0");
    expect(fmtRitmo(1.17)).toBe("1,2");
  });

  it("expectativa fracionária aparece com uma casa", () => {
    expect(fmtDias(0.9)).toBe("0,9");
    expect(fmtDias(8)).toBe("8");
  });

  it("dias corridos viram linguagem natural", () => {
    expect(fmtDiasCorridos(0)).toBe("hoje");
    expect(fmtDiasCorridos(1)).toBe("ontem");
    expect(fmtDiasCorridos(14)).toBe("há 14 dias");
  });

  it("pluraliza as oportunidades perdidas", () => {
    expect(fmtOportunidades(0)).toBe("0 aulas perdidas");
    expect(fmtOportunidades(1)).toBe("1 aula perdida");
    expect(fmtOportunidades(5)).toBe("5 aulas perdidas");
  });
});

describe("acimaDoIntervaloDoPlano — destaque factual, não veredito", () => {
  it("aluno em dia não é destacado", () => {
    expect(acimaDoIntervaloDoPlano(linha({ dias_sem_treinar: 0 }))).toBe(false);
  });

  it("dentro do intervalo do próprio plano não é destacado", () => {
    // meta 2x/semana -> intervalo esperado 3,5 dias
    expect(acimaDoIntervaloDoPlano(linha({ dias_sem_treinar: 3 }))).toBe(false);
  });

  it("acima do intervalo do próprio plano é destacado", () => {
    expect(acimaDoIntervaloDoPlano(linha({ dias_sem_treinar: 5 }))).toBe(true);
  });

  it("o mesmo número de faltas pesa diferente conforme o plano", () => {
    // 4 aulas perdidas: normal para quem treina 1x/semana (intervalo 7 dias),
    // fora do padrão para quem treina 5x (intervalo 1,4 dias).
    const poucoFrequente = linha({ meta_semanal: 1, gap_esperado: 7, dias_sem_treinar: 4 });
    const muitoFrequente = linha({ meta_semanal: 5, gap_esperado: 1.4, dias_sem_treinar: 4 });
    expect(acimaDoIntervaloDoPlano(poucoFrequente)).toBe(false);
    expect(acimaDoIntervaloDoPlano(muitoFrequente)).toBe(true);
  });

  it("dados inconclusivos nunca destacam ninguém", () => {
    expect(acimaDoIntervaloDoPlano(linha({ dias_sem_treinar: 20, confiavel: false }))).toBe(false);
  });

  it("aluno em carência nunca é destacado", () => {
    expect(acimaDoIntervaloDoPlano(linha({ dias_sem_treinar: 20, em_carencia: true }))).toBe(false);
  });
});

describe("chamadaInterrompida — o par que denuncia dado velho", () => {
  it("zero faltas com muitos dias corridos é chamada não registrada", () => {
    expect(
      chamadaInterrompida(linha({ dias_sem_treinar: 0, dias_corridos_sem_treinar: 14 })),
    ).toBe(true);
  });

  it("zero faltas logo depois do treino é normal", () => {
    expect(
      chamadaInterrompida(linha({ dias_sem_treinar: 0, dias_corridos_sem_treinar: 2 })),
    ).toBe(false);
  });

  it("faltas de verdade não são confundidas com chamada ausente", () => {
    expect(
      chamadaInterrompida(linha({ dias_sem_treinar: 10, dias_corridos_sem_treinar: 14 })),
    ).toBe(false);
  });

  it("aluno sem nenhum treino no histórico não dispara o aviso", () => {
    expect(
      chamadaInterrompida(linha({ dias_sem_treinar: 20, dias_corridos_sem_treinar: null })),
    ).toBe(false);
  });
});
