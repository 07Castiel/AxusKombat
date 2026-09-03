import { describe, expect, it } from "vitest";
import { flagDeBusca, flagDeBuscaOpcional } from "./utils";

/**
 * Sinalizadores vindos da URL.
 *
 * Este teste existe por causa de uma queda de produção. O TanStack Router faz
 * JSON.parse de cada parâmetro, então `?retomar=true` chega como o booleano
 * `true` e `?trial=1` como o número `1` — nunca como as strings "true" e "1".
 *
 * Os schemas de /precos e /bem-vindo exigiam exatamente essas strings
 * (`z.literal("true")`, `z.string()`). O validateSearch falhava com
 * `invalid_union` e derrubava a rota inteira antes de renderizar: /precos caía
 * toda vez que o app redirecionava por assinatura pendente, e /bem-vindo cairia
 * no retorno do checkout do Stripe.
 *
 * A linha que mais importa aqui é a do booleano `true` — era a forma real que
 * chegava e a única que o código antigo não aceitava.
 */

describe("flagDeBusca", () => {
  it("REGRESSÃO: aceita o booleano true, que é o que o router realmente entrega", () => {
    expect(flagDeBusca(true)).toBe(true);
  });

  it("REGRESSÃO: aceita o número 1, forma que o Stripe devolve em ?trial=1", () => {
    expect(flagDeBusca(1)).toBe(true);
  });

  it("aceita também as formas em texto, caso o parâmetro chegue sem parse", () => {
    expect(flagDeBusca("true")).toBe(true);
    expect(flagDeBusca("1")).toBe(true);
  });

  it("é falso para ausência e para as formas negativas", () => {
    for (const v of [undefined, null, false, 0, "", "false", "0", "qualquer"]) {
      expect(flagDeBusca(v), String(v)).toBe(false);
    }
  });

  it("não explode com tipos inesperados", () => {
    for (const v of [{}, [], NaN, () => {}]) {
      expect(() => flagDeBusca(v)).not.toThrow();
      expect(flagDeBusca(v)).toBe(false);
    }
  });
});

/**
 * O par do flagDeBusca para validateSearch.
 *
 * Devolver `false` não era neutro: o TanStack Router escreve de volta na URL
 * tudo que o schema devolve, então /precos redirecionava (307) para
 * /precos?expirado=false a cada visita, e /bem-vindo mostrava ?trial=false para
 * quem tinha acabado de começar o teste.
 */
describe("flagDeBuscaOpcional", () => {
  it("devolve true nas mesmas formas que flagDeBusca aceita", () => {
    for (const v of [true, 1, "true", "1"]) {
      expect(flagDeBuscaOpcional(v), String(v)).toBe(true);
    }
  });

  it("REGRESSÃO: devolve undefined em vez de false, para o parâmetro sumir da URL", () => {
    for (const v of [undefined, null, false, 0, "", "false", "0", "qualquer"]) {
      expect(flagDeBuscaOpcional(v), String(v)).toBeUndefined();
    }
  });
});
