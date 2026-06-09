import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_CFG = {
  provider: "evolution",
  instance_name: "",
  api_url: "",
  api_token: "",
  sender_number: "",
  enabled: false,
  template_7_dias: "Olá {nome}, sua matrícula na {academia} vence em {vencimento} (valor R$ {valor}). Caso já tenha pago, desconsidere esta mensagem.",
  template_3_dias: "Olá {nome}, faltam 3 dias para o vencimento da sua matrícula na {academia} ({vencimento} — R$ {valor}). Já pagou? Pode ignorar.",
  template_vencimento: "Olá {nome}, sua matrícula na {academia} vence hoje ({vencimento} — R$ {valor}). Se já efetuou o pagamento, ignore esta mensagem.",
};

async function getTenantAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles, error } = await ctx.supabase
    .from("user_roles").select("role, tenant_id").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const admin = (roles ?? []).find((r: any) => r.role === "admin");
  if (!admin) throw new Error("Apenas administradores podem acessar esta área");
  return admin.tenant_id as string;
}

export const getWhatsappConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const supabase = (context as any).supabase;
    const { data, error } = await supabase
      .from("whatsapp_config").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { tenant_id: tenantId, ...DEFAULT_CFG };
  });

export const saveWhatsappConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      provider: z.enum(["evolution", "zapi", "cloud", "mock"]),
      instance_name: z.string().trim().max(120).optional().nullable(),
      api_url: z.string().trim().max(500).optional().nullable(),
      api_token: z.string().trim().max(1000).optional().nullable(),
      sender_number: z.string().trim().max(40).optional().nullable(),
      enabled: z.boolean(),
      template_7_dias: z.string().min(5).max(2000),
      template_3_dias: z.string().min(5).max(2000),
      template_vencimento: z.string().min(5).max(2000),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_config")
      .upsert({ tenant_id: tenantId, ...data }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testWhatsappConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ to: z.string().trim().min(8).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWhatsapp } = await import("@/lib/whatsapp.server");
    const { data: cfg } = await supabaseAdmin
      .from("whatsapp_config").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (!cfg) throw new Error("Configure o WhatsApp antes de testar");
    const result = await sendWhatsapp(cfg as any, data.to, "🥋 Teste de conexão Axus Kombat — se você recebeu, está tudo certo.");
    await supabaseAdmin.from("whatsapp_config").update({
      last_test_at: new Date().toISOString(),
      last_test_result: result.ok ? "sucesso" : (result.error ?? "falha"),
      connection_status: result.ok ? "conectado" : "erro",
    }).eq("tenant_id", tenantId);
    return { ok: result.ok, error: result.error, providerMessageId: result.providerMessageId };
  });

export const listNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      aluno_id: z.string().uuid().optional().nullable(),
      status: z.enum(["agendada", "enviada", "falhou", "cancelada"]).optional().nullable(),
      tipo: z.string().optional().nullable(),
      from: z.string().optional().nullable(),
      to: z.string().optional().nullable(),
      limit: z.number().min(1).max(500).default(100),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const supabase = (context as any).supabase;
    let q = supabase
      .from("notificacoes")
      .select(`
        id, tipo, canal, destinatario, mensagem, status, enviada_em, erro, created_at,
        matricula_id, aluno:alunos ( id, nome_completo )
      `)
      .eq("tenant_id", tenantId)
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
  .inputValidator((input) => z.object({ notification_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWhatsapp } = await import("@/lib/whatsapp.server");

    const { data: notif, error } = await supabaseAdmin
      .from("notificacoes").select("*").eq("id", data.notification_id).maybeSingle();
    if (error || !notif) throw new Error("Notificação não encontrada");
    if (notif.tenant_id !== tenantId) throw new Error("Não autorizado");

    // Stop if matricula is no longer pending
    if (notif.matricula_id) {
      const { data: mat } = await supabaseAdmin
        .from("matriculas").select("status").eq("id", notif.matricula_id).maybeSingle();
      if (mat && mat.status !== "pendente") {
        throw new Error(`Matrícula está como '${mat.status}' — não é possível reenviar aviso de cobrança.`);
      }
    }

    const { data: cfg } = await supabaseAdmin
      .from("whatsapp_config").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (!cfg) throw new Error("Configure o WhatsApp antes de reenviar");
    if (!notif.destinatario) throw new Error("Notificação sem telefone destinatário");

    const result = await sendWhatsapp(cfg as any, notif.destinatario, notif.mensagem);
    await supabaseAdmin.from("notificacoes").update({
      status: result.ok ? "enviada" : "falhou",
      enviada_em: result.ok ? new Date().toISOString() : notif.enviada_em,
      erro: result.ok ? null : (result.error ?? "Erro desconhecido"),
    }).eq("id", notif.id);
    return { ok: result.ok, error: result.error, providerMessageId: result.providerMessageId };
  });

export const runNotificationsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await getTenantAdmin(context as any);
    const handler = await import("@/routes/api/public/hooks/notify-matriculas");
    const req = new Request("https://internal/api/public/hooks/notify-matriculas", {
      method: "POST",
      headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "" },
    });
    const res = await (handler.Route as any).options.server.handlers.POST({ request: req });
    const json = await res.json();
    return json as { ok: boolean; summary?: { sent: number; failed: number; skipped: number; scanned: number } };
  });
