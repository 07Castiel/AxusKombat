/**
 * Cron diário: apenas marca vencidas + gera mensalidades futuras (rolling 3 meses).
 * O envio das notificações é feito pelo worker /api/public/hooks/dispatch-notifications,
 * disparado a cada 15 min. Os agendamentos são criados por triggers em `mensalidades`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const Route = createFileRoute("/api/public/hooks/notify-mensalidades")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = authorizeCronRequest(request);
        if (!auth.ok) return auth.response;
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
