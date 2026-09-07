import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { comTabelasPendentes, type RiscoEvasao } from "@/integrations/supabase/tabelas-pendentes";
import { requirePermissao } from "@/lib/tenant-guard";

/**
 * Leitura de risco de evasão, com a soma feita no Postgres.
 *
 * Uma chamada devolve todos os alunos ativos visíveis ao papel, do mesmo jeito
 * que frequencia_aluno() — e por dentro ela chama a frequencia_aluno() UMA vez
 * em vez de reimplementar a matemática de frequência. Não existe caminho aqui
 * que rode por aluno num laço.
 *
 * PERMISSÃO: o módulo é "pagamentos", não "alunos". O sinal dominante da
 * leitura é inadimplência — dias de atraso e histórico de pagamento —, e quem
 * pode ver isso é quem já pode abrir /financeiro. O RPC não é SECURITY
 * DEFINER, então o RLS de mensalidades é a proteção de verdade; esta linha só
 * falha mais cedo e com mensagem melhor.
 *
 * Devolve `null` quando o perfil não resolve tenant — diferente de
 * `alunos: []`, que é tenant válido sem aluno visível.
 */
export const riscoEvasao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        aluno_id: z.string().uuid().nullish(),
        // Os limites repetem os do SQL de propósito: o RPC também é alcançável
        // direto do navegador via supabase.rpc(), então a guarda real é a de lá.
        dias: z.coerce.number().int().min(7).max(365).default(28),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    await requirePermissao(ctx, "pagamentos", "ver");
    const { data: resumo, error } = await comTabelasPendentes(ctx.supabase).rpc("risco_evasao", {
      p_aluno_id: data.aluno_id ?? null,
      p_dias: data.dias,
    });
    if (error) throw new Error(error.message);
    return resumo as RiscoEvasao | null;
  });
