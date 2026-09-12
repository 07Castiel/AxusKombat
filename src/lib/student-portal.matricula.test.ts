import { describe, it, expect } from "vitest";
import {
  ESTADO_ACESSO_LABEL,
  MATRICULA_MAX,
  MATRICULA_MIN,
  estadoAcesso,
  generateEnrollment,
  isEnrollmentShaped,
  normalizeEnrollment,
} from "./student-portal.matricula";

describe("a matrícula digitada chega ao banco na forma canônica", () => {
  it("aceita o número exatamente como sai da planilha", () => {
    expect(normalizeEnrollment("AXK-ABCD2345")).toBe("AXK-ABCD2345");
  });

  it("o hífen não decide quem entra", () => {
    expect(normalizeEnrollment("AXKABCD2345")).toBe("AXK-ABCD2345");
  });

  it("minúsculas e espaços do teclado do celular não barram o aluno", () => {
    expect(normalizeEnrollment("  axk abcd2345 ")).toBe("AXK-ABCD2345");
  });

  it("ignora pontuação colada no copiar e colar", () => {
    expect(normalizeEnrollment("AXK–ABCD2345.")).toBe("AXK-ABCD2345");
  });

  it("texto sem prefixo vira uma matrícula que simplesmente não existe", () => {
    // Não é erro de validação: o servidor procura no banco e devolve a mesma
    // mensagem genérica de sempre, sem revelar quais matrículas existem.
    expect(normalizeEnrollment("1234")).toBe("AXK-1234");
    expect(isEnrollmentShaped(normalizeEnrollment("1234"))).toBe(false);
  });
});

describe("matrícula gerada", () => {
  it("sai no formato que o portal espera", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isEnrollmentShaped(generateEnrollment())).toBe(true);
    }
  });

  it("sobrevive à normalização sem mudar de valor", () => {
    for (let i = 0; i < 50; i += 1) {
      const matricula = generateEnrollment();
      expect(normalizeEnrollment(matricula)).toBe(matricula);
    }
  });

  it("cabe no que o servidor aceita como entrada", () => {
    const matricula = generateEnrollment();
    expect(matricula.length).toBeGreaterThanOrEqual(MATRICULA_MIN);
    expect(matricula.length).toBeLessThanOrEqual(MATRICULA_MAX);
  });

  it("não usa caracteres que se confundem no papel", () => {
    const confusos = /[IO01]/;
    for (let i = 0; i < 200; i += 1) {
      expect(confusos.test(generateEnrollment().slice(4))).toBe(false);
    }
  });

  it("não repete: 2000 matrículas seguidas são todas distintas", () => {
    // A unicidade real é a constraint UNIQUE no banco; aqui o que se prova é
    // que o gerador não colide na prática ao rodar para uma academia inteira.
    const geradas = new Set(Array.from({ length: 2000 }, () => generateEnrollment()));
    expect(geradas.size).toBe(2000);
  });
});

describe("estado do acesso mostrado à academia", () => {
  it("aluno sem credencial aparece como não gerado", () => {
    expect(estadoAcesso(null, "ativo")).toBe("nao_gerado");
    expect(estadoAcesso(undefined, "ativo")).toBe("nao_gerado");
  });

  it("matrícula bloqueada aparece como bloqueada, mesmo com aluno ativo", () => {
    expect(estadoAcesso({ ativo: false }, "ativo")).toBe("bloqueado");
  });

  it("aluno ativo com matrícula liberada entra", () => {
    expect(estadoAcesso({ ativo: true }, "ativo")).toBe("ativo");
  });

  it("matrícula liberada de aluno inativo não é anunciada como ativa", () => {
    // O login recusa aluno que não está ativo. Dizer "Ativo" aqui faria a
    // academia entregar um número que não abre o portal.
    expect(estadoAcesso({ ativo: true }, "inativo")).toBe("indisponivel");
    expect(estadoAcesso({ ativo: true }, "arquivado")).toBe("indisponivel");
  });

  it("todo estado tem rótulo em português", () => {
    for (const estado of ["nao_gerado", "ativo", "bloqueado", "indisponivel"] as const) {
      expect(ESTADO_ACESSO_LABEL[estado]).toBeTruthy();
    }
  });
});
