import { describe, it, expect } from "vitest";
import {
  ESTADO_ACESSO_LABEL,
  MATRICULA_DIGITOS,
  estadoAcesso,
  generateEnrollment,
  isEnrollmentShaped,
  normalizeBirthDate,
  normalizeEnrollment,
  podeEntrar,
} from "./student-portal.matricula";

const aluno = (over: Partial<{ status: string; data_nascimento: string | null }> = {}) => ({
  status: "ativo",
  data_nascimento: "1998-03-14",
  ...over,
});

describe("a matrícula digitada chega ao banco na forma canônica", () => {
  it("aceita o número como sai da planilha", () => {
    expect(normalizeEnrollment("482739")).toBe("482739");
  });

  it("espaço e pontuação não decidem quem entra", () => {
    expect(normalizeEnrollment(" 48 27 39 ")).toBe("482739");
    expect(normalizeEnrollment("482.739")).toBe("482739");
    expect(normalizeEnrollment("482-739")).toBe("482739");
  });

  it("descarta letra digitada por engano", () => {
    expect(normalizeEnrollment("AXK482739")).toBe("482739");
  });
});

describe("matrícula gerada", () => {
  it("tem sempre a mesma quantidade de dígitos", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateEnrollment()).toHaveLength(MATRICULA_DIGITOS);
    }
  });

  it("nunca começa com zero, para não sumir ao colar numa planilha", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(isEnrollmentShaped(generateEnrollment())).toBe(true);
    }
  });

  it("sobrevive à normalização sem mudar de valor", () => {
    for (let i = 0; i < 100; i += 1) {
      const matricula = generateEnrollment();
      expect(normalizeEnrollment(matricula)).toBe(matricula);
    }
  });

  it("não é sequencial: 500 sorteios cobrem toda a faixa", () => {
    // Matrícula sequencial se enumera de fora. O que se prova aqui é que o
    // gerador espalha, não que não colide: a unicidade é a constraint no banco.
    const geradas = Array.from({ length: 500 }, () => Number(generateEnrollment()));
    expect(new Set(geradas).size).toBeGreaterThan(490);
    expect(Math.min(...geradas)).toBeLessThan(400000);
    expect(Math.max(...geradas)).toBeGreaterThan(600000);
  });
});

describe("data de nascimento como segundo fator", () => {
  it("aceita o formato que o brasileiro digita", () => {
    expect(normalizeBirthDate("14/03/1998")).toBe("1998-03-14");
    expect(normalizeBirthDate("14-03-1998")).toBe("1998-03-14");
    expect(normalizeBirthDate("14031998")).toBe("1998-03-14");
  });

  it("aceita o formato que o campo de data do navegador manda", () => {
    expect(normalizeBirthDate("1998-03-14")).toBe("1998-03-14");
  });

  it("recusa data que não existe no calendário", () => {
    expect(normalizeBirthDate("31/02/1998")).toBeNull();
    expect(normalizeBirthDate("30/02/2000")).toBeNull();
    expect(normalizeBirthDate("32/01/1998")).toBeNull();
    expect(normalizeBirthDate("14/13/1998")).toBeNull();
  });

  it("aceita 29 de fevereiro em ano bissexto e recusa fora dele", () => {
    expect(normalizeBirthDate("29/02/2000")).toBe("2000-02-29");
    expect(normalizeBirthDate("29/02/1999")).toBeNull();
  });

  it("recusa ano impossível e texto solto", () => {
    expect(normalizeBirthDate("14/03/1800")).toBeNull();
    expect(normalizeBirthDate("14/03/2099")).toBeNull();
    expect(normalizeBirthDate("")).toBeNull();
    expect(normalizeBirthDate("ontem")).toBeNull();
  });
});

describe("estado do acesso mostrado à academia", () => {
  it("aluno sem credencial aparece como não gerado", () => {
    expect(estadoAcesso(null, aluno())).toBe("nao_gerado");
    expect(estadoAcesso(undefined, aluno())).toBe("nao_gerado");
  });

  it("matrícula bloqueada aparece como bloqueada, mesmo com aluno ativo", () => {
    expect(estadoAcesso({ ativo: false }, aluno())).toBe("bloqueado");
  });

  it("aluno ativo com matrícula liberada e data preenchida entra", () => {
    expect(estadoAcesso({ ativo: true }, aluno())).toBe("ativo");
    expect(podeEntrar("ativo")).toBe(true);
  });

  it("matrícula liberada de aluno inativo não é anunciada como ativa", () => {
    expect(estadoAcesso({ ativo: true }, aluno({ status: "inativo" }))).toBe("indisponivel");
    expect(estadoAcesso({ ativo: true }, aluno({ status: "arquivado" }))).toBe("indisponivel");
  });

  it("aluno sem data de nascimento vira pendência, não falha calada", () => {
    // O login pede os dois campos. Sem a data no cadastro esse aluno não
    // entra, e a academia precisa ver isso na lista para ir preencher.
    expect(estadoAcesso({ ativo: true }, aluno({ data_nascimento: null }))).toBe("sem_nascimento");
    expect(estadoAcesso({ ativo: true }, aluno({ data_nascimento: "" }))).toBe("sem_nascimento");
    expect(podeEntrar("sem_nascimento")).toBe(false);
  });

  it("bloqueio vence data faltando: quem bloqueou quis bloquear", () => {
    expect(estadoAcesso({ ativo: false }, aluno({ data_nascimento: null }))).toBe("bloqueado");
  });

  it("todo estado tem rótulo em português", () => {
    for (const estado of [
      "nao_gerado",
      "ativo",
      "bloqueado",
      "indisponivel",
      "sem_nascimento",
    ] as const) {
      expect(ESTADO_ACESSO_LABEL[estado]).toBeTruthy();
    }
  });
});
