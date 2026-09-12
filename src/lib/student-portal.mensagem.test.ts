import { describe, it, expect } from "vitest";
import { mensagemAcessoPortal } from "./student-portal.mensagem";
import { variarTexto } from "./antiban";

const dados = {
  nome: "Maria Aparecida de Assunção",
  academia: "CT Aquiles",
  matricula: "482739",
  url: "https://ctaquiles.lovable.app/portal",
};

describe("recado que entrega a matrícula", () => {
  it("trata o aluno pelo primeiro nome", () => {
    expect(mensagemAcessoPortal(dados)).toMatch(/^Maria, /);
  });

  it("leva a matrícula e o endereço do portal", () => {
    const texto = mensagemAcessoPortal(dados);
    expect(texto).toContain("482739");
    expect(texto).toContain("https://ctaquiles.lovable.app/portal");
  });

  it("diz que precisa da data de nascimento para entrar", () => {
    expect(mensagemAcessoPortal(dados)).toContain("data de nascimento");
  });

  it("avisa que o número é pessoal", () => {
    expect(mensagemAcessoPortal(dados)).toMatch(/não repasse/i);
  });

  it("não começa com saudação, para o antiban poder variar a abertura", () => {
    // O worker só prefixa saudação quando o texto ainda não tem uma. Se este
    // recado começasse com "Olá", as 59 mensagens sairiam com a mesma abertura.
    const texto = mensagemAcessoPortal(dados);
    expect(texto).not.toMatch(/^\s*(ol[áa]|oi|bom dia|boa tarde|boa noite)/i);
    const variacoes = new Set(
      Array.from({ length: 40 }, (_, i) => variarTexto(texto, `notificacao-${i}`)),
    );
    expect(variacoes.size).toBeGreaterThan(1);
  });

  it("é curto o bastante para o antiban ainda acrescentar o fecho", () => {
    // variarTexto corta o fechamento acima de 400 caracteres.
    expect(mensagemAcessoPortal(dados).length).toBeLessThan(400);
  });

  it("aguenta nome de uma palavra só", () => {
    expect(mensagemAcessoPortal({ ...dados, nome: "Aquiles" })).toMatch(/^Aquiles, /);
  });
});
