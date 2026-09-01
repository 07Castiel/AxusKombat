import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/subscription";
import { requirePermissao } from "@/lib/tenant-guard";

const contratoInput = z.object({
  aluno_id: z.string().uuid(),
  plano_id: z.string().uuid().optional().nullable(),
  valor_mensalidade: z.coerce.number().nonnegative().max(99999),
  dia_vencimento: z.coerce.number().int().min(1).max(28),
  data_inicio: z.string().min(1),
  status: z.enum(["ativo", "pausado", "cancelado"]).default("ativo"),
  observacoes: z.string().max(1000).optional().nullable(),
});


/**
 * Cria ou atualiza o contrato ativo do aluno. Garante apenas 1 contrato 'ativo' por aluno.
 * Ao salvar/ativar, dispara geração rolling de mensalidades (mês corrente + 3 à frente).
 */
export const upsertContratoAtivo = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((i) => contratoInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const tenantId = await requirePermissao(ctx, "pagamentos");

    const { data: existing } = await ctx.supabase
      .from("contratos").select("id, dia_vencimento, valor_mensalidade")
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

      // Propaga alterações de vencimento/valor para as mensalidades em aberto
      // (mês corrente em diante). Sem isso, a aba Financeiro continua exibindo
      // o vencimento antigo já gerado.
      const diaMudou = Number(existing.dia_vencimento) !== Number(data.dia_vencimento);
      const valorMudou = Number(existing.valor_mensalidade) !== Number(data.valor_mensalidade);
      if (diaMudou || valorMudou) {
        const inicioMes = new Date().toISOString().slice(0, 7) + "-01";
        const { data: abertas } = await ctx.supabase
          .from("mensalidades")
          .select("id, competencia, desconto")
          .eq("contrato_id", contratoId)
          .in("status", ["pendente", "vencido"])
          .gte("competencia", inicioMes);

        for (const m of abertas ?? []) {
          const [ano, mes] = String(m.competencia).split("-").map(Number);
          const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
          const dia = Math.min(data.dia_vencimento, ultimoDia);
          const venc = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
          const hoje = new Date().toISOString().slice(0, 10);
          const patch: Record<string, unknown> = {
            data_vencimento: venc,
            status: venc < hoje ? "vencido" : "pendente",
          };
          if (valorMudou) patch.valor = data.valor_mensalidade;
          await ctx.supabase.from("mensalidades").update(patch).eq("id", m.id);
        }
      }

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
  .middleware([requireActiveSubscription])
  .inputValidator((i) => z.object({ contrato_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    await requirePermissao(ctx, "pagamentos");

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
  .middleware([requireActiveSubscription])
  .inputValidator((i) => z.object({ contrato_id: z.string().uuid(), pausar: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    await requirePermissao(ctx, "pagamentos");
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
