/**
 * Cron diário: apenas marca vencidas + gera mensalidades futuras (rolling 3 meses).
 * O envio das notificações é feito pelo worker /api/public/hooks/dispatch-notifications,
 * disparado a cada 15 min. Os agendamentos são criados por triggers em `mensalidades`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/notify-mensalidades")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("processar_mensalidades_diario" as any);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, processed: data, ranAt: new Date().toISOString() }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
