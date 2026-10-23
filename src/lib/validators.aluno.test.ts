import { describe, expect, it } from "vitest";
import { alunoSchema } from "./validators";

/**
 * O cadastro so pedia o nome, mas o resto do sistema depende de mais coisa:
 * o Portal do Aluno entra com matricula + data de nascimento, e o acesso chega
 * por WhatsApp, que descarta telefone com menos de 10 digitos. Um aluno salvo
 * sem esses campos ficava com uma matricula que nunca entrava.
 */
const base = {
  nome_completo: "Ana Souza",
  email: "",
  telefone: "(11) 91234-5678",
  data_nascimento: "1995-06-20",
  cpf: "",
  endereco: "",
  categoria: "adulto" as const,
  responsavel_nome: "",
  responsavel_telefone: "",
  contato_emergencia: "",
  observacoes: "",
  observacoes_medicas: "",
  peso: "",
  altura: "",
};

function erroEm(campo: string, dados: Record<string, unknown>) {
  const r = alunoSchema.safeParse(dados);
  expect(r.success).toBe(false);
  if (r.success) return undefined;
  return r.error.issues.find((i) => i.path[0] === campo)?.message;
}

describe("alunoSchema — campos obrigatórios", () => {
  it("aceita o cadastro mínimo: nome, telefone, nascimento e categoria", () => {
    expect(alunoSchema.safeParse(base).success).toBe(true);
  });

  it("exige o nome completo", () => {
    expect(erroEm("nome_completo", { ...base, nome_completo: "   " })).toBe(
      "Nome completo é obrigatório.",
    );
  });

  it("exige a categoria", () => {
    const { categoria: _, ...semCategoria } = base;
    expect(erroEm("categoria", semCategoria)).toBe("Selecione a categoria.");
  });
});

describe("alunoSchema.telefone", () => {
  it("exige o telefone", () => {
    expect(erroEm("telefone", { ...base, telefone: "" })).toBe("Telefone é obrigatório.");
  });

  it("recusa número sem DDD: o WhatsApp não entregaria", () => {
    expect(erroEm("telefone", { ...base, telefone: "91234-5678" })).toBe(
      "Telefone deve ter DDD e número (mínimo 10 dígitos).",
    );
  });

  it("aceita fixo e celular com DDD, com ou sem máscara", () => {
    for (const telefone of ["1133334444", "(11) 3333-4444", "11912345678", "+55 11 91234-5678"]) {
      expect(alunoSchema.safeParse({ ...base, telefone }).success).toBe(true);
    }
  });
});

describe("alunoSchema.data_nascimento", () => {
  it("exige a data de nascimento", () => {
    expect(erroEm("data_nascimento", { ...base, data_nascimento: "" })).toBe(
      "Data de nascimento é obrigatória.",
    );
  });

  it("recusa a data que o login do portal também recusaria", () => {
    for (const data_nascimento of ["1998-02-31", "1850-01-01", "2999-01-01", "ontem"]) {
      expect(erroEm("data_nascimento", { ...base, data_nascimento })).toBe(
        "Data de nascimento inválida.",
      );
    }
  });
});

describe("alunoSchema.responsavel_nome", () => {
  const anosAtras = (anos: number) => `${new Date().getFullYear() - anos}-01-01`;

  it("exige responsável para aluno Kids, mesmo com nascimento de adulto", () => {
    expect(erroEm("responsavel_nome", { ...base, categoria: "kids" })).toBe(
      "Responsável obrigatório para alunos Kids.",
    );
  });

  it("exige responsável para menor de 18 na categoria adulto", () => {
    expect(erroEm("responsavel_nome", { ...base, data_nascimento: anosAtras(16) })).toBe(
      "Responsável obrigatório para menores de 18 anos.",
    );
  });

  it("não aceita só espaços como responsável", () => {
    expect(
      erroEm("responsavel_nome", { ...base, categoria: "kids", responsavel_nome: "   " }),
    ).toBe("Responsável obrigatório para alunos Kids.");
  });

  it("aceita Kids com responsável", () => {
    const r = alunoSchema.safeParse({
      ...base,
      categoria: "kids",
      data_nascimento: anosAtras(8),
      responsavel_nome: "Carla Souza",
    });
    expect(r.success).toBe(true);
  });

  it("não exige responsável de adulto maior de idade", () => {
    expect(alunoSchema.safeParse({ ...base, data_nascimento: anosAtras(30) }).success).toBe(true);
  });
});
