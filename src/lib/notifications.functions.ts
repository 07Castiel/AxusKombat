import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getTenantAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles, error } = await ctx.supabase
    .from("user_roles").select("role, tenant_id").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const admin = (roles ?? []).find((r: any) => r.role === "admin");
  if (!admin) throw new Error("Apenas administradores podem acessar esta área");
  return admin.tenant_id as string;
}

// ============ SETTINGS ============
export const getNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const supabase = (context as any).supabase;
    const { data, error } = await supabase
      .from("notification_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
    // cria default se ausente
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: e2 } = await supabaseAdmin
      .from("notification_settings").insert({ tenant_id: tenantId }).select().single();
    if (e2) throw new Error(e2.message);
    return created;
  });

export const saveNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    dias_antes_lembrete: z.array(z.number().int().min(1).max(30)).max(5),
    enviar_no_vencimento: z.boolean(),
    dias_apos_vencimento: z.array(z.number().int().min(1).max(30)).max(5),
    hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
    hora_fim: z.string().regex(/^\d{2}:\d{2}$/),
    hora_preferencial: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().min(3).max(64),
    pix_chave: z.string().max(200).nullable().optional(),
    assinatura: z.string().max(500).nullable().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("notification_settings")
      .upsert({ tenant_id: tenantId, ...data }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);

    // reagendar tudo pendente do tenant após mudança de settings
    const { data: mens } = await supabaseAdmin.from("mensalidades")
      .select("id").eq("tenant_id", tenantId).eq("status", "pendente")
      .gte("data_vencimento", new Date().toISOString().slice(0, 10));
    for (const m of (mens ?? []) as any[]) {
      await supabaseAdmin.rpc("cancelar_notificacoes_mensalidade", {
        p_mensalidade_id: m.id,
        p_motivo: "Configurações de notificação atualizadas.",
      });
      await supabaseAdmin.rpc("agendar_notificacoes_mensalidade", { p_mensalidade_id: m.id });
    }
    return { ok: true, reagendadas: (mens ?? []).length };
  });

// ============ TEMPLATES ============
export const listTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { data, error } = await (context as any).supabase
      .from("notification_templates").select("*")
      .eq("tenant_id", tenantId)
      .order("tipo").order("dias_offset");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    id: z.string().uuid().optional().nullable(),
    tipo: z.enum(["lembrete", "vencimento", "atraso", "boas_vindas", "manual"]),
    dias_offset: z.number().int().min(-30).max(30),
    mensagem: z.string().min(5).max(2000),
    ativo: z.boolean().default(true),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const campos = {
      tipo: data.tipo,
      dias_offset: data.dias_offset,
      mensagem: data.mensagem,
      ativo: data.ativo,
    };

    // Garante uma única versão por tipo + deslocamento: descarta a versão antiga.
    let del = supabaseAdmin.from("notification_templates")
      .delete().eq("tenant_id", tenantId)
      .eq("tipo", data.tipo).eq("dias_offset", data.dias_offset);
    if (data.id) del = del.neq("id", data.id);
    await del;

    if (data.id) {
      const { error } = await supabaseAdmin.from("notification_templates")
        .update(campos).eq("id", data.id).eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("notification_templates")
        .insert({ tenant_id: tenantId, ...campos });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("notification_templates")
      .delete().eq("id", data.id).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ HISTÓRICO ============
export const listNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    aluno_id: z.string().uuid().optional().nullable(),
    status: z.enum(["agendada", "enviada", "falhou", "cancelada"]).optional().nullable(),
    tipo: z.string().optional().nullable(),
    from: z.string().optional().nullable(),
    to: z.string().optional().nullable(),
    limit: z.number().min(1).max(500).default(200),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantAdmin(context as any);
    let q = (context as any).supabase
      .from("notificacoes")
      .select(`
        id, tipo, canal, destinatario, mensagem, status, dias_offset,
        agendada_para, enviada_em, erro, erro_codigo, tentativas, proxima_tentativa,
        motivo_cancelamento, created_at,
        mensalidade_id, aluno:alunos ( id, nome_completo )
      `)
      .eq("tenant_id", tenantId)
      .order("agendada_para", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.aluno_id) q = q.eq("aluno_id", data.aluno_id);
    if (data.status) q = q.eq("status", data.status);
    if (data.tipo) q = q.eq("tipo", data.tipo);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const all = (rows ?? []) as any[];

    // Fila (agendadas): só modelos ativos, janela de hoje até +1 mês,
    // sem versões antigas duplicadas e em ordem cronológica crescente.
    const pendentes = all.filter((r) => r.status === "agendada");
    const restantes = all.filter((r) => r.status !== "agendada");
    if (pendentes.length === 0) return all;

    const { filtrarFila } = await import("@/lib/notification-queue");
    const { data: tpls } = await (context as any).supabase
      .from("notification_templates")
      .select("tipo, dias_offset, ativo")
      .eq("tenant_id", tenantId);
    const fila = filtrarFila(pendentes, (tpls ?? []) as any[]);
    return [...fila, ...restantes];
  });


