/**
 * Cron-only endpoint: marca vencidas, garante mensalidades futuras geradas, e dispara
 * avisos via WhatsApp para mensalidades pendentes em D-7, D-3 e D-0.
 * Idempotente (índice único por mensalidade+tipo).
 *
 * Chamado por pg_cron uma vez ao dia. Header `apikey` deve ser igual ao
 * publishable/anon key do projeto.
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
        const { sendWhatsappByTenant, renderTemplate, templateFor, NOTIFICATION_TYPES } =
          await import("@/lib/whatsapp.server");

        // 1) Processa: marca vencidas + gera rolling 3 meses
        const { data: proc, error: procErr } = await supabaseAdmin.rpc("processar_mensalidades_diario" as any);
        if (procErr) console.error("[cron] processar diario", procErr);

        // 2) Datas alvo em America/Sao_Paulo
        const today = new Date();
        const tz = "America/Sao_Paulo";
        const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
        const isoOf = (d: Date) => fmt.format(d);
        const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

        const targets: Array<{ tipo: typeof NOTIFICATION_TYPES[number]; date: string }> = [
          { tipo: "AVISO_7_DIAS",     date: isoOf(addDays(today, 7)) },
          { tipo: "AVISO_3_DIAS",     date: isoOf(addDays(today, 3)) },
          { tipo: "AVISO_VENCIMENTO", date: isoOf(today) },
        ];

        const summary = { scanned: 0, sent: 0, failed: 0, skipped: 0, byType: {} as Record<string, number> };

        for (const { tipo, date } of targets) {
          const { data: mensalidades, error } = await supabaseAdmin
            .from("mensalidades")
            .select(`
              id, tenant_id, valor_final, data_vencimento, status,
              aluno:alunos!inner ( id, nome_completo, telefone, responsavel_telefone ),
              tenant:tenants!inner ( id, nome )
            `)
            .eq("data_vencimento", date)
            .eq("status", "pendente");
          if (error) { console.error("[cron] fetch mensalidades", error); continue; }
          summary.scanned += mensalidades?.length ?? 0;

          for (const m of mensalidades ?? []) {
            const aluno: any = (m as any).aluno;
            const tenant: any = (m as any).tenant;
            const phone = aluno?.telefone || aluno?.responsavel_telefone;

            const { data: existing } = await supabaseAdmin
              .from("notificacoes")
              .select("id")
              .eq("mensalidade_id", m.id)
              .eq("tipo", tipo)
              .maybeSingle();
            if (existing) { summary.skipped++; continue; }

            const { data: cfg } = await supabaseAdmin
              .from("whatsapp_config").select("*")
              .eq("tenant_id", m.tenant_id).maybeSingle();
            const { data: conn } = await supabaseAdmin
              .from("whatsapp_connections").select("connected")
              .eq("tenant_id", m.tenant_id).maybeSingle();

            const venc = new Date(m.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: tz });
            const valor = Number(m.valor_final ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const template = cfg
              ? templateFor(cfg as any, tipo)
              : "Olá {nome}, sua mensalidade na {academia} vence em {vencimento} (R$ {valor}).";
            const mensagem = renderTemplate(template, {
              nome: aluno?.nome_completo ?? "",
              academia: tenant?.nome ?? "",
              vencimento: venc,
              valor,
            });

            let result: { ok: boolean; error?: string; providerMessageId?: string } = {
              ok: false, error: "WhatsApp não conectado",
            };
            if (!phone) {
              result = { ok: false, error: "Aluno sem telefone cadastrado" };
            } else if (!conn || !(conn as any).connected) {
              result = { ok: false, error: "WhatsApp não conectado nesta academia" };
            } else {
              result = await sendWhatsappByTenant(m.tenant_id, phone, mensagem);
            }

            const { error: insErr } = await supabaseAdmin.from("notificacoes").insert({
              tenant_id: m.tenant_id,
              aluno_id: aluno?.id,
              mensalidade_id: m.id,
              tipo,
              canal: "whatsapp",
              destinatario: phone ?? null,
              mensagem,
              status: result.ok ? "enviada" : "falhou",
              enviada_em: result.ok ? new Date().toISOString() : null,
              erro: result.ok ? null : (result.error ?? "Erro desconhecido"),
            } as any);
            if (insErr) {
              if ((insErr as any).code === "23505") { summary.skipped++; continue; }
              console.error("[cron] insert notif", insErr);
              summary.failed++;
              continue;
            }
            if (result.ok) summary.sent++;
            else summary.failed++;
            summary.byType[tipo] = (summary.byType[tipo] ?? 0) + 1;
          }
        }

        return new Response(JSON.stringify({ ok: true, processed: proc, summary, ranAt: new Date().toISOString() }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
