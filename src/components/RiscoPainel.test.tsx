import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// O <Link> do TanStack exige um RouterProvider, que este teste nao tem e nao
// precisa: o que esta sendo verificado e o TEXTO que o gestor le, nao a
// navegacao. Um <a> basta para o markup sair.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...p }: { children?: React.ReactNode; [k: string]: unknown }) => (
    <a {...p}>{children}</a>
  ),
}));
import { RiscoPainel } from "./RiscoPainel";
import { tomDoRisco, baseFina, fmtCobertura } from "@/lib/risco";
import type { RiscoEvasao, RiscoLinha } from "@/integrations/supabase/tabelas-pendentes";

function L(o: Partial<RiscoLinha> = {}): RiscoLinha {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    nome_completo: "Fulano",
    categoria: "adulto",
    risco: 55,
    cobertura: 0.77,
    componentes: { atraso: 40, reincidencia: 15, contrato: 0, tempo_casa: 0, frequencia: null },
    motivos: ["Mensalidade em aberto há 65 dias (3 parcelas)"],
    nao_medido: ["frequência (chamada insuficiente no período)"],
    ...o,
  };
}
const env = (alunos: RiscoLinha[]): RiscoEvasao => ({
  janela: { ate: "2026-09-07", dias: 28, fuso: "America/Sao_Paulo" },
  peso_total: 130,
  alunos,
});
const R = (alunos: RiscoLinha[]) =>
  renderToStaticMarkup(<RiscoPainel dados={env(alunos)} carregando={false} erro={null} />);

/**
 * O caso que faz este arquivo existir é o segundo: risco nulo e risco 0
 * precisam sair DIFERENTES na tela.
 *
 * Zero é uma afirmação sobre o aluno — foi medido e não há sinal. Nulo é uma
 * afirmação sobre o que a academia registra — não deu para medir. A RPC separa
 * os dois com cuidado; não adianta nada se a última etapa os junta num "0".
 */
describe("render real do painel de risco", () => {
  it("mostra a nota e o fato que a compôs, não só o número", () => {
    const html = R([L()]);
    expect(html).toContain("55");
    expect(html).toContain("Mensalidade em aberto há 65 dias");
  });

  it("risco nulo NÃO vira 0: sai como ausência de leitura", () => {
    const html = R([
      L({ risco: null, cobertura: 0.31, motivos: ["Ativo na ficha, mas sem contrato ativo"] }),
    ]);
    expect(html).toContain("Sem leitura de risco");
    expect(html).toContain("Ativo na ficha, mas sem contrato ativo");
    // o número zero não pode aparecer como nota
    expect(html).not.toMatch(/>0</);
  });

  it("nunca escreve veredito sobre o aluno", () => {
    const html = R([L({ risco: 95 }), L({ id: "2", risco: 3, motivos: [] })]);
    for (const palavra of ["em risco", "crítico", "vai sair", "abandonando", "saudável"]) {
      expect(html.toLowerCase()).not.toContain(palavra);
    }
  });

  it("declara quando a nota se apoia em pouca coisa", () => {
    const html = R([L({ risco: 60, cobertura: 0.5 })]);
    expect(html).toContain("50% dos sinais");
  });

  it("aluno sem nota mas com fato aparece separado, sem número", () => {
    const html = R([
      L({ risco: 55 }),
      L({
        id: "2",
        nome_completo: "Beltrano",
        risco: null,
        cobertura: 0.31,
        motivos: ["Ativo na ficha, mas sem contrato ativo"],
      }),
    ]);
    expect(html).toContain("Sem nota, mas com algo a conferir");
    expect(html).toContain("Beltrano");
  });

  it("lista vazia não inventa estado de erro", () => {
    const html = R([]);
    expect(html).toContain("Nenhum aluno ativo na leitura");
  });
});

describe("regras de apresentacao do risco", () => {
  it("tom nulo é neutro — ausência de dado nunca vira alarme", () => {
    expect(tomDoRisco(null)).toBe("neutro");
    expect(tomDoRisco(0)).toBe("neutro");
    expect(tomDoRisco(29)).toBe("neutro");
    expect(tomDoRisco(30)).toBe("atencao");
    expect(tomDoRisco(60)).toBe("alto");
  });

  it("baseFina só vale para quem TEM nota", () => {
    expect(baseFina(L({ risco: null, cobertura: 0.31 }))).toBe(false);
    expect(baseFina(L({ risco: 50, cobertura: 0.31 }))).toBe(true);
    expect(baseFina(L({ risco: 50, cobertura: 0.77 }))).toBe(false);
  });

  it("cobertura é lida em porcentagem dos sinais", () => {
    expect(fmtCobertura(0.31)).toBe("31% dos sinais");
    expect(fmtCobertura(1)).toBe("100% dos sinais");
  });
});