export const resendNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ notification_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWhatsappByTenant } = await import("@/lib/whatsapp.server");

    const { data: n, error } = await supabaseAdmin
      .from("notificacoes").select("*").eq("id", data.notification_id).maybeSingle();
    if (error || !n) throw new Error("Notificação não encontrada");
    if ((n as any).tenant_id !== tenantId) throw new Error("Não autorizado");
    if (!(n as any).destinatario) throw new Error("Notificação sem telefone destinatário");

    const r = await sendWhatsappByTenant(tenantId, (n as any).destinatario, (n as any).mensagem);
    const { classifyErro } = await import("@/lib/notification-errors");
    await supabaseAdmin.from("notificacoes").update({
      status: r.ok ? "enviada" : "falhou",
      enviada_em: r.ok ? new Date().toISOString() : (n as any).enviada_em,
      erro: r.ok ? null : (r.error ?? "Erro desconhecido"),
      erro_codigo: r.ok ? null : classifyErro(r.error),
      proxima_tentativa: null,
      tentativas: ((n as any).tentativas ?? 0) + 1,
    }).eq("id", (n as any).id);
    return { ok: r.ok, error: r.error };
  });

// ============ REENVIAR TODAS AS FALHAS ============
export const retryAllFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("notificacoes")
      .update({ tentativas: 0, proxima_tentativa: new Date().toISOString() })
      .eq("tenant_id", tenantId).eq("status", "falhou");
    if (error) throw new Error(error.message);
    const { runDispatch } = await import("@/lib/notifications-dispatch.server");
    return await runDispatch();
  });

// ============ DESCARTAR TODAS AS FALHAS (não enviar) ============
/** Remove definitivamente as mensagens com falha: não serão reenviadas nem exibidas. */
export const discardAllFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("notificacoes")
      .delete().eq("tenant_id", tenantId).eq("status", "falhou").select("id");
    if (error) throw new Error(error.message);
    return { total: data?.length ?? 0 };
  });

// ============ LIMPEZA: INATIVAS + JANELA DE 1 MÊS ============
/**
 * Remove mensagens inativas (canceladas) e mensagens agendadas para além de
 * exatamente 1 mês à frente, mantendo o sistema apenas com o próximo mês.
 */
async function limparNotificacoesTenant(tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { janelaFim } = await import("@/lib/notification-queue");
  const fim = janelaFim(new Date()).toISOString();

  const { data: inativas } = await supabaseAdmin.from("notificacoes")
    .delete().eq("tenant_id", tenantId).eq("status", "cancelada").select("id");

  const { data: fora } = await supabaseAdmin.from("notificacoes")
    .delete().eq("tenant_id", tenantId).eq("status", "agendada")
    .gt("agendada_para", fim).select("id");

  return { inativas: inativas?.length ?? 0, fora_da_janela: fora?.length ?? 0 };
}

export const limparNotificacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    return await limparNotificacoesTenant(tenantId);
  });


// ============ PENDENTES APÓS RECONEXÃO (decisão do usuário) ============
/** Mensagens que falharam enquanto o WhatsApp esteve desconectado. */
export const countPendingAfterReconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { count, error } = await (context as any).supabase
      .from("notificacoes").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("status", "falhou")
      .eq("erro_codigo", "whatsapp_desconectado");
    if (error) throw new Error(error.message);
    return { total: count ?? 0 };
  });

/**
 * Reenvia, na ordem original, as mensagens que falharam durante a desconexão.
 * As linhas são "reivindicadas" antes do envio (erro_codigo -> 'reenviando'),
 * evitando duplicidade se a reconexão disparar mais de uma vez.
 */
