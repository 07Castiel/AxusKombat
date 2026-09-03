import { afterEach, describe, expect, it, vi } from "vitest";
import { FUSO_PADRAO, hojeNoFuso, inicioDoMesNoFuso } from "./data-tenant";

/**
 * O bug: `new Date().toISOString().slice(0, 10)` devolve a data em UTC. Entre
 * 21h e a meia-noite em Brasília o UTC já virou o dia seguinte, e a mensalidade
 * que vence HOJE era comparada contra AMANHÃ — marcada como vencida um dia
 * antes, com cobrança de atraso saindo no próprio dia do vencimento.
 */

afterEach(() => vi.useRealTimers());

/** 30/09/2026 às 23:30 UTC = 20:30 em Brasília, ainda dia 30. */
const ANTES_DA_VIRADA = new Date("2026-09-30T23:30:00Z");
/** 01/10/2026 às 01:30 UTC = 22:30 de 30/09 em Brasília. Aqui UTC já virou. */
const DEPOIS_DA_VIRADA_EM_UTC = new Date("2026-10-01T01:30:00Z");

describe("hojeNoFuso", () => {
  it("REGRESSÃO: às 22h30 de Brasília ainda é dia 30, mesmo com o UTC no dia 1º", () => {
    vi.setSystemTime(DEPOIS_DA_VIRADA_EM_UTC);
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-01"); // o jeito antigo
    expect(hojeNoFuso("America/Sao_Paulo")).toBe("2026-09-30"); // o jeito certo
  });

  it("antes da virada do UTC os dois concordam", () => {
    vi.setSystemTime(ANTES_DA_VIRADA);
    expect(hojeNoFuso("America/Sao_Paulo")).toBe("2026-09-30");
  });

  it("respeita fusos brasileiros diferentes no mesmo instante", () => {
    vi.setSystemTime(new Date("2026-10-01T02:30:00Z"));
    expect(hojeNoFuso("America/Sao_Paulo")).toBe("2026-09-30"); // UTC-3, 23h30
    expect(hojeNoFuso("America/Manaus")).toBe("2026-09-30"); // UTC-4, 22h30
    expect(hojeNoFuso("America/Rio_Branco")).toBe("2026-09-30"); // UTC-5, 21h30
  });

  it("sem fuso informado usa São Paulo", () => {
    vi.setSystemTime(DEPOIS_DA_VIRADA_EM_UTC);
    expect(hojeNoFuso()).toBe(hojeNoFuso(FUSO_PADRAO));
    expect(hojeNoFuso(null)).toBe("2026-09-30");
    expect(hojeNoFuso("")).toBe("2026-09-30");
  });

  it("fuso inválido no banco não derruba a cobrança — cai no padrão", () => {
    vi.setSystemTime(DEPOIS_DA_VIRADA_EM_UTC);
    expect(hojeNoFuso("Fuso/Que/Nao/Existe")).toBe("2026-09-30");
  });

  it("devolve sempre YYYY-MM-DD, o formato das colunas date do Postgres", () => {
    vi.setSystemTime(new Date("2026-01-05T12:00:00Z"));
    expect(hojeNoFuso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hojeNoFuso()).toBe("2026-01-05");
  });
});

describe("inicioDoMesNoFuso", () => {
  it("REGRESSÃO: na virada do mês não pula para o mês seguinte cedo demais", () => {
    // 01/10 00:30 UTC = 30/09 21:30 em Brasília: ainda é setembro lá.
    vi.setSystemTime(new Date("2026-10-01T00:30:00Z"));
    expect(inicioDoMesNoFuso("America/Sao_Paulo")).toBe("2026-09-01");
  });

  it("no dia 1º já em Brasília, aponta para o mês novo", () => {
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    expect(inicioDoMesNoFuso("America/Sao_Paulo")).toBe("2026-10-01");
  });
});
