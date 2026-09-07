import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, CalendarCheck, CalendarX, HelpCircle, Info, ChevronRight } from "lucide-react";
import {
  acimaDoIntervaloDoPlano,
  fmtDiasCorridos,
  fmtOportunidades,
  SEM_DADOS,
} from "@/lib/frequencia";
import type { FrequenciaAluno } from "@/integrations/supabase/tabelas-pendentes";

/**
 * Bloco de frequência do painel.
 *
 * Alimentado por UMA chamada de frequencia_aluno() com `aluno_id` nulo, que já
 * devolve todos os alunos ativos visíveis ao papel. Nada aqui chama a RPC por
 * aluno: a função foi feita justamente para o painel não precisar disso.
 *
 * O que esta tela NÃO faz: classificar aluno. Não existe "em risco", "saudável"
 * nem "abandonando". O único destaque é factual e sai de dois campos que a
 * própria função devolve — está sem treinar há mais tempo que o intervalo que
 * o plano dele pressupõe. Quem interpreta é o gestor.
 */
export function FrequenciaPainel({
  dados,
  carregando,
  erro,
  dias,
}: {
  dados: FrequenciaAluno | null | undefined;
  carregando: boolean;
  erro: unknown;
  dias: number;
}) {
  const alunos = dados?.alunos ?? [];

  const resumo = useMemo(() => {
    const comAderencia = alunos.filter((a) => a.aderencia !== null);
    const somaAderencia = comAderencia.reduce((s, a) => s + (a.aderencia ?? 0), 0);
    return {
      treinos: alunos.reduce((s, a) => s + a.dias_treinados, 0),
      acimaDoIntervalo: alunos.filter(acimaDoIntervaloDoPlano).length,
      semDados: alunos.length - comAderencia.length,
      // Média simples das aderências medidas. O denominador vai junto na tela
      // de propósito: média de 12 alunos quando a academia tem 60 é uma
      // informação diferente de média de 60.
      mediaAderencia: comAderencia.length
        ? Math.round((somaAderencia / comAderencia.length) * 100)
        : null,
      medidos: comAderencia.length,
      total: alunos.length,
    };
  }, [alunos]);

  // A lista já vem do banco ordenada por oportunidades perdidas, decrescente.
  const maioresIntervalos = useMemo(
    () => alunos.filter((a) => a.dias_sem_treinar > 0).slice(0, 6),
    [alunos],
  );

  const categoriasInconclusivas = (dados?.operacao ?? []).filter((o) => !o.confiavel);

  return (
    <Card className="gradient-card border-border p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="font-display flex items-center gap-2 text-base font-bold tracking-[0.08em] uppercase">
          <CalendarCheck className="text-primary h-4 w-4" />
          Frequência
        </h3>
        <p className="text-muted-foreground text-xs">últimos {dias} dias</p>
      </div>

      {carregando && (
        <div className="grid place-items-center py-12">
          <Loader2 className="text-primary h-5 w-5 animate-spin" />
        </div>
      )}

      {!carregando && erro != null && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Não foi possível carregar a frequência agora.
        </p>
      )}

      {!carregando && erro == null && alunos.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Nenhum aluno ativo para acompanhar ainda.
        </p>
      )}

      {!carregando && erro == null && alunos.length > 0 && (
        <div className="space-y-4">
          {categoriasInconclusivas.length > 0 && (
            <div className="border-warning/40 bg-warning/10 rounded-[4px] border p-3">
              <p className="text-warning flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Chamadas incompletas
              </p>
              <p className="text-foreground/80 mt-1.5 text-sm leading-relaxed">
                A academia não registrou chamadas suficientes neste período em{" "}
                {categoriasInconclusivas.map((o) => o.categoria).join(" e ")}
                {categoriasInconclusivas.map((o) => (
                  <span key={o.categoria}>
                    {" "}
                    ({o.dias_com_chamada} de {o.dias_esperados} dias previstos)
                  </span>
                ))}
                . Os números de frequência podem estar incompletos — falta de registro não é falta
                do aluno.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              icone={CalendarCheck}
              rotulo="Treinos registrados"
              valor={String(resumo.treinos)}
              detalhe={`${resumo.total} alunos ativos`}
            />
            <Tile
              icone={CalendarCheck}
              rotulo="Aderência média"
              valor={resumo.mediaAderencia === null ? null : `${resumo.mediaAderencia}%`}
              detalhe={`entre ${resumo.medidos} de ${resumo.total} alunos`}
            />
            <Tile
              icone={CalendarX}
              rotulo="Acima do intervalo do plano"
              valor={String(resumo.acimaDoIntervalo)}
              detalhe="sem treinar há mais que o intervalo contratado"
            />
            <Tile
              icone={HelpCircle}
              rotulo="Sem dados suficientes"
              valor={String(resumo.semDados)}
              detalhe="expectativa não medida no período"
            />
          </div>

          <div>
            <h4 className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.15em] uppercase">
              Maiores intervalos sem treinar
            </h4>
            {maioresIntervalos.length === 0 ? (
              <p className="text-muted-foreground py-3 text-sm">
                Todos os alunos treinaram na última aula da categoria deles.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {maioresIntervalos.map((a) => (
                  <li key={a.aluno_id}>
                    <Link
                      to="/aluno/$id"
                      params={{ id: a.aluno_id }}
                      className="hover:bg-accent/30 -mx-2 flex items-center gap-3 rounded-[3px] px-2 py-2.5 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.nome_completo}</p>
                        <p className="text-muted-foreground text-xs">
                          {fmtOportunidades(a.dias_sem_treinar)}
                          {a.dias_corridos_sem_treinar !== null && (
                            <> · último treino {fmtDiasCorridos(a.dias_corridos_sem_treinar)}</>
                          )}
                          {a.em_carencia && <> · aluno novo</>}
                          {!a.confiavel && <> · dados inconclusivos</>}
                        </p>
                      </div>
                      <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Tile({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
}: {
  icone: React.ElementType;
  rotulo: string;
  valor: string | null;
  detalhe: string;
}) {
  const vazio = valor === null;
  return (
    <div className="border-border bg-accent/20 rounded-[4px] border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.15em] uppercase">
          {rotulo}
        </p>
        <Icone className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      </div>
      {vazio ? (
        <p className="text-muted-foreground mt-1.5 text-xs leading-snug italic">{SEM_DADOS}</p>
      ) : (
        <p className="mt-1 text-xl font-bold tabular-nums">{valor}</p>
      )}
      <p className="text-muted-foreground mt-1 text-[11px] leading-snug">{detalhe}</p>
    </div>
  );
}