export const resendPendingAfterReconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWhatsappByTenant } = await import("@/lib/whatsapp.server");
    const { classifyErro } = await import("@/lib/notification-errors");

    const { data: claimed, error } = await supabaseAdmin.from("notificacoes")
      .update({ erro_codigo: "reenviando", proxima_tentativa: null })
      .eq("tenant_id", tenantId).eq("status", "falhou")
      .eq("erro_codigo", "whatsapp_desconectado")
      .select("id, destinatario, mensagem, tentativas, agendada_para, created_at");
    if (error) throw new Error(error.message);

    const rows = ((claimed ?? []) as any[]).sort((a, b) =>
      String(a.agendada_para ?? a.created_at).localeCompare(String(b.agendada_para ?? b.created_at)),
    );

    let enviadas = 0, falhas = 0;
    for (const n of rows) {
      if (!n.destinatario) {
        falhas++;
        await supabaseAdmin.from("notificacoes").update({
          status: "falhou", erro: "Aluno sem telefone", erro_codigo: "sem_telefone",
          proxima_tentativa: null,
        }).eq("id", n.id);
        continue;
      }
      const r = await sendWhatsappByTenant(tenantId, n.destinatario, n.mensagem);
      if (r.ok) enviadas++; else falhas++;
      await supabaseAdmin.from("notificacoes").update({
        status: r.ok ? "enviada" : "falhou",
        enviada_em: r.ok ? new Date().toISOString() : null,
        erro: r.ok ? null : (r.error ?? "Erro desconhecido"),
        erro_codigo: r.ok ? null : classifyErro(r.error),
        tentativas: (n.tentativas ?? 0) + 1,
        proxima_tentativa: null,
      }).eq("id", n.id);
    }
    return { total: rows.length, enviadas, falhas };
  });

/** Descarta as mensagens pendentes: não serão reenviadas. */
export const discardPendingAfterReconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("notificacoes")
      .update({
        status: "cancelada",
        motivo_cancelamento: "Não reenviada após a reconexão do WhatsApp (decisão do usuário).",
        proxima_tentativa: null,
      })
      .eq("tenant_id", tenantId).eq("status", "falhou")
      .eq("erro_codigo", "whatsapp_desconectado")
      .select("id");
    if (error) throw new Error(error.message);
    return { total: data?.length ?? 0 };
  });

// ============ STATUS DO SERVIÇO ============
export const getNotificationsHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const supabase = (context as any).supabase;

    const { data: lastRun } = await supabase
      .from("notification_worker_runs")
      .select("started_at, finished_at, sent, failed, scanned, erro")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();

    const nowIso = new Date().toISOString();
    const [agendadas, atrasadas, falhas, conn] = await Promise.all([
      supabase.from("notificacoes").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("status", "agendada"),
      supabase.from("notificacoes").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("status", "agendada").lte("agendada_para", nowIso),
      supabase.from("notificacoes")
        .select("id, erro, erro_codigo, proxima_tentativa, tentativas")
        .eq("tenant_id", tenantId).eq("status", "falhou").limit(500),
      supabase.from("whatsapp_connections").select("connected, status, phone_number")
        .eq("tenant_id", tenantId).maybeSingle(),
    ]);

    const falhasRows = (falhas.data ?? []) as any[];
    const porMotivo = new Map<string, number>();
    for (const f of falhasRows) {
      const k = f.erro_codigo ?? "desconhecido";
      porMotivo.set(k, (porMotivo.get(k) ?? 0) + 1);
    }

    const lastStarted = (lastRun as any)?.started_at as string | undefined;
    const minutosDesdeUltima = lastStarted
      ? Math.round((Date.now() - new Date(lastStarted).getTime()) / 60000)
      : null;

    const whatsappConectado = !!(conn.data as any)?.connected;
    const workerAtivo = minutosDesdeUltima !== null && minutosDesdeUltima <= 30;
    const estado: "ativo" | "instavel" | "inativo" =
      !workerAtivo ? "inativo" : (!whatsappConectado || falhasRows.length > 0) ? "instavel" : "ativo";

    return {
      estado,
      worker_ativo: workerAtivo,
      ultima_execucao: lastStarted ?? null,
      minutos_desde_ultima: minutosDesdeUltima,
      ultimo_erro: (lastRun as any)?.erro ?? null,
      whatsapp: {
        conectado: whatsappConectado,
        status: (conn.data as any)?.status ?? "desconectado",
        phone_number: (conn.data as any)?.phone_number ?? null,
      },
      fila: {
        agendadas: agendadas.count ?? 0,
        atrasadas: atrasadas.count ?? 0,
        falhas: falhasRows.length,
      },
      falhas_por_motivo: [...porMotivo.entries()].map(([codigo, total]) => ({ codigo, total })),
    };
  });

// ============ EXECUTAR VERIFICAÇÕES AGORA ============
export const runDispatchNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await getTenantAdmin(context as any);
    const { runDispatch } = await import("@/lib/notifications-dispatch.server");
    return await runDispatch();
  });
