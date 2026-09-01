import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/tenant-guard";

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

/**
 * Força o processamento manualmente (botão "Atualizar agora").
 *
 * Antes chamava processar_mensalidades_diario(), que varre a plataforma
 * inteira, e a única checagem era "o perfil existe" — qualquer professor ou
 * recepcionista gerava mensalidades e marcava vencidos de TODAS as academias.
 *
 * Agora exige admin e faz o mesmo trabalho restrito ao próprio tenant, usando
 * o client do usuário (RLS) para o UPDATE e gerando contrato a contrato. O cron
 * diário continua chamando a versão global, que é o lugar certo para ela.
 */
export const processarMensalidadesAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const tenantId = await requireAdmin(ctx);
    const hoje = new Date().toISOString().slice(0, 10);

    const { data: vencidas, error: eVenc } = await ctx.supabase
      .from("mensalidades")
      .update({ status: "vencido" })
      .eq("tenant_id", tenantId)
      .eq("status", "pendente")
      .lt("data_vencimento", hoje)
      .select("id");
    if (eVenc) throw new Error(eVenc.message);

    const { data: contratos, error: eCon } = await ctx.supabase
      .from("contratos")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "ativo");
    if (eCon) throw new Error(eCon.message);

    let geradas = 0;
    for (const c of (contratos ?? []) as { id: string }[]) {
      const { data, error } = await ctx.supabase
        .rpc("gerar_mensalidades_contrato", { p_contrato_id: c.id });
      if (error) throw new Error(error.message);
      geradas += Number(data ?? 0);
    }

    return { geradas, marcadas_vencidas: (vencidas ?? []).length };
  });
