import { describe, expect, it } from "vitest";
import {
  lerPermissoes,
  podeEditar,
  podeVer,
  PERMISSION_MODULES,
  ROLE_PRESETS,
  STAFF_ROLES,
} from "./permissoes";

/**
 * Permissões por módulo (A7).
 *
 * Dois invariantes sustentam a decisão de aplicar isto sem tocar em nenhuma
 * policy, e cada um tem teste:
 *
 *  1. MÓDULO AUSENTE = LIBERADO. `permissions` nasce `{}` e quase todo perfil
 *     está assim. Se a ausência passar a valer como negação, o primeiro deploy
 *     tranca todo mundo para fora do sistema.
 *  2. Permissão só RESTRINGE. Nada aqui pode devolver `true` onde o papel diz
 *     não — o RLS continua sendo o piso.
 */

describe("lerPermissoes — normaliza o JSONB do banco", () => {
  it("devolve vazio para os formatos que o banco pode entregar", () => {
    for (const entrada of [null, undefined, {}, [], "texto", 42, true]) {
      expect(lerPermissoes(entrada)).toEqual({});
    }
  });

  it("ignora chave que não é módulo conhecido", () => {
    expect(lerPermissoes({ inventado: { ver: false, editar: false } })).toEqual({});
  });

  it("lê os módulos válidos preservando as marcações", () => {
    const lido = lerPermissoes({
      alunos: { ver: true, editar: false },
      pagamentos: { ver: false, editar: false },
    });
    expect(lido.alunos).toEqual({ ver: true, editar: false });
    expect(lido.pagamentos).toEqual({ ver: false, editar: false });
    expect(lido.relatorios).toBeUndefined();
  });

  it("só `false` explícito restringe — valor faltando conta como liberado", () => {
    const lido = lerPermissoes({ alunos: {} });
    expect(lido.alunos).toEqual({ ver: true, editar: true });
  });
});

describe("INVARIANTE 1 — módulo ausente é liberado", () => {
  it("mapa vazio libera ver e editar em todos os módulos", () => {
    // O estado real da esmagadora maioria dos perfis hoje. Se este teste
    // quebrar, o proximo deploy tranca todo mundo para fora.
    for (const modulo of PERMISSION_MODULES) {
      expect(podeVer({}, modulo)).toBe(true);
      expect(podeEditar({}, modulo)).toBe(true);
    }
  });

  it("um módulo restrito não afeta os outros", () => {
    const perms = lerPermissoes({ pagamentos: { ver: false, editar: false } });
    expect(podeVer(perms, "pagamentos")).toBe(false);
    expect(podeVer(perms, "alunos")).toBe(true);
    expect(podeEditar(perms, "alunos")).toBe(true);
  });
});

describe("INVARIANTE 2 — permissão só restringe", () => {
  it("quem não pode ver também não pode editar", () => {
    const perms = lerPermissoes({ alunos: { ver: false, editar: true } });
    expect(podeVer(perms, "alunos")).toBe(false);
    // Combinacao incoerente vinda do banco nao pode virar permissao de escrita.
    expect(podeEditar(perms, "alunos")).toBe(false);
  });

  it("ver liberado com editar negado permite consultar, não alterar", () => {
    const perms = lerPermissoes({ pagamentos: { ver: true, editar: false } });
    expect(podeVer(perms, "pagamentos")).toBe(true);
    expect(podeEditar(perms, "pagamentos")).toBe(false);
  });
});

describe("presets de papel", () => {
  it("todo papel tem preset e todo preset cobre todos os módulos", () => {
    for (const papel of STAFF_ROLES) {
      const preset = ROLE_PRESETS[papel];
      expect(preset, `preset ausente para ${papel}`).toBeDefined();
      for (const modulo of PERMISSION_MODULES) {
        expect(preset[modulo], `${papel} sem ${modulo}`).toBeDefined();
      }
    }
  });

  it("admin tem tudo liberado", () => {
    for (const modulo of PERMISSION_MODULES) {
      expect(ROLE_PRESETS.admin[modulo]).toEqual({ ver: true, editar: true });
    }
  });

  it("presets passam por lerPermissoes sem perder informação", () => {
    // A tela Equipe grava o preset direto no banco; ele precisa sobreviver
    // a ida e volta.
    for (const papel of STAFF_ROLES) {
      expect(lerPermissoes(ROLE_PRESETS[papel])).toEqual(ROLE_PRESETS[papel]);
    }
  });
});
