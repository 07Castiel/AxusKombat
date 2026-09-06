import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  comTabelasPendentes,
  type FrequenciaAluno,
} from "@/integrations/supabase/tabelas-pendentes";
import { requireActiveSubscription } from "@/lib/subscription";
import { requirePermissao } from "@/lib/tenant-guard";


export const togglePresenca = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((i) => z.object({
    horario_id: z.string().uuid(),
    aluno_id: z.string().uuid(),
    data: z.string().min(1),
    presente: z.boolean(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const tenantId = await requirePermissao(ctx, "alunos");
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

/**
 * Frequência agregada, com as guardas aplicadas no Postgres.
 *
 * Antes esta função baixava as linhas cruas de `presencas` para o chamador
 * somar — e não tinha chamador nenhum, o que era a sorte do projeto: o
 * PostgREST corta resposta em 1000 linhas sem erro, e presenças é a tabela que
 * mais cresce (o painel já teve exatamente esse bug, veja o comentário em
 * src/routes/_app/index.tsx). Somar no cliente devolveria número errado em
 * silêncio assim que a academia passasse de alguns meses de chamada.
 *
 * Agora o trabalho é de frequencia_aluno() em
 * supabase/migrations/20260906120000_frequencia_aluno_com_guardas.sql, que
 * também é onde vivem as guardas: dia sem chamada não é falta, dias distintos
 * em vez de linhas, meta que encolhe com a operação e carência para aluno novo.
 *
 * `aluno_id` nulo devolve todos os alunos ativos visíveis ao papel de quem
 * chama — a mesma chamada serve à ficha de um aluno e à lista do painel, em vez
 * de N+1 contra a tabela maior do schema.
 *
 * O RPC não é SECURITY DEFINER: o RLS continua valendo dentro dele, então um
 * professor kids recebe números calculados só sobre alunos kids.
 */
export const frequenciaAluno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    aluno_id: z.string().uuid().nullish(),
    dias: z.number().int().min(7).max(365).default(28),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    // /presencas responde ao módulo "alunos" (src/lib/acesso-telas.ts). Leitura
    // pede "ver"; só a chamada em si pede "editar".
    await requirePermissao(ctx, "alunos", "ver");
    const { data: resumo, error } = await comTabelasPendentes(ctx.supabase).rpc(
      "frequencia_aluno",
      { p_aluno_id: data.aluno_id ?? null, p_dias: data.dias },
    );
    if (error) throw new Error(error.message);
    return resumo as FrequenciaAluno | null;
  });
