import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/tenant-guard";


/** Envia comunicado geral por WhatsApp a um conjunto de alunos. */
export const enviarComunicado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    mensagem: z.string().min(5).max(2000),
    categoria: z.enum(["todos", "adulto", "kids"]).default("todos"),
    apenas_ativos: z.boolean().default(true),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem enviar comunicados");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWhatsappByTenant } = await import("@/lib/whatsapp.server");

    let q = supabaseAdmin.from("alunos").select("id, nome_completo, telefone, responsavel_telefone, categoria, status")
      .eq("tenant_id", tenantId);
    if (data.categoria !== "todos") q = q.eq("categoria", data.categoria);
    if (data.apenas_ativos) q = q.eq("status", "ativo");
    const { data: alunos, error } = await q;
    if (error) throw new Error(error.message);

    let sent = 0, failed = 0, skipped = 0;
    for (const a of (alunos ?? []) as any[]) {
      const destino = a.telefone || a.responsavel_telefone;
      if (!destino) { skipped++; continue; }
      const result = await sendWhatsappByTenant(tenantId, destino, data.mensagem);
      await supabaseAdmin.from("notificacoes").insert({
        tenant_id: tenantId,
        aluno_id: a.id,
        tipo: "COMUNICADO",
        canal: "whatsapp",
        destinatario: destino,
        mensagem: data.mensagem,
        status: result.ok ? "enviada" : "falhou",
        enviada_em: result.ok ? new Date().toISOString() : null,
        erro: result.ok ? null : (result.error ?? "Erro desconhecido"),
      });
      if (result.ok) sent++; else failed++;
    }
    return { sent, failed, skipped, total: (alunos ?? []).length };
  });
