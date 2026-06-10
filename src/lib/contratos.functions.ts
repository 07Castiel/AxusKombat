import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const contratoInput = z.object({
  aluno_id: z.string().uuid(),
  plano_id: z.string().uuid().optional().nullable(),
  valor_mensalidade: z.coerce.number().nonnegative().max(99999),
  dia_vencimento: z.coerce.number().int().min(1).max(28),
  data_inicio: z.string().min(1),
  status: z.enum(["ativo", "pausado", "cancelado"]).default("ativo"),
  observacoes: z.string().max(1000).optional().nullable(),
});

async function getTenantId(ctx: { supabase: any; userId: string }) {
  const { data: prof, error } = await ctx.supabase
    .from("profiles").select("tenant_id").eq("id", ctx.userId).maybeSingle();
  if (error || !prof) throw new Error("Perfil não encontrado");
  return prof.tenant_id as string;
}

/**
 * Cria ou atualiza o contrato ativo do aluno. Garante apenas 1 contrato 'ativo' por aluno.
 * Ao salvar/ativar, dispara geração rolling de mensalidades (mês corrente + 3 à frente).
 */
export const upsertContratoAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => contratoInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const tenantId = await getTenantId(ctx);

    const { data: existing } = await ctx.supabase
      .from("contratos").select("id")
      .eq("aluno_id", data.aluno_id).eq("status", "ativo").maybeSingle();

    let contratoId: string;
    if (existing) {
      const { error } = await ctx.supabase.from("contratos").update({
        plano_id: data.plano_id ?? null,
        valor_mensalidade: data.valor_mensalidade,
        dia_vencimento: data.dia_vencimento,
        data_inicio: data.data_inicio,
        status: data.status,
        observacoes: data.observacoes ?? null,
      }).eq("id", existing.id);
      if (error) throw new Error(error.message);
      contratoId = existing.id;
    } else {
      const { data: novo, error } = await ctx.supabase.from("contratos").insert({
        tenant_id: tenantId,
        aluno_id: data.aluno_id,
        plano_id: data.plano_id ?? null,
        valor_mensalidade: data.valor_mensalidade,
        dia_vencimento: data.dia_vencimento,
        data_inicio: data.data_inicio,
        status: data.status,
        observacoes: data.observacoes ?? null,
      }).select("id").single();
      if (error || !novo) throw new Error(error?.message ?? "Falha ao criar contrato");
      contratoId = novo.id;
    }

    if (data.status === "ativo") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.rpc("gerar_mensalidades_contrato", { p_contrato_id: contratoId } as any);
    }
    return { contrato_id: contratoId };
  });

/**
 * Cancela um contrato ativo e cancela mensalidades pendentes com vencimento futuro.
 */
export const cancelarContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ contrato_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    await getTenantId(ctx); // RLS gates the rest

    const today = new Date().toISOString().slice(0, 10);
    const { error } = await ctx.supabase.from("contratos").update({
      status: "cancelado",
      data_fim: today,
    }).eq("id", data.contrato_id);
    if (error) throw new Error(error.message);

    await ctx.supabase.from("mensalidades")
      .update({ status: "cancelado" })
      .eq("contrato_id", data.contrato_id)
      .eq("status", "pendente")
      .gte("data_vencimento", today);
    return { ok: true };
  });

/** Pausa o contrato (mantém mensalidades já geradas mas para de gerar novas). */
export const pausarContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ contrato_id: z.string().uuid(), pausar: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    await getTenantId(ctx);
    const { error } = await ctx.supabase.from("contratos")
      .update({ status: data.pausar ? "pausado" : "ativo" })
      .eq("id", data.contrato_id);
    if (error) throw new Error(error.message);
    if (!data.pausar) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.rpc("gerar_mensalidades_contrato", { p_contrato_id: data.contrato_id } as any);
    }
    return { ok: true };
  });
