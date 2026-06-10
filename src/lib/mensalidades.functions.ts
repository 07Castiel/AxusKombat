import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const registrarPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    mensalidade_id: z.string().uuid(),
    data_pagamento: z.string().min(1),
    forma_pagamento: z.enum(["pix", "dinheiro", "cartao", "boleto"]),
    desconto: z.coerce.number().nonnegative().max(99999).default(0),
    observacoes: z.string().max(1000).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase.from("mensalidades").update({
      status: "pago",
      data_pagamento: data.data_pagamento,
      forma_pagamento: data.forma_pagamento,
      desconto: data.desconto,
      observacoes_pagamento: data.observacoes ?? null,
    }).eq("id", data.mensalidade_id);
    if (error) throw new Error(error.message);

    // Cancela avisos pendentes (futuros) dessa mensalidade
    await ctx.supabase.from("notificacoes")
      .update({ status: "cancelada" })
      .eq("mensalidade_id", data.mensalidade_id)
      .eq("status", "agendada");

    return { ok: true };
  });

export const cancelarMensalidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ mensalidade_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase.from("mensalidades")
      .update({ status: "cancelado" })
      .eq("id", data.mensalidade_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reabrirMensalidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ mensalidade_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const today = new Date().toISOString().slice(0, 10);
    const { data: m } = await ctx.supabase.from("mensalidades")
      .select("data_vencimento").eq("id", data.mensalidade_id).maybeSingle();
    const next = m && m.data_vencimento < today ? "vencido" : "pendente";
    const { error } = await ctx.supabase.from("mensalidades").update({
      status: next,
      data_pagamento: null,
      forma_pagamento: null,
      desconto: 0,
      observacoes_pagamento: null,
    }).eq("id", data.mensalidade_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Força o processamento diário manualmente (usado pelo botão "Atualizar agora") */
export const processarMensalidadesAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { data: prof } = await ctx.supabase.from("profiles").select("tenant_id").eq("id", ctx.userId).maybeSingle();
    if (!prof) throw new Error("Perfil não encontrado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("processar_mensalidades_diario" as any);
    if (error) throw new Error(error.message);
    return data as { geradas: number; marcadas_vencidas: number };
  });
