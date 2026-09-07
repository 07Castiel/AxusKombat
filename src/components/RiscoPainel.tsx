import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingDown, Info, ChevronRight, HelpCircle } from "lucide-react";
import { SEM_LEITURA, baseFina, fmtCobertura, tomDoRisco } from "@/lib/risco";
import type { RiscoEvasao, RiscoLinha } from "@/integrations/supabase/tabelas-pendentes";

/**
 * Bloco de risco de evasão do painel.
 *
 * UMA chamada de risco_evasao() com `aluno_id` nulo devolve todos os alunos
 * ativos visíveis ao papel, com a soma já feita no Postgres. Nada aqui chama a
 * RPC por aluno.
 *
 * O QUE ESTA TELA NÃO FAZ
 *
 * Não diz que alguém vai sair. Não escreve "em risco", "crítico" nem
 * "saudável". Mostra a nota, o que a compôs, e o que não deu para medir — e
 * quem lê decide. A cor é um convite a olhar, não uma classificação.
 *
 * Aluno sem sinal de comportamento aparece numa lista separada, com o fato que
 * chamou atenção, e SEM nota. Não é "risco 0": é ausência de leitura.
 */
export function RiscoPainel({
  dados,
  carregando,
  erro,
}: {
  dados: RiscoEvasao | null | undefined;
  carregando: boolean;
  erro: unknown;
}) {
  // O fallback fica DENTRO do useMemo: `dados?.alunos ?? []` fora dele cria um
  // array novo a cada render e invalida a memoizacao sempre.
  const { alunos, comNota, semNota, medianaCobertura } = useMemo(() => {
    const todos = dados?.alunos ?? [];
    const com = todos.filter((a) => a.risco !== null);
    const sem = todos.filter((a) => a.risco === null && a.motivos.length > 0);
    const cobs = com.map((a) => a.cobertura).sort((x, y) => x - y);
    return {
      alunos: todos,
      comNota: com,
      semNota: sem,
      medianaCobertura: cobs.length ? cobs[Math.floor(cobs.length / 2)] : null,
    };
  }, [dados]);

  return (
    <Card className="gradient-card border-border p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display flex items-center gap-2 text-base font-bold tracking-[0.08em] uppercase">
          <TrendingDown className="text-primary h-4 w-4" />
          Sinais de evasão
        </h2>
        {medianaCobertura !== null && (
          <span className="text-muted-foreground text-xs">
            leitura sobre {fmtCobertura(medianaCobertura)}
          </span>
        )}
      </div>

      {carregando && (
        <div className="grid place-items-center py-12">
          <Loader2 className="text-primary h-5 w-5 animate-spin" />
        </div>
      )}

      {!carregando && erro != null && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Não foi possível carregar os sinais agora. Recarregue a página para tentar de novo.
        </p>
      )}

      {!carregando && erro == null && alunos.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Nenhum aluno ativo na leitura.
        </p>
      )}

      {!carregando && erro == null && alunos.length > 0 && (
        <div className="space-y-4">
          {comNota.length === 0 ? (
            <div className="border-primary/30 bg-primary/5 rounded-[4px] border p-3">
              <p className="text-primary flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
                <Info className="h-3.5 w-3.5 shrink-0" />
                {SEM_LEITURA}
              </p>
              <p className="text-foreground/80 mt-1.5 text-sm leading-relaxed">
                Nenhum aluno tem sinal de comportamento medido — nem mensalidade vencida, nem
                frequência com chamada suficiente. Contrato e tempo de casa sozinhos não sustentam
                uma nota, e mostrar um número saído só deles diria mais sobre a falta de dado do que
                sobre o aluno.
              </p>
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {comNota.slice(0, 8).map((a) => (
                <LinhaRisco key={a.id} aluno={a} />
              ))}
            </ul>
          )}

          {semNota.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.15em] uppercase">
                <HelpCircle className="h-3 w-3" />
                Sem nota, mas com algo a conferir
              </p>
              <ul className="divide-border divide-y">
                {semNota.slice(0, 5).map((a) => (
                  <li key={a.id} className="py-2">
                    <Link
                      to="/aluno/$id"
                      params={{ id: a.id }}
                      className="hover:text-primary flex items-baseline justify-between gap-3 text-sm transition-colors"
                    >
                      <span className="truncate">{a.nome_completo}</span>
                      <span className="text-muted-foreground shrink-0 text-right text-xs">
                        {a.motivos[0]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function LinhaRisco({ aluno }: { aluno: RiscoLinha }) {
  const tom = tomDoRisco(aluno.risco);
  const cor =
    tom === "alto" ? "text-primary" : tom === "atencao" ? "text-warning" : "text-muted-foreground";
  return (
    <li className="py-2.5">
      <Link
        to="/aluno/$id"
        params={{ id: aluno.id }}
        className="group flex items-start justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="group-hover:text-primary truncate text-sm font-medium transition-colors">
            {aluno.nome_completo}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
            {aluno.motivos.length > 0 ? aluno.motivos.join(" · ") : "Sem ocorrência no período"}
          </p>
          {baseFina(aluno) && (
            <p className="text-muted-foreground/70 mt-0.5 text-[11px] italic">
              medido sobre {fmtCobertura(aluno.cobertura)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={`text-lg font-bold tabular-nums ${cor}`}>{aluno.risco}</span>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        </div>
      </Link>
    </li>
  );
}
