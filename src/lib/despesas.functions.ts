import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/subscription";
import { getTenantId } from "@/lib/tenant-guard";


const despesaInput = z.object({
  id: z.string().uuid().optional().nullable(),
  descricao: z.string().min(2).max(200),
  categoria: z.string().min(1).max(80),
  valor: z.coerce.number().nonnegative().max(9999999),
  data: z.string().min(1),
  observacoes: z.string().max(2000).optional().nullable(),
});

export const upsertDespesa = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((i) => despesaInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const tenantId = await getTenantId(ctx);
    const payload = {
      tenant_id: tenantId,
      descricao: data.descricao,
      categoria: data.categoria,
      valor: data.valor,
      data: data.data,
      observacoes: data.observacoes ?? null,
    };
    if (data.id) {
      const { error } = await ctx.supabase.from("despesas").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: novo, error } = await ctx.supabase.from("despesas").insert(payload).select("id").single();
    if (error || !novo) throw new Error(error?.message ?? "Falha ao salvar despesa");
    return { id: novo.id as string };
  });

export const deleteDespesa = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    await getTenantId(ctx);
    const { error } = await ctx.supabase.from("despesas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
