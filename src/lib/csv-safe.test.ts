import { describe, expect, it } from "vitest";
import { campoCsv, linhaCsv, neutralizarFormula, tabelaCsv } from "./csv-safe";

describe("neutralizarFormula", () => {
  it("prefixa com apóstrofo as células que começam com = + - @", () => {
    expect(neutralizarFormula("=1+1")).toBe("'=1+1");
    expect(neutralizarFormula("+55 11")).toBe("'+55 11");
    expect(neutralizarFormula("-2")).toBe("'-2");
    expect(neutralizarFormula("@user")).toBe("'@user");
    expect(neutralizarFormula("\t=cmd")).toBe("'\t=cmd");
  });

  it("REGRESSÃO: uma fórmula de exfiltração vira texto literal", () => {
    expect(neutralizarFormula('=HYPERLINK("http://evil","clique")')).toBe(
      "'=HYPERLINK(\"http://evil\",\"clique\")",
    );
  });

  it("deixa texto e números normais intactos", () => {
    expect(neutralizarFormula("João Silva")).toBe("João Silva");
    expect(neutralizarFormula("482739")).toBe("482739");
    expect(neutralizarFormula("https://app/portal")).toBe("https://app/portal");
    expect(neutralizarFormula(123)).toBe("123");
    expect(neutralizarFormula(null)).toBe("");
    expect(neutralizarFormula(undefined)).toBe("");
  });
});

describe("campoCsv", () => {
  it("neutraliza a fórmula E escapa quando há vírgula/aspas", () => {
    // vírgula obriga aspas; a fórmula é neutralizada antes.
    expect(campoCsv("=A1,B1")).toBe('"\'=A1,B1"');
    expect(campoCsv('texto com "aspas"')).toBe('"texto com ""aspas"""');
  });

  it("não põe aspas em texto simples", () => {
    expect(campoCsv("cidade")).toBe("cidade");
  });
});

describe("linhaCsv", () => {
  it("junta células neutralizadas por vírgula", () => {
    expect(linhaCsv(["João", "=2+2", 10])).toBe("João,'=2+2,10");
  });
});

describe("tabelaCsv", () => {
  it("cabeçalho + linhas, com fórmula neutralizada nos valores", () => {
    const csv = tabelaCsv([
      { pagina: "/precos", referrer: "=2+2" },
      { pagina: "/login", referrer: "google.com,br" },
    ]);
    const linhas = csv.split("\n");
    expect(linhas[0]).toBe("pagina,referrer");
    // fórmula neutralizada (sem vírgula, sem aspas)
    expect(linhas[1]).toBe("/precos,'=2+2");
    // vírgula no valor obriga aspas
    expect(linhas[2]).toBe('/login,"google.com,br"');
  });

  it("lista vazia vira string vazia", () => {
    expect(tabelaCsv([])).toBe("");
  });
});
