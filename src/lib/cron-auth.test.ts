import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeCronRequest, internalCronSecret } from "./cron-auth";

/**
 * Autenticação dos hooks de cron (C1).
 *
 * Estes endpoints disparam envio de WhatsApp para todas as academias. Até a
 * correção, o "segredo" era `SUPABASE_PUBLISHABLE_KEY` — o mesmo JWT `role:anon`
 * que o Vite injeta no bundle e que qualquer visitante lê no DevTools.
 *
 * O teste mais importante deste arquivo é o que garante que a chave anon deixa
 * de ser aceita assim que CRON_SECRET existe. Se alguém, por descuido, fizer a
 * verificação voltar a aceitar as duas, é aqui que aparece.
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

  it("REGRESSÃO: a chave anon deixa de ser aceita", () => {
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

describe("sem CRON_SECRET — modo legado da transição", () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET;
    process.env.SUPABASE_PUBLISHABLE_KEY = ANON_FALSA;
  });

  it("ainda aceita a chave anon, para o cron não parar antes da virada", () => {
    // Comportamento deliberado: o codigo sobe antes de CRON_SECRET existir.
    // Continua vulneravel neste intervalo, e por isso o modulo grita no log.
    expect(authorizeCronRequest(req({ apikey: ANON_FALSA })).ok).toBe(true);
  });

  it("recusa qualquer outro valor", () => {
    expect(authorizeCronRequest(req({ apikey: "qualquer-coisa" })).ok).toBe(false);
  });

  it("recusa tudo quando também não há chave publicável configurada", () => {
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    expect(authorizeCronRequest(req({ apikey: ANON_FALSA })).ok).toBe(false);
    expect(authorizeCronRequest(req({})).ok).toBe(false);
  });
});

describe("internalCronSecret", () => {
  it("prefere CRON_SECRET e cai na chave publicável enquanto ela não existe", () => {
    process.env.CRON_SECRET = SEGREDO;
    process.env.SUPABASE_PUBLISHABLE_KEY = ANON_FALSA;
    expect(internalCronSecret()).toBe(SEGREDO);

    delete process.env.CRON_SECRET;
    expect(internalCronSecret()).toBe(ANON_FALSA);
  });

  it("as chamadas internas do painel passam na própria verificação", () => {
    // runDispatch monta uma requisicao com internalCronSecret(). Se as duas
    // pontas divergirem, o botao "Verificar agora" devolve 401 em producao.
    process.env.CRON_SECRET = SEGREDO;
    expect(authorizeCronRequest(req({ "x-cron-secret": internalCronSecret() })).ok).toBe(true);

    delete process.env.CRON_SECRET;
    process.env.SUPABASE_PUBLISHABLE_KEY = ANON_FALSA;
    expect(authorizeCronRequest(req({ "x-cron-secret": internalCronSecret() })).ok).toBe(true);
  });
});
