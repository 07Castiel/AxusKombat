import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Registro de visita (M2).
 *
 * Antes: sem autenticação, `Access-Control-Allow-Origin: *`, sem limite de
 * chamadas, gravando com a chave de serviço e disparando um fetch externo para
 * a ipapi.co a cada requisição. Um laço de curl enchia a tabela e queimava a
 * cota de geolocalização. `user_id` vinha do cliente sem validação nenhuma.
 *
 * Agora: corpo validado, origem restrita, teto por IP e cache de geolocalização.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const payloadSchema = z.object({
  user_agent: z.string().max(1000).optional(),
  browser: z.string().max(100).optional(),
  operating_system: z.string().max(100).optional(),
  device_type: z.string().max(50).optional(),
  screen_resolution: z.string().max(50).optional(),
  language: z.string().max(20).optional(),
  timezone: z.string().max(100).optional(),
  current_page: z.string().max(500).optional(),
  referrer: z.string().max(500).nullable().optional(),
  session_id: z.string().max(100).optional(),
  // Só aceita UUID. Antes qualquer string entrava e ia direto para uma coluna
  // uuid, o que virava erro de banco gravado em system_logs a cada chamada.
  user_id: z.string().regex(UUID_RE).nullable().optional(),
});

const CORPO_MAXIMO = 8 * 1024;

// ---- Teto por IP -----------------------------------------------------------
// Memória do isolate: some quando o Worker recicla e não é compartilhada entre
// instâncias. Não é uma trava forte, mas corta o laço trivial de abuso sem
// exigir infraestrutura. Telemetria não justifica mais que isso.
const JANELA_MS = 60_000;
const MAX_POR_JANELA = 20;
const chamadas = new Map<string, { n: number; ate: number }>();

function excedeuLimite(ip: string): boolean {
  const agora = Date.now();
  const atual = chamadas.get(ip);
  if (!atual || agora > atual.ate) {
    chamadas.set(ip, { n: 1, ate: agora + JANELA_MS });
    if (chamadas.size > 5000) {
      for (const [k, v] of chamadas) if (agora > v.ate) chamadas.delete(k);
    }
    return false;
  }
  atual.n += 1;
  return atual.n > MAX_POR_JANELA;
}

// ---- Geolocalização com cache ---------------------------------------------
const GEO_TTL_MS = 24 * 60 * 60 * 1000;
const geoCache = new Map<string, { v: Geo; ate: number }>();
type Geo = { country?: string; region?: string; city?: string };

function getIp(request: Request): string | null {
  const h = request.headers;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return null;
}

function ipPrivado(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip.startsWith("::") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

async function geoLookup(ip: string | null): Promise<Geo> {
  if (!ip || ipPrivado(ip)) return {};
  const agora = Date.now();
  const emCache = geoCache.get(ip);
  if (emCache && agora < emCache.ate) return emCache.v;
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { "user-agent": "axus-kombat-tracker" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return {};
    const j = (await res.json()) as { country_name?: string; region?: string; city?: string };
    const v: Geo = { country: j.country_name, region: j.region, city: j.city };
    if (geoCache.size > 5000) {
      for (const [k, c] of geoCache) if (agora > c.ate) geoCache.delete(k);
    }
    geoCache.set(ip, { v, ate: agora + GEO_TTL_MS });
    return v;
  } catch {
    return {};
  }
}

/**
 * Origem permitida. O rastreador roda na mesma origem, então o normal é não
 * precisar de CORS. APP_URL libera a landing quando ela estiver fora do app.
 */
function corsHeaders(request: Request): Record<string, string> {
  const origem = request.headers.get("origin");
  if (!origem) return {};
  const permitidas = [process.env.APP_URL, new URL(request.url).origin]
    .filter(Boolean)
    .map((o) => (o as string).replace(/\/$/, ""));
  if (!permitidas.includes(origem.replace(/\/$/, ""))) return {};
  return {
    "Access-Control-Allow-Origin": origem,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export const Route = createFileRoute("/api/public/track-visit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cors = corsHeaders(request);
        const responder = (ok: boolean, status = 200) =>
          new Response(JSON.stringify({ ok }), {
            status,
            headers: { "Content-Type": "application/json", ...cors },
          });

        const ip = getIp(request);
        if (ip && excedeuLimite(ip)) return responder(false, 429);

        try {
          const bruto = await request.text();
          if (bruto.length > CORPO_MAXIMO) return responder(false, 413);

          const parsed = payloadSchema.safeParse(JSON.parse(bruto));
          // Telemetria não vale um erro na cara do usuário: descarta em silêncio.
          if (!parsed.success) return responder(true);
          const body = parsed.data;

          const geo = await geoLookup(ip);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { error } = await supabaseAdmin.from("visitor_logs").insert({
            ip_address: ip,
            country: geo.country ?? null,
            region: geo.region ?? null,
            city: geo.city ?? null,
            user_agent: body.user_agent ?? null,
            browser: body.browser ?? null,
            operating_system: body.operating_system ?? null,
            device_type: body.device_type ?? null,
            screen_resolution: body.screen_resolution ?? null,
            language: body.language ?? null,
            timezone: body.timezone ?? null,
            current_page: body.current_page ?? null,
            referrer: body.referrer ?? null,
            session_id: body.session_id ?? null,
            is_logged_user: !!body.user_id,
            user_id: body.user_id ?? null,
          });
          if (error) {
            // Sem `context: { row }`: a linha carrega IP e página, e system_logs
            // é lido por outras telas. Guardar só o código já basta para depurar.
            await supabaseAdmin.from("system_logs").insert({
              level: "error",
              source: "track-visit",
              message: error.message,
              context: { code: (error as { code?: string }).code ?? null },
            });
            return responder(false);
          }
          return responder(true);
        } catch {
          return responder(false);
        }
      },

      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
    },
  },
});
