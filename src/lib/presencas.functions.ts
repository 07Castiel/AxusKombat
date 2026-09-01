import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getTenantId } from "@/lib/tenant-guard";


export const togglePresenca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    horario_id: z.string().uuid(),
    aluno_id: z.string().uuid(),
    data: z.string().min(1),
    presente: z.boolean(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const tenantId = await getTenantId(ctx);
    const { error } = await ctx.supabase.from("presencas").upsert({
      tenant_id: tenantId,
      horario_id: data.horario_id,
      aluno_id: data.aluno_id,
      data: data.data,
      presente: data.presente,
      registrado_por: ctx.userId,
    }, { onConflict: "horario_id,aluno_id,data" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const frequenciaAluno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    aluno_id: z.string().uuid(),
    days: z.number().min(7).max(365).default(30),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    await getTenantId(ctx);
    const since = new Date(Date.now() - data.days * 86400000).toISOString().slice(0, 10);
    const { data: rows, error } = await ctx.supabase
      .from("presencas")
      .select("data, presente, horario_id, horarios(modalidade_id, modalidades(nome))")
      .eq("aluno_id", data.aluno_id)
      .gte("data", since)
      .order("data", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
