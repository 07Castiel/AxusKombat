/**
 * Cron-only endpoint: scans matrículas pendentes que vencem em 7, 3 ou 0 dias
 * e dispara avisos via WhatsApp. Idempotente (índice único por matricula+tipo).
 *
 * Chamado por pg_cron uma vez ao dia. Header `apikey` deve ser igual ao
 * publishable/anon key do projeto.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/notify-matriculas")({
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
        const { sendWhatsapp, renderTemplate, templateFor, NOTIFICATION_TYPES } =
          await import("@/lib/whatsapp.server");

        // Compute target dates in São Paulo timezone (matrícula.data_vencimento é date)
        const today = new Date();
        const tz = "America/Sao_Paulo";
        const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
        const isoOf = (d: Date) => fmt.format(d); // YYYY-MM-DD
        const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

        const targets: Array<{ tipo: typeof NOTIFICATION_TYPES[number]; date: string }> = [
          { tipo: "AVISO_7_DIAS",     date: isoOf(addDays(today, 7)) },
          { tipo: "AVISO_3_DIAS",     date: isoOf(addDays(today, 3)) },
          { tipo: "AVISO_VENCIMENTO", date: isoOf(today) },
        ];

        const summary = { scanned: 0, sent: 0, failed: 0, skipped: 0, byType: {} as Record<string, number> };

        for (const { tipo, date } of targets) {
          const { data: matriculas, error } = await supabaseAdmin
            .from("matriculas")
            .select(`
              id, tenant_id, valor_final, data_vencimento, status,
              aluno:alunos!inner ( id, nome_completo, telefone, responsavel_telefone ),
              tenant:tenants!inner ( id, nome )
            `)
            .eq("data_vencimento", date)
            .eq("status", "pendente");
          if (error) {
            console.error("[cron] fetch matriculas error", error);
            continue;
          }
          summary.scanned += matriculas?.length ?? 0;

          for (const m of matriculas ?? []) {
            const aluno: any = (m as any).aluno;
            const tenant: any = (m as any).tenant;
            const phone = aluno?.telefone || aluno?.responsavel_telefone;

            // Skip if already notified (race-safe via unique index, but query keeps log clean)
            const { data: existing } = await supabaseAdmin
              .from("notificacoes")
              .select("id")
              .eq("matricula_id", m.id)
              .eq("tipo", tipo)
              .maybeSingle();
            if (existing) { summary.skipped++; continue; }

            // Load tenant whatsapp config + templates
            const { data: cfg } = await supabaseAdmin
              .from("whatsapp_config")
              .select("*")
              .eq("tenant_id", m.tenant_id)
              .maybeSingle();

            const venc = new Date(m.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: tz });
            const valor = Number(m.valor_final ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const template = cfg
              ? templateFor(cfg as any, tipo)
              : "Olá {nome}, sua matrícula na {academia} vence em {vencimento} (R$ {valor}).";
            const mensagem = renderTemplate(template, {
              nome: aluno?.nome_completo ?? "",
              academia: tenant?.nome ?? "",
              vencimento: venc,
              valor,
            });

            let result: { ok: boolean; error?: string; providerMessageId?: string } = {
              ok: false, error: "Configuração WhatsApp ausente",
            };
            if (cfg && (cfg as any).enabled && phone) {
              result = await sendWhatsapp(cfg as any, phone, mensagem);
            } else if (!phone) {
              result = { ok: false, error: "Aluno sem telefone cadastrado" };
            } else if (!cfg) {
              result = { ok: false, error: "Academia sem configuração de WhatsApp" };
            } else if (!(cfg as any).enabled) {
              result = { ok: false, error: "WhatsApp desativado na academia" };
            }

            // Insert log row — unique index prevents dupes if cron runs twice
            const { error: insErr } = await supabaseAdmin.from("notificacoes").insert({
              tenant_id: m.tenant_id,
              aluno_id: aluno?.id,
              matricula_id: m.id,
              tipo,
              canal: "whatsapp",
              destinatario: phone ?? null,
              mensagem,
              status: result.ok ? "enviada" : "falhou",
              enviada_em: result.ok ? new Date().toISOString() : null,
              erro: result.ok ? null : (result.error ?? "Erro desconhecido"),
            });
            if (insErr) {
              if (insErr.code === "23505") { summary.skipped++; continue; }
              console.error("[cron] insert notif", insErr);
              summary.failed++;
              continue;
            }
            if (result.ok) summary.sent++;
            else summary.failed++;
            summary.byType[tipo] = (summary.byType[tipo] ?? 0) + 1;
          }
        }

        return new Response(JSON.stringify({ ok: true, summary, ranAt: new Date().toISOString() }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
