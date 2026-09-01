import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/subscription";
import { requireAdmin } from "@/lib/tenant-guard";


export const getTenantConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const tenantId = await requireAdmin(ctx, "Apenas administradores podem alterar a academia");
    const { data, error } = await ctx.supabase
      .from("tenants").select("*").eq("id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateTenantConfig = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((i) => z.object({
    nome: z.string().min(2).max(120),
    nome_fantasia: z.string().max(120).optional().nullable(),
    cnpj_cpf: z.string().max(30).optional().nullable(),
    telefone: z.string().max(30).optional().nullable(),
    responsavel_nome: z.string().max(120).optional().nullable(),
    responsavel_email: z.string().email().or(z.literal("")).optional().nullable(),
    endereco: z.string().max(300).optional().nullable(),
    logo_url: z.string().max(500).optional().nullable(),
    pix_chave: z.string().max(120).optional().nullable(),
    pix_titular: z.string().max(120).optional().nullable(),
    banco: z.string().max(120).optional().nullable(),
    notif_hora_envio: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    notif_lembretes_ativos: z.boolean().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const tenantId = await requireAdmin(ctx, "Apenas administradores podem alterar a academia");
    const { error } = await ctx.supabase.from("tenants").update({
      nome: data.nome,
      nome_fantasia: data.nome_fantasia || null,
      cnpj_cpf: data.cnpj_cpf || null,
      telefone: data.telefone || null,
      responsavel_nome: data.responsavel_nome || null,
      responsavel_email: data.responsavel_email || null,
      endereco: data.endereco || null,
      logo_url: data.logo_url || null,
      pix_chave: data.pix_chave || null,
      pix_titular: data.pix_titular || null,
      banco: data.banco || null,
      notif_hora_envio: data.notif_hora_envio || "09:00",
      notif_lembretes_ativos: data.notif_lembretes_ativos ?? true,
    }).eq("id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const gerarPortalToken = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((i) => z.object({ aluno_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { data: prof } = await ctx.supabase
      .from("profiles").select("tenant_id").eq("id", ctx.userId).maybeSingle();
    if (!prof) throw new Error("Perfil não encontrado");
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().slice(0, 8).replace(/-/g, "");
    const { error } = await ctx.supabase.from("alunos")
      .update({ portal_token: token })
      .eq("id", data.aluno_id);
    if (error) throw new Error(error.message);
    return { token };
  });
