/**
 * Worker de envio de notificações agendadas.
 * Chamado por pg_cron a cada 15 minutos.
 *
 * Regras:
 *  - envia notificações com status='agendada' e agendada_para<=now()
 *  - reenvia falhas retentáveis cuja proxima_tentativa já venceu
 *  - respeita janela [hora_inicio, hora_fim] no timezone do tenant
 *  - registra cada execução em notification_worker_runs
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  classifyErro, isRetentavel, proximaTentativaISO, MAX_TENTATIVAS,
} from "@/lib/notification-errors";

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

const SELECT_COLS = `
  id, tenant_id, aluno_id, mensalidade_id, tipo, dias_offset, agendada_para, tentativas,
  aluno:alunos!inner ( id, nome_completo, telefone, responsavel_telefone, categoria ),
  mensalidade:mensalidades ( id, data_vencimento, valor_final, valor,
    contrato:contratos ( plano:planos ( nome ) )
  ),
  tenant:tenants!inner ( id, nome )
`;

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

        const startedAt = new Date().toISOString();
        const { data: runRow } = await supabaseAdmin
          .from("notification_worker_runs")
          .insert({ started_at: startedAt })
          .select("id").single();
        const runId = (runRow as any)?.id as string | undefined;

        const nowIso = new Date().toISOString();

        // 1) agendadas devidas
        const { data: agendadas, error } = await supabaseAdmin
          .from("notificacoes")
          .select(SELECT_COLS)
          .eq("status", "agendada")
          .lte("agendada_para", nowIso)
          .limit(400);

        // 2) falhas retentáveis
        const { data: retries } = await supabaseAdmin
          .from("notificacoes")
          .select(SELECT_COLS)
          .eq("status", "falhou")
          .lt("tentativas", MAX_TENTATIVAS)
          .not("proxima_tentativa", "is", null)
          .lte("proxima_tentativa", nowIso)
          .limit(200);

        if (error) {
          if (runId) {
            await supabaseAdmin.from("notification_worker_runs").update({
              finished_at: new Date().toISOString(), erro: error.message,
            }).eq("id", runId);
          }
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        const { filtrarFila } = await import("@/lib/notification-queue");
        const brutas = [...((agendadas ?? []) as any[]), ...((retries ?? []) as any[])];
        // Descarta versões antigas duplicadas; a janela não se aplica aqui
        // (o worker envia o que já venceu), mas a ordem é cronológica.
        const notifs = filtrarFila(brutas, [], { aplicarJanela: false });
        const summary = {
          scanned: notifs.length, sent: 0, failed: 0,
          retried: (retries ?? []).length, skipped_window: 0, skipped_config: 0,
        };

        const settingsCache = new Map<string, any>();
        const templatesCache = new Map<string, any[]>();

        async function marcarFalha(n: any, mensagem: string | null, motivo: string, phone?: string | null) {
          const codigo = classifyErro(motivo);
          const tentativas = (n.tentativas ?? 0) + 1;
          const retentavel = isRetentavel(codigo);
          await supabaseAdmin.from("notificacoes").update({
            status: "falhou",
            erro: motivo,
            erro_codigo: codigo,
            tentativas,
            proxima_tentativa: retentavel ? proximaTentativaISO(tentativas) : null,
            ...(mensagem ? { mensagem } : {}),
            ...(phone ? { destinatario: phone } : {}),
            updated_at: new Date().toISOString(),
          }).eq("id", n.id);
        }

        for (const n of notifs) {
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
            tpls = ((data ?? []) as any[]).sort((a, b) =>
              String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")));
            templatesCache.set(n.tenant_id, tpls);
          }
          // sempre a versão ativa mais recente do modelo
          const tpl = tpls.find((t) => t.tipo === n.tipo && t.dias_offset === n.dias_offset)
                  ?? tpls.find((t) => t.tipo === n.tipo);
          if (!tpl) {
            // modelo inativo/removido: a mensagem não deve ser enviada
            await supabaseAdmin.from("notificacoes").update({
              status: "cancelada",
              motivo_cancelamento: "Modelo de mensagem inativo ou não configurado",
              proxima_tentativa: null,
              updated_at: new Date().toISOString(),
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

          // sempre renderiza com a versão ATUAL do modelo
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
            await marcarFalha(n, mensagem, "Aluno sem telefone cadastrado");
            summary.failed++;
            continue;
          }

          const result = await sendWhatsappByTenant(n.tenant_id, phone, mensagem);
          if (result.ok) {
            await supabaseAdmin.from("notificacoes").update({
              status: "enviada",
              enviada_em: new Date().toISOString(),
              destinatario: phone,
              mensagem,
              erro: null,
              erro_codigo: null,
              proxima_tentativa: null,
              tentativas: (n.tentativas ?? 0) + 1,
              updated_at: new Date().toISOString(),
            }).eq("id", n.id);
            summary.sent++;
          } else {
            await marcarFalha(n, mensagem, result.error ?? "Erro desconhecido", phone);
            summary.failed++;
          }
        }

        if (runId) {
          await supabaseAdmin.from("notification_worker_runs").update({
            finished_at: new Date().toISOString(),
            scanned: summary.scanned,
            sent: summary.sent,
            failed: summary.failed,
            skipped: summary.skipped_window + summary.skipped_config,
          }).eq("id", runId);
        }

        return new Response(JSON.stringify({ ok: true, summary, ranAt: new Date().toISOString() }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
