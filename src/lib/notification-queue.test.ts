import { describe, expect, it } from "vitest";
import {
  apenasVersaoMaisRecente,
  filtrarFila,
  janelaFim,
  temTemplateAtivo,
  type QueueRow,
  type TemplateLike,
} from "./notification-queue";

/**
 * Regras da fila de notificações.
 *
 * Dois bugs reais nasceram exatamente aqui, e cada um tem um teste com o nome
 * do que quebrou:
 *
 *  - o worker chamava filtrarFila com a lista de modelos vazia e o filtro
 *    ligado, o que descartava TODA notificação automática antes do envio;
 *  - a chave de deduplicação colapsava dois comunicados distintos para o mesmo
 *    aluno, e um deles sumia da fila em silêncio.
 */

const AGORA = new Date("2026-09-01T12:00:00.000Z");

function linha(over: Partial<QueueRow> = {}): QueueRow {
  return {
    id: crypto.randomUUID(),
    tipo: "lembrete",
    dias_offset: -2,
    aluno_id: "aluno-1",
    mensalidade_id: "mens-1",
    agendada_para: new Date(AGORA.getTime() + 60_000).toISOString(),
    created_at: AGORA.toISOString(),
    status: "agendada",
    ...over,
  };
}

const MODELOS: TemplateLike[] = [
  { tipo: "lembrete", dias_offset: -2, ativo: true },
  { tipo: "vencimento", dias_offset: 0, ativo: true },
];

describe("temTemplateAtivo", () => {
  it("aceita os tipos avulsos mesmo sem nenhum modelo cadastrado", () => {
    for (const tipo of ["manual", "COMUNICADO", "teste"]) {
      expect(temTemplateAtivo(linha({ tipo }), [])).toBe(true);
    }
  });

  it("recusa tipo automático quando não existe modelo correspondente", () => {
    expect(temTemplateAtivo(linha({ tipo: "lembrete" }), [])).toBe(false);
  });

  it("ignora modelo desativado", () => {
    const inativo: TemplateLike[] = [{ tipo: "lembrete", dias_offset: -2, ativo: false }];
    expect(temTemplateAtivo(linha(), inativo)).toBe(false);
  });

  it("cai no mesmo tipo quando o deslocamento não bate", () => {
    expect(temTemplateAtivo(linha({ dias_offset: -7 }), MODELOS)).toBe(true);
  });
});

describe("filtrarFila — filtro de modelo", () => {
  it("descarta automáticas quando o filtro está ligado e não há modelo", () => {
    const fila = filtrarFila([linha()], [], { agora: AGORA });
    expect(fila).toHaveLength(0);
  });

  it("REGRESSÃO: com aplicarTemplates:false nada é descartado por falta de modelo", () => {
    // Este é o bug A1. O worker passava `[]` com o filtro ligado, então
    // lembrete/vencimento/atraso caíam em [].some() — sempre falso — e a fila
    // inteira era descartada antes do envio, com scanned: 0.
    const fila = filtrarFila([linha(), linha({ tipo: "vencimento", dias_offset: 0 })], [], {
      agora: AGORA,
      aplicarJanela: false,
      aplicarTemplates: false,
    });
    expect(fila).toHaveLength(2);
  });

  it("mantém as automáticas quando os modelos são informados", () => {
    const fila = filtrarFila([linha()], MODELOS, { agora: AGORA });
    expect(fila).toHaveLength(1);
  });
});

describe("filtrarFila — deduplicação", () => {
  it("mantém só a versão mais recente da mesma mensalidade e tipo", () => {
    const antiga = linha({ created_at: "2026-08-01T10:00:00.000Z" });
    const nova = linha({ created_at: "2026-08-20T10:00:00.000Z" });
    const fila = filtrarFila([antiga, nova], MODELOS, { agora: AGORA });
    expect(fila).toHaveLength(1);
    expect(fila[0].created_at).toBe(nova.created_at);
  });

  it("REGRESSÃO: dois comunicados para o mesmo aluno não colapsam em um", () => {
    // Este é o bug encontrado na revisão do A5. A chave era
    // [mensalidade_id ?? aluno_id ?? id, tipo, dias_offset], e comunicado não
    // tem mensalidade_id — dois comunicados distintos para o mesmo aluno caíam
    // na chave "aluno-1|COMUNICADO|0" e um sumia da fila para sempre.
    const primeiro = linha({ tipo: "COMUNICADO", mensalidade_id: null, dias_offset: null });
    const segundo = linha({ tipo: "COMUNICADO", mensalidade_id: null, dias_offset: null });
    const fila = filtrarFila([primeiro, segundo], [], {
      agora: AGORA,
      aplicarJanela: false,
      aplicarTemplates: false,
    });
    expect(fila).toHaveLength(2);
    expect(new Set(fila.map((f) => f.id)).size).toBe(2);
  });

  it("dedupe direto: automáticas colapsam, avulsas não", () => {
    const auto = [linha(), linha()];
    expect(apenasVersaoMaisRecente(auto)).toHaveLength(1);

    const avulsas = [
      linha({ tipo: "COMUNICADO", mensalidade_id: null }),
      linha({ tipo: "COMUNICADO", mensalidade_id: null }),
    ];
    expect(apenasVersaoMaisRecente(avulsas)).toHaveLength(2);
  });
});

describe("filtrarFila — janela e ordenação", () => {
  it("descarta o que está agendado além de um mês", () => {
    const longe = linha({
      agendada_para: new Date(AGORA.getTime() + 60 * 86_400_000).toISOString(),
    });
    expect(filtrarFila([longe], MODELOS, { agora: AGORA })).toHaveLength(0);
  });

  it("descarta o passado quando a janela está ligada, e mantém quando desligada", () => {
    const passado = linha({
      agendada_para: new Date(AGORA.getTime() - 86_400_000).toISOString(),
    });
    expect(filtrarFila([passado], MODELOS, { agora: AGORA })).toHaveLength(0);
    expect(
      filtrarFila([passado], MODELOS, { agora: AGORA, aplicarJanela: false }),
    ).toHaveLength(1);
  });

  it("ordem asc entrega a mais antiga primeiro — é assim que o worker envia", () => {
    const cedo = linha({
      mensalidade_id: "m1",
      agendada_para: "2026-09-01T08:00:00.000Z",
    });
    const tarde = linha({
      mensalidade_id: "m2",
      agendada_para: "2026-09-01T11:00:00.000Z",
    });
    const asc = filtrarFila([tarde, cedo], MODELOS, {
      agora: AGORA,
      aplicarJanela: false,
      ordem: "asc",
    });
    expect(asc.map((r) => r.mensalidade_id)).toEqual(["m1", "m2"]);

    // A tela usa desc: a última a ser enviada aparece no topo.
    const desc = filtrarFila([cedo, tarde], MODELOS, {
      agora: AGORA,
      aplicarJanela: false,
    });
    expect(desc.map((r) => r.mensalidade_id)).toEqual(["m2", "m1"]);
  });
});

describe("janelaFim", () => {
  it("avança exatamente um mês", () => {
    expect(janelaFim(new Date("2026-09-01T12:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-10-01",
    );
  });

  it("encolhe para o último dia quando o mês seguinte é mais curto", () => {
    // 31/01 + 1 mês não existe: precisa virar 28/02, não 03/03.
    expect(janelaFim(new Date("2026-01-31T12:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-02-28",
    );
  });
});
