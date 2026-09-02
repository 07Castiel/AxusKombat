import { describe, expect, it } from "vitest";
import {
  MSG_EXPIRADA,
  MSG_SUSPENSA,
  lerSituacaoTenant,
  mensagemBloqueio,
  trialValido,
} from "./subscription";

/**
 * Regra de acesso depois de separar o teste gratuito do Stripe.
 *
 * O bug que originou isso: a conta nova nascia `pending` e o app tratava
 * "sem assinatura" como "sem acesso", empurrando o usuário para a tela de
 * pagamento — de onde não se saía. A condição correta é "teste vencido E sem
 * assinatura ativa"; enquanto o teste vale, a conta opera normalmente sem
 * nenhum dado de pagamento.
 */

const DIA = 86_400_000;
const daquiA = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

/** supabase de mentira: devolve o perfil e o tenant pedidos por lerSituacaoTenant. */
function fakeSupabase(tenant: Record<string, unknown> | null, tenantId = "t1") {
  return {
    from(tabela: string) {
      const linha =
        tabela === "profiles" ? { tenant_id: tenantId } : tenant && { id: tenantId, ...tenant };
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: linha ?? null, error: null }) }),
        }),
      };
    },
  };
}

const situacaoDe = (tenant: Record<string, unknown>) =>
  lerSituacaoTenant({ supabase: fakeSupabase(tenant), userId: "u1" });

describe("trialValido", () => {
  it("vale enquanto a data de término não passou", () => {
    expect(trialValido("trialing", daquiA(14))).toBe(true);
  });

  it("deixa de valer no dia seguinte ao fim", () => {
    expect(trialValido("trialing", daquiA(-1))).toBe(false);
  });

  it("não se aplica a quem não está em teste", () => {
    expect(trialValido("active", daquiA(-30))).toBe(true);
    expect(trialValido("past_due", daquiA(-30))).toBe(true);
  });
});

describe("lerSituacaoTenant", () => {
  it("libera a conta recém-criada, em teste e sem nada do Stripe", async () => {
    const s = await situacaoDe({
      status: "trialing",
      ativo: true,
      trial_ends_at: daquiA(14),
      stripe_customer_id: null,
      stripe_subscription_id: null,
    });
    expect(s.liberado).toBe(true);
  });

  it("bloqueia quando o teste venceu sem assinatura", async () => {
    const s = await situacaoDe({ status: "trialing", ativo: true, trial_ends_at: daquiA(-1) });
    expect(s.liberado).toBe(false);
    expect(mensagemBloqueio(s)).toBe(MSG_EXPIRADA);
  });

  it("libera assinante ativo, mesmo com a data do teste no passado", async () => {
    const s = await situacaoDe({ status: "active", ativo: true, trial_ends_at: daquiA(-30) });
    expect(s.liberado).toBe(true);
  });

  it("libera quem está com pagamento atrasado — cobrança não é bloqueio imediato", async () => {
    const s = await situacaoDe({ status: "past_due", ativo: true, trial_ends_at: null });
    expect(s.liberado).toBe(true);
  });

  it("bloqueia os estados terminais do novo vocabulário", async () => {
    for (const status of ["expired", "canceled"]) {
      const s = await situacaoDe({ status, ativo: true, trial_ends_at: daquiA(-1) });
      expect(s.liberado, status).toBe(false);
    }
  });

  it("academia suspensa é bloqueio à parte, com mensagem própria", async () => {
    const s = await situacaoDe({ status: "active", ativo: false, trial_ends_at: null });
    expect(s.liberado).toBe(false);
    expect(mensagemBloqueio(s)).toBe(MSG_SUSPENSA);
  });

  it("erro de leitura não vira 'teste vencido' — lança, para não bloquear por engano", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "timeout" } }),
          }),
        }),
      }),
    };
    await expect(lerSituacaoTenant({ supabase, userId: "u1" })).rejects.toThrow(/timeout/);
  });
});
