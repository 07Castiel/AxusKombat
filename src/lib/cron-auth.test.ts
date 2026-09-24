import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeCronRequest, internalCronSecret } from "./cron-auth";

/**
 * Autenticação dos hooks de cron (C1 / #21).
 *
 * Estes endpoints disparam envio de WhatsApp para todas as academias. O
 * "segredo" NUNCA pode ser `SUPABASE_PUBLISHABLE_KEY` — o mesmo JWT `role:anon`
 * que o Vite injeta no bundle e que qualquer visitante lê no DevTools.
 *
 * CRON_SECRET é obrigatória: sem ela os hooks respondem 503 e não executam. O
 * teste mais importante é o que garante que a chave anon nunca é aceita, com ou
 * sem CRON_SECRET.
 */

const ANON_FALSA = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.chave-publica";
const SEGREDO = "segredo-dedicado-longo-e-aleatorio";

function req(headers: Record<string, string>): Request {
  return new Request("https://exemplo/api/public/hooks/dispatch-notifications", {
    method: "POST",
    headers,
  });
}

let envOriginal: NodeJS.ProcessEnv;

beforeEach(() => {
  envOriginal = { ...process.env };
});
afterEach(() => {
  process.env = envOriginal;
});

describe("com CRON_SECRET configurada", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SEGREDO;
    process.env.SUPABASE_PUBLISHABLE_KEY = ANON_FALSA;
  });

  it("aceita o segredo em x-cron-secret", () => {
    expect(authorizeCronRequest(req({ "x-cron-secret": SEGREDO })).ok).toBe(true);
  });

  it("aceita o segredo em apikey, por compatibilidade com os jobs já cadastrados", () => {
    expect(authorizeCronRequest(req({ apikey: SEGREDO })).ok).toBe(true);
  });

  it("REGRESSÃO: a chave anon não é aceita", () => {
    // O ponto inteiro do C1. Se este teste ficar verde com a chave anon, o
    // endpoint voltou a ser publico.
    const r = authorizeCronRequest(req({ apikey: ANON_FALSA }));
    expect(r.ok).toBe(false);
  });

  it("recusa segredo errado, vazio e ausente", () => {
    expect(authorizeCronRequest(req({ "x-cron-secret": "errado" })).ok).toBe(false);
    expect(authorizeCronRequest(req({ "x-cron-secret": "" })).ok).toBe(false);
    expect(authorizeCronRequest(req({})).ok).toBe(false);
  });

  it("recusa segredo de tamanho diferente sem estourar", () => {
    // secretsMatch chama timingSafeEqual, que exige buffers do mesmo tamanho.
    // Comprimento diferente precisa devolver false, nao lancar.
    expect(() => authorizeCronRequest(req({ "x-cron-secret": "curto" }))).not.toThrow();
    expect(authorizeCronRequest(req({ "x-cron-secret": SEGREDO + "a" })).ok).toBe(false);
  });

  it("responde 401 em JSON quando recusa", async () => {
    const r = authorizeCronRequest(req({ apikey: "errado" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(401);
    await expect(r.response.json()).resolves.toEqual({ error: "unauthorized" });
  });
});

describe("sem CRON_SECRET — hooks desabilitados", () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET;
    process.env.SUPABASE_PUBLISHABLE_KEY = ANON_FALSA;
  });

  it("REGRESSÃO: a chave anon NÃO destranca o hook", () => {
    // Sem CRON_SECRET não há fallback: a chave anon (pública) nunca abre o hook.
    expect(authorizeCronRequest(req({ apikey: ANON_FALSA })).ok).toBe(false);
    expect(authorizeCronRequest(req({ "x-cron-secret": ANON_FALSA })).ok).toBe(false);
  });

  it("recusa qualquer chamada, com ou sem header", () => {
    expect(authorizeCronRequest(req({ apikey: "qualquer-coisa" })).ok).toBe(false);
    expect(authorizeCronRequest(req({})).ok).toBe(false);
  });

  it("responde 503, sinalizando a configuração faltando", async () => {
    const r = authorizeCronRequest(req({}));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(503);
    await expect(r.response.json()).resolves.toEqual({
      error: "cron_secret_nao_configurado",
    });
  });
});

describe("internalCronSecret", () => {
  it("devolve CRON_SECRET quando existe", () => {
    process.env.CRON_SECRET = SEGREDO;
    process.env.SUPABASE_PUBLISHABLE_KEY = ANON_FALSA;
    expect(internalCronSecret()).toBe(SEGREDO);
  });

  it("nunca cai na chave publicável: string vazia sem CRON_SECRET", () => {
    delete process.env.CRON_SECRET;
    process.env.SUPABASE_PUBLISHABLE_KEY = ANON_FALSA;
    expect(internalCronSecret()).toBe("");
  });

  it("a chamada interna do painel passa na própria verificação quando configurado", () => {
    // runDispatch monta uma requisicao com internalCronSecret(). Se as duas
    // pontas divergirem, o botao "Verificar agora" devolve erro em producao.
    process.env.CRON_SECRET = SEGREDO;
    expect(authorizeCronRequest(req({ "x-cron-secret": internalCronSecret() })).ok).toBe(true);
  });

  it("sem CRON_SECRET, a chamada interna também é recusada (503)", () => {
    delete process.env.CRON_SECRET;
    const r = authorizeCronRequest(req({ "x-cron-secret": internalCronSecret() }));
    expect(r.ok).toBe(false);
  });
});
