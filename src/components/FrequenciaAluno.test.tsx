import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FrequenciaAlunoSecao } from "./FrequenciaAluno";
import type { FrequenciaAluno, FrequenciaLinha } from "@/integrations/supabase/tabelas-pendentes";

const env: FrequenciaAluno = {
  janela: { dias: 28, de: "2026-08-10", ate: "2026-09-06", fuso: "America/Sao_Paulo" },
  operacao: [{ categoria: "adulto", dias_com_chamada: 20, dias_por_semana: 5, dias_esperados: 20, fator: 1, confiavel: true }],
  alunos: [],
};
function L(o: Partial<FrequenciaLinha> = {}): FrequenciaLinha {
  return { aluno_id: "1", nome_completo: "X", categoria: "adulto", meta_semanal: 2, meta_origem: "plano",
    dias_treinados: 8, dias_esperados: 8, aderencia: 1, ritmo_semanal: 2, ritmo_base_semanal: 2,
    ultima_presenca: "2026-09-04", dias_sem_treinar: 0, dias_corridos_sem_treinar: 2, gap_esperado: 3.5,
    em_carencia: false, dias_desde_entrada: 400, confiavel: true, ...o };
}
const R = (linha: FrequenciaLinha, e = env) => renderToStaticMarkup(
  <FrequenciaAlunoSecao dados={e} linha={linha} carregando={false} erro={null} dias={28} onDiasChange={() => {}} />);

/**
 * Renderiza a seção de verdade (react-dom/server) e confere o que o gestor lê.
 *
 * O caso que justifica este arquivo existir é o terceiro: aderência 0 e
 * aderência nula precisam sair DIFERENTES na tela. Zero é um fato sobre o
 * aluno; nulo é um fato sobre a academia não ter registrado chamada. Mostrar
 * os dois como "0%" faz o gestor cobrar a pessoa errada, e é o erro que as
 * guardas do banco existem para evitar — não adianta o Postgres devolver null
 * se a interface o transforma em zero na última etapa.
 */
describe("render real da secao de frequencia", () => {
  it("aluno completo mostra os indicadores", () => {
    const h = R(L());
    expect(h).toContain("100%");
    expect(h).toContain("2,0/sem");
    expect(h).not.toContain("Sem dados suficientes");
  });
  it("ADERENCIA NULA mostra frase, nunca 0%", () => {
    const h = R(L({ aderencia: null, dias_esperados: null }));
    expect(h).toContain("Sem dados suficientes");
    expect(h).not.toContain(">0%<");
  });
  it("aluno que nao treinou mostra 0% de verdade", () => {
    const h = R(L({ aderencia: 0, dias_treinados: 0, ultima_presenca: null, dias_corridos_sem_treinar: null, dias_sem_treinar: 20 }));
    expect(h).toContain("0%");
    expect(h).toContain("Nenhum treino no histórico analisado");
  });
  it("dados inconclusivos explicam o porque", () => {
    const e = { ...env, operacao: [{ ...env.operacao[0], dias_com_chamada: 8, fator: 0.4, confiavel: false }] };
    const h = R(L({ confiavel: false, aderencia: null, dias_esperados: null }), e);
    expect(h).toContain("Dados inconclusivos");
    expect(h).toContain("não registrou chamadas suficientes");
    expect(h).toContain("Falta de registro não é falta do aluno");
  });
  it("aluno novo nao mostra porcentagem enganosa", () => {
    const h = R(L({ em_carencia: true, dias_desde_entrada: 5, aderencia: null, dias_esperados: 0.9, dias_treinados: 1 }));
    expect(h).toContain("Aluno novo");
    expect(h).toContain("Sem dados suficientes");
  });
  it("chamada interrompida aparece mesmo com dados confiaveis", () => {
    const h = R(L({ dias_sem_treinar: 0, dias_corridos_sem_treinar: 14 }));
    expect(h).toContain("Sem chamada recente");
  });
  it("aluno fora da leitura tem estado vazio proprio", () => {
    const h = renderToStaticMarkup(<FrequenciaAlunoSecao dados={env} linha={undefined} carregando={false} erro={null} dias={28} onDiasChange={() => {}} />);
    expect(h).toContain("não aparece na leitura de frequência");
  });
  it("erro de carregamento tem mensagem propria", () => {
    const h = renderToStaticMarkup(<FrequenciaAlunoSecao dados={undefined} linha={undefined} carregando={false} erro={new Error("x")} dias={28} onDiasChange={() => {}} />);
    expect(h).toContain("Não foi possível carregar");
  });
});
