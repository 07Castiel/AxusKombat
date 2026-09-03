import { describe, expect, it } from "vitest";
import { diasRestantesDeTeste, tenantLiberado } from "./acesso-tenant";

/**
 * A regra de acesso agora tem um dono só, e é este arquivo que o cliente e o
 * servidor importam. O par no banco é public.tenant_liberado().
 *
 * A divergência que motivou isso: o banco tratava trial sem data como vencido
 * enquanto cliente e servidor liberavam — a conta navegava normal e estourava
 * exceção em toda escrita.
 */

const DIA = 86_400_000;
const daquiA = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

describe("tenantLiberado", () => {
  it("libera teste dentro do prazo", () => {
    expect(tenantLiberado({ status: "trialing", ativo: true, trialEndsAt: daquiA(3) })).toBe(true);
  });

  it("bloqueia teste vencido", () => {
    expect(tenantLiberado({ status: "trialing", ativo: true, trialEndsAt: daquiA(-1) })).toBe(
      false,
    );
  });

  it("REGRESSÃO: teste sem data conta como válido — a mesma leitura do banco", () => {
    expect(tenantLiberado({ status: "trialing", ativo: true, trialEndsAt: null })).toBe(true);
  });

  it("libera assinatura ativa e pagamento atrasado", () => {
    for (const status of ["active", "past_due"]) {
      expect(tenantLiberado({ status, ativo: true, trialEndsAt: daquiA(-99) }), status).toBe(true);
    }
  });

  it("bloqueia os estados terminais", () => {
    for (const status of ["expired", "canceled"]) {
      expect(tenantLiberado({ status, ativo: true, trialEndsAt: null }), status).toBe(false);
    }
  });

  it("academia suspensa é bloqueio, mesmo com assinatura em dia", () => {
    expect(tenantLiberado({ status: "active", ativo: false, trialEndsAt: null })).toBe(false);
  });
});

describe("diasRestantesDeTeste", () => {
  it("no último dia mostra 1, não 0 — arredonda para cima", () => {
    expect(diasRestantesDeTeste(new Date(Date.now() + DIA / 2).toISOString())).toBe(1);
  });

  it("conta os dias de um teste recém-criado", () => {
    expect(diasRestantesDeTeste(daquiA(14))).toBe(14);
  });

  it("fica negativo depois de vencer", () => {
    expect(diasRestantesDeTeste(daquiA(-2))).toBeLessThan(0);
  });

  it("sem data, não há contagem", () => {
    expect(diasRestantesDeTeste(null)).toBeNull();
  });
});
