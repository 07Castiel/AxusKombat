import { createFileRoute } from "@tanstack/react-router";

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

async function geoLookup(ip: string | null): Promise<{ country?: string; region?: string; city?: string }> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("::") || ip.startsWith("10.") || ip.startsWith("192.168.")) return {};
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, { headers: { "user-agent": "axus-kombat-tracker" } });
    if (!res.ok) return {};
    const j = (await res.json()) as { country_name?: string; region?: string; city?: string };
    return { country: j.country_name, region: j.region, city: j.city };
  } catch {
    return {};
  }
}

type Payload = {
  user_agent?: string;
  browser?: string;
  operating_system?: string;
  device_type?: string;
  screen_resolution?: string;
  language?: string;
  timezone?: string;
  current_page?: string;
  referrer?: string;
  session_id?: string;
  user_id?: string | null;
};

export const Route = createFileRoute("/api/public/track-visit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        };
        try {
          const body = (await request.json()) as Payload;
          const ip = getIp(request);
          const geo = await geoLookup(ip);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const row = {
            ip_address: ip,
            country: geo.country ?? null,
            region: geo.region ?? null,
            city: geo.city ?? null,
            user_agent: body.user_agent?.slice(0, 1000) ?? null,
            browser: body.browser?.slice(0, 100) ?? null,
            operating_system: body.operating_system?.slice(0, 100) ?? null,
            device_type: body.device_type?.slice(0, 50) ?? null,
            screen_resolution: body.screen_resolution?.slice(0, 50) ?? null,
            language: body.language?.slice(0, 20) ?? null,
            timezone: body.timezone?.slice(0, 100) ?? null,
            current_page: body.current_page?.slice(0, 500) ?? null,
            referrer: body.referrer?.slice(0, 500) ?? null,
            session_id: body.session_id?.slice(0, 100) ?? null,
            is_logged_user: !!body.user_id,
            user_id: body.user_id ?? null,
          };

          const { error } = await supabaseAdmin.from("visitor_logs").insert(row);
          if (error) {
            await supabaseAdmin.from("system_logs").insert({
              level: "error",
              source: "track-visit",
              message: error.message,
              context: { row },
            });
            return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        } catch (e) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("system_logs").insert({
              level: "error",
              source: "track-visit",
              message: e instanceof Error ? e.message : String(e),
            });
          } catch { /* noop */ }
          return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        }
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
    },
  },
});
