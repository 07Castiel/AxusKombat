import { describe, expect, it } from "vitest";
import { translateError } from "./errors";

/**
 * Mensagens que o próprio banco levanta.
 *
 * Com o modo somente leitura, o gatilho tg_exigir_assinatura passou a ser a
 * principal fonte de erro que o usuário vê: ele tenta salvar algo com o teste
 * vencido e o Postgres devolve um RAISE EXCEPTION com texto já escrito para
 * gente ler. Esse texto é a única parte útil da resposta — dizer só "operação
 * bloqueada por uma regra do sistema" deixa a pessoa sem saber que precisa
 * assinar.
 */

const MSG_TESTE =
  "Seu período de teste terminou. Escolha um plano para continuar usando o sistema.";

describe("translateError com erro levantado pelo nosso banco (P0001)", () => {
  it("REGRESSÃO: mostra a mensagem do gatilho, não o genérico do mapa", () => {
    expect(translateError({ code: "P0001", message: MSG_TESTE })).toBe(MSG_TESTE);
  });

  it("vale também para a academia suspensa", () => {
    const msg = "Esta academia está suspensa. Fale com o suporte para reativar o acesso.";
    expect(translateError({ code: "P0001", message: msg })).toBe(msg);
  });

  it("sem mensagem, cai no texto genérico do mapa", () => {
    expect(translateError({ code: "P0001", message: "" })).toBe(
      "Operação bloqueada por uma regra do sistema.",
    );
  });

  it("um texto absurdamente longo não é jogado na cara do usuário", () => {
    const gigante = "x".repeat(500);
    expect(translateError({ code: "P0001", message: gigante })).toBe(
      "Operação bloqueada por uma regra do sistema.",
    );
  });
});

describe("translateError não regrediu nos outros códigos", () => {
  it("continua traduzindo violação de unicidade", () => {
    expect(translateError({ code: "23505", message: "duplicate key value" })).toBe(
      "Já existe um registro com esses dados.",
    );
  });

  it("continua traduzindo permissão negada", () => {
    expect(translateError({ code: "42501", message: "permission denied for table alunos" })).toBe(
      "Você não tem permissão para realizar esta ação.",
    );
  });

  it("continua traduzindo credenciais inválidas do auth", () => {
    expect(translateError({ message: "Invalid login credentials" })).toBe(
      "E-mail ou senha incorretos.",
    );
  });
});
