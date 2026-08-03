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
    return rows ?? [];
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
    await supabaseAdmin.from("notificacoes").update({
      status: r.ok ? "enviada" : "falhou",
      enviada_em: r.ok ? new Date().toISOString() : (n as any).enviada_em,
      erro: r.ok ? null : (r.error ?? "Erro desconhecido"),
    }).eq("id", (n as any).id);
    return { ok: r.ok, error: r.error };
  });

// ============ EXECUTAR VERIFICAÇÕES AGORA ============
export const runDispatchNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await getTenantAdmin(context as any);
    const handler = await import("@/routes/api/public/hooks/dispatch-notifications");
    const req = new Request("https://internal/api/public/hooks/dispatch-notifications", {
      method: "POST",
      headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "" },
    });
    const res = await (handler.Route as any).options.server.handlers.POST({ request: req });
    return await res.json();
  });
