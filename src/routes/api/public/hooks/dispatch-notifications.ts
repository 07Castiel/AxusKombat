/**
 * Worker de envio de notificações agendadas.
 * Chamado por pg_cron a cada 15 minutos.
 *
 * Regras:
 *  - envia apenas notificações com status='agendada' e agendada_para<=now()
 *  - respeita janela [hora_inicio, hora_fim] no timezone do tenant
 *  - renderiza template mais adequado (mesmo tipo + dias_offset) por tenant
 */
import { createFileRoute } from "@tanstack/react-router";

const TZ_HOUR_FMT = new Map<string, Intl.DateTimeFormat>();
function currentTimeInTz(tz: string): { hh: number; mm: number } {
  let fmt = TZ_HOUR_FMT.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    });
    TZ_HOUR_FMT.set(tz, fmt);
  }
  const [hh, mm] = fmt.format(new Date()).split(":").map((n) => Number(n));
  return { hh, mm };
}
function parseTime(t: string): { hh: number; mm: number } {
  const [h, m] = t.split(":").map((n) => Number(n));
  return { hh: h, mm: m ?? 0 };
}
function withinWindow(tz: string, start: string, end: string): boolean {
  const now = currentTimeInTz(tz);
  const s = parseTime(start), e = parseTime(end);
  const nowMin = now.hh * 60 + now.mm;
  const sMin = s.hh * 60 + s.mm;
  const eMin = e.hh * 60 + e.mm;
  return nowMin >= sMin && nowMin <= eMin;
}

export const Route = createFileRoute("/api/public/hooks/dispatch-notifications")({
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
        const { sendWhatsappByTenant, renderTemplate } = await import("@/lib/whatsapp.server");

        // fetch a batch of due notifications
        const { data: notifs, error } = await supabaseAdmin
          .from("notificacoes")
          .select(`
            id, tenant_id, aluno_id, mensalidade_id, tipo, dias_offset, agendada_para,
            aluno:alunos!inner ( id, nome_completo, telefone, responsavel_telefone, categoria ),
            mensalidade:mensalidades ( id, data_vencimento, valor_final, valor,
              contrato:contratos ( plano:planos ( nome ) )
            ),
            tenant:tenants!inner ( id, nome )
          `)
          .eq("status", "agendada")
          .lte("agendada_para", new Date().toISOString())
          .limit(500);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        const summary = { scanned: notifs?.length ?? 0, sent: 0, failed: 0, skipped_window: 0, skipped_config: 0 };
        // per-tenant caches
        const settingsCache = new Map<string, any>();
        const templatesCache = new Map<string, any[]>();

        for (const n of (notifs ?? []) as any[]) {
          // settings
          let s = settingsCache.get(n.tenant_id);
          if (!s) {
            const { data } = await supabaseAdmin
              .from("notification_settings").select("*")
              .eq("tenant_id", n.tenant_id).maybeSingle();
            s = data ?? {
              hora_inicio: "08:00", hora_fim: "20:00",
              timezone: "America/Sao_Paulo", pix_chave: null, assinatura: null,
            };
            settingsCache.set(n.tenant_id, s);
          }

          // janela horária — nunca envia fora dela
          if (!withinWindow(s.timezone, s.hora_inicio, s.hora_fim)) {
            summary.skipped_window++;
            continue;
          }

          // template
          let tpls = templatesCache.get(n.tenant_id);
          if (!tpls) {
            const { data } = await supabaseAdmin
              .from("notification_templates").select("*")
              .eq("tenant_id", n.tenant_id).eq("ativo", true);
            tpls = (data ?? []) as any[];
            templatesCache.set(n.tenant_id, tpls);
          }
          const tpl = tpls.find((t) => t.tipo === n.tipo && t.dias_offset === n.dias_offset)
                  ?? tpls.find((t) => t.tipo === n.tipo);
          if (!tpl) {
            await supabaseAdmin.from("notificacoes").update({
              status: "falhou", erro: "Modelo de mensagem não configurado", updated_at: new Date().toISOString(),
            }).eq("id", n.id);
            summary.skipped_config++;
            continue;
          }

          const aluno = n.aluno ?? {};
          const mens = n.mensalidade ?? {};
          const phone = aluno.telefone || aluno.responsavel_telefone;
          const nome = aluno.nome_completo ?? "";
          const primeiroNome = nome.split(" ")[0] ?? nome;
          const venc = mens.data_vencimento
            ? new Date(mens.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: s.timezone })
            : "";
          const valor = Number(mens.valor_final ?? mens.valor ?? 0).toLocaleString("pt-BR",
            { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const diasRestantes = mens.data_vencimento
            ? String(Math.round((new Date(mens.data_vencimento + "T12:00:00").getTime() - Date.now()) / 86400000))
            : "";
          const plano = mens?.contrato?.plano?.nome ?? "";

          const mensagem = renderTemplate(tpl.mensagem, {
            nome, primeiro_nome: primeiroNome,
            academia: n.tenant?.nome ?? "",
            vencimento: venc, valor,
            telefone: phone ?? "",
            modalidade: aluno.categoria ?? "",
            plano,
            pix: s.pix_chave ?? "",
            dias_restantes: diasRestantes,
            professor: "",
            link_pagamento: "",
            assinatura: s.assinatura ?? "",
          });

          if (!phone) {
            await supabaseAdmin.from("notificacoes").update({
              status: "falhou", erro: "Aluno sem telefone cadastrado",
              mensagem, updated_at: new Date().toISOString(),
            }).eq("id", n.id);
            summary.failed++;
            continue;
          }

          const result = await sendWhatsappByTenant(n.tenant_id, phone, mensagem);
          await supabaseAdmin.from("notificacoes").update({
            status: result.ok ? "enviada" : "falhou",
            enviada_em: result.ok ? new Date().toISOString() : null,
            destinatario: phone,
            mensagem,
            erro: result.ok ? null : (result.error ?? "Erro desconhecido"),
            updated_at: new Date().toISOString(),
          }).eq("id", n.id);
          if (result.ok) summary.sent++; else summary.failed++;
        }

        return new Response(JSON.stringify({ ok: true, summary, ranAt: new Date().toISOString() }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
