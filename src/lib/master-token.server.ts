/**
 * Sessão e auditoria do painel mestre. Server-only.
 *
 * Vive separado de master.functions.ts porque usa `node:crypto`. Aquele arquivo
 * exporta apenas server functions, cujo corpo o plugin do TanStack remove do
 * bundle do cliente — o que faz o `crypto` ser eliminado junto pelo
 * tree-shaking. Bastou exportar dali uma função comum (`assertToken`, para o
 * acessos.functions.ts usar) para o `crypto` viajar até o navegador e o build
 * quebrar com «"createHmac" is not exported by "__vite-browser-external"».
 *
 * Regra: importe este módulo com `await import()` DENTRO do handler, nunca no
 * topo de um arquivo que uma rota de cliente alcance. É a mesma convenção de
 * stripe.server.ts, whatsapp.server.ts e evolution.server.ts.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/** Tentativas de login erradas toleradas por IP dentro da janela. */
export const MAX_TENTATIVAS_LOGIN = 5;
export const JANELA_LOGIN_MIN = 15;

/**
 * Chave de assinatura do token de sessão mestre (A6).
 *
 * Antes o HMAC era assinado com a própria MASTER_ADMIN_PASSWORD: a senha virava
 * chave criptográfica, então quem conseguisse um token podia atacá-lo offline
 * para recuperá-la. Agora existe uma chave separada; enquanto ela não for
 * configurada, mantém o comportamento antigo e avisa no log.
 */
function getSecret(): string {
  const dedicada = process.env.MASTER_TOKEN_SECRET;
  if (dedicada) return dedicada;
  const s = process.env.MASTER_ADMIN_PASSWORD;
  if (!s) throw new Error("MASTER_ADMIN_PASSWORD não configurado");
  console.warn(
    "[admin-master] MASTER_TOKEN_SECRET não configurada: o token está sendo " +
      "assinado com a própria senha. Configure uma chave dedicada.",
  );
  return s;
}

/**
 * Compara segredos sem vazar o comprimento.
 *
 * A versão anterior fazia `a.length === b.length && timingSafeEqual(...)`, que
 * responde na hora quando o tamanho difere e entrega o comprimento da senha.
 * Comparar os digests resolve: sempre 32 bytes, sempre o mesmo custo.
 */
export function segredoConfere(recebido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recebido, "utf8").digest();
  const b = createHash("sha256").update(esperado, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function signToken(): string {
  const payload = { exp: Date.now() + TOKEN_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [data, sig] = token.split(".");
  if (!data || !sig) return false;
  try {
    const expected = createHmac("sha256", getSecret()).update(data).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function assertToken(token: string | undefined): void {
  if (!verifyToken(token)) {
    throw new Error("Sessão de admin mestre inválida ou expirada");
  }
}

export function ipDaRequisicao(): string {
  const h = getRequest()?.headers;
  return (
    h?.get("cf-connecting-ip")?.trim() ||
    h?.get("x-real-ip")?.trim() ||
    h?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "desconhecido"
  );
}

/** Registra toda ação do painel mestre — antes nada ficava gravado. */
export async function auditar(acao: string, detalhe: Record<string, unknown> = {}): Promise<void> {
  try {
    await supabaseAdmin.from("system_logs").insert({
      level: "info",
      source: "admin-master",
      message: acao,
      context: { ...detalhe, ip: ipDaRequisicao() },
    });
  } catch {
    /* auditoria nunca derruba a operação */
  }
}
