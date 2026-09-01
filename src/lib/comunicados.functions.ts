import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/subscription";
import { requireAdmin } from "@/lib/tenant-guard";


/**
 * Enfileira um comunicado geral por WhatsApp (A5).
 *
 * A versão anterior percorria todos os alunos com await sequencial, cada
 * iteração um POST à Evolution com timeout de 20 s. Em Cloudflare Workers a
 * requisição morre no meio do caminho: parte dos alunos recebe, parte não, e
 * não há retomada. Sem espaçamento entre envios, era também o padrão que faz o
 * WhatsApp bloquear o número.
 *
 * Agora só grava as linhas em `notificacoes` e devolve na hora. Quem entrega é
 * o worker, que já tem espaçamento, tentativas com espera crescente e respeita
 * a janela de horário da academia.
 */
export const enviarComunicado = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((i) => z.object({
    mensagem: z.string().min(5).max(2000),
    categoria: z.enum(["todos", "adulto", "kids"]).default("todos"),
    apenas_ativos: z.boolean().default(true),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await requireAdmin(
      context as any, "Apenas administradores podem enviar comunicados",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("alunos")
      .select("id, telefone, responsavel_telefone")
      .eq("tenant_id", tenantId);
    if (data.categoria !== "todos") q = q.eq("categoria", data.categoria);
    if (data.apenas_ativos) q = q.eq("status", "ativo");
    const { data: alunos, error } = await q;
    if (error) throw new Error(error.message);

    const agora = new Date().toISOString();
    const linhas: Record<string, unknown>[] = [];
    let semTelefone = 0;

    for (const a of (alunos ?? []) as any[]) {
      const destino = a.telefone || a.responsavel_telefone;
      if (!destino) { semTelefone++; continue; }
      linhas.push({
        tenant_id: tenantId,
        aluno_id: a.id,
        tipo: "COMUNICADO",
        canal: "whatsapp",
        destinatario: destino,
        mensagem: data.mensagem,
        status: "agendada",
        agendada_para: agora,
      });
    }

    if (linhas.length) {
      const { error: ie } = await supabaseAdmin.from("notificacoes").insert(linhas as any);
      if (ie) throw new Error(ie.message);
    }

    return {
      enfileirados: linhas.length,
      sem_telefone: semTelefone,
      total: (alunos ?? []).length,
    };
  });
