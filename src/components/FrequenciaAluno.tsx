import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CalendarCheck, TrendingUp, CalendarX, Target, Info } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import {
  SEM_DADOS,
  ORIGEM_META,
  chamadaInterrompida,
  fmtAderencia,
  fmtDias,
  fmtDiasCorridos,
  fmtOportunidades,
  fmtRitmo,
} from "@/lib/frequencia";
import type { FrequenciaAluno, FrequenciaLinha } from "@/integrations/supabase/tabelas-pendentes";

export const PERIODOS = [
  { valor: 7, rotulo: "7 dias" },
  { valor: 28, rotulo: "28 dias" },
  { valor: 90, rotulo: "90 dias" },
  { valor: 180, rotulo: "180 dias" },
] as const;

/**
 * Um indicador. `valor` nulo vira "Sem dados suficientes" — nunca zero.
 *
 * A distinção importa mais aqui do que em qualquer outro lugar da tela: zero
 * treinos é um fato sobre o aluno, e ausência de dado é um fato sobre a
 * academia. Mostrar os dois como "0" faz o gestor cobrar a pessoa errada.
 */
function Indicador({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  icone: React.ElementType;
  rotulo: string;
  valor: string | null;
  detalhe?: string | null;
  destaque?: string;
}) {
  const vazio = valor === null;
  return (
    <Card className="gradient-card border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.15em] uppercase">
          {rotulo}
        </p>
        <Icone className={`h-4 w-4 shrink-0 ${vazio ? "text-muted-foreground/40" : destaque ?? "text-muted-foreground"}`} />
      </div>
      {vazio ? (
        <p className="text-muted-foreground mt-2 text-sm leading-snug italic">{SEM_DADOS}</p>
      ) : (
        <p className={`mt-1 text-2xl leading-tight font-bold tabular-nums ${destaque ?? ""}`}>{valor}</p>
      )}
      {detalhe && !vazio && (
        <p className="text-muted-foreground mt-1 text-xs leading-snug">{detalhe}</p>
      )}
    </Card>
  );
}

function Aviso({
  tom,
  titulo,
  children,
}: {
  tom: "atencao" | "info";
  titulo: string;
  children: React.ReactNode;
}) {
  const cor =
    tom === "atencao"
      ? "border-warning/40 bg-warning/10 text-warning"
      : "border-primary/30 bg-primary/5 text-primary";
  return (
    <div className={`rounded-[4px] border p-3 ${cor}`}>
      <p className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
        <Info className="h-3.5 w-3.5 shrink-0" />
        {titulo}
      </p>
      <p className="text-foreground/80 mt-1.5 text-sm leading-relaxed">{children}</p>
    </div>
  );
}

/**
 * Seção de frequência da ficha do aluno.
 *
 * Todos os números vêm prontos de frequencia_aluno(); esta camada só escolhe
 * como mostrá-los. Nenhuma média, razão ou contagem é refeita aqui.
 */
export function FrequenciaAlunoSecao({
  dados,
  linha,
  carregando,
  erro,
  dias,
  onDiasChange,
}: {
  dados: FrequenciaAluno | null | undefined;
  linha: FrequenciaLinha | undefined;
  carregando: boolean;
  erro: unknown;
  dias: number;
  onDiasChange: (d: number) => void;
}) {
  const operacao = dados?.operacao?.find((o) => o.categoria === linha?.categoria);
  const ritmo = fmtRitmo(linha?.ritmo_semanal);
  const ritmoBase = fmtRitmo(linha?.ritmo_base_semanal);

  const seletor = (
    <Select value={String(dias)} onValueChange={(v) => onDiasChange(Number(v))}>
      <SelectTrigger className="h-9 w-[150px]" aria-label="Período da análise de frequência">
        {/* placeholder porque o Radix so resolve o rotulo do item no cliente:
            sem ele o seletor aparece vazio no primeiro paint do SSR. */}
        <SelectValue placeholder={`Últimos ${dias} dias`} />
      </SelectTrigger>
      <SelectContent>
        {PERIODOS.map((p) => (
          <SelectItem key={p.valor} value={String(p.valor)}>
            Últimos {p.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card className="gradient-card border-border p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display flex items-center gap-2 text-base font-bold tracking-[0.08em] uppercase">
          <CalendarCheck className="text-primary h-4 w-4" />
          Frequência
        </h2>
        {seletor}
      </div>

      {carregando && (
        <div className="grid place-items-center py-12">
          <Loader2 className="text-primary h-5 w-5 animate-spin" />
        </div>
      )}

      {!carregando && erro != null && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Não foi possível carregar a frequência agora. Recarregue a página para tentar de novo.
        </p>
      )}

      {!carregando && erro == null && !linha && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Este aluno não aparece na leitura de frequência. Alunos inativos e arquivados ficam de
          fora.
        </p>
      )}

      {!carregando && erro == null && linha && (
        <div className="space-y-4">
          {(linha.confiavel === false || linha.em_carencia || chamadaInterrompida(linha)) && (
            <div className="space-y-2">
              {linha.confiavel === false && (
                <Aviso tom="atencao" titulo="Dados inconclusivos">
                  A academia não registrou chamadas suficientes neste período
                  {operacao
                    ? ` — ${operacao.dias_com_chamada} de ${operacao.dias_esperados} dias previstos na grade de ${operacao.categoria}`
                    : ""}
                  . Os números abaixo saem do que foi registrado e podem estar incompletos. Falta
                  de registro não é falta do aluno.
                </Aviso>
              )}
              {linha.confiavel !== false && chamadaInterrompida(linha) && (
                <Aviso tom="atencao" titulo="Sem chamada recente">
                  Nenhuma aula da categoria dele teve chamada desde o último treino,{" "}
                  {fmtDiasCorridos(linha.dias_corridos_sem_treinar)}. Não dá para saber se ele
                  faltou ou se a chamada não foi feita.
                </Aviso>
              )}
              {linha.em_carencia && (
                <Aviso tom="info" titulo="Aluno novo">
                  Matriculado há {linha.dias_desde_entrada}{" "}
                  {linha.dias_desde_entrada === 1 ? "dia" : "dias"}. A expectativa é proporcional ao
                  tempo de casa, e ainda não há rotina formada para comparar.
                </Aviso>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador
              icone={CalendarCheck}
              rotulo="Treinos no período"
              valor={String(linha.dias_treinados)}
              detalhe={
                fmtDias(linha.dias_esperados)
                  ? `de ${fmtDias(linha.dias_esperados)} esperados`
                  : "expectativa não medida"
              }
              destaque="text-foreground"
            />
            <Indicador
              icone={Target}
              rotulo="Aderência"
              valor={fmtAderencia(linha.aderencia)}
              detalhe={`meta de ${linha.meta_semanal}x por semana`}
              destaque={
                linha.aderencia !== null && linha.aderencia >= 1 ? "text-success" : "text-foreground"
              }
            />
            <Indicador
              icone={CalendarX}
              rotulo="Sem treinar"
              valor={fmtOportunidades(linha.dias_sem_treinar)}
              detalhe={
                linha.dias_corridos_sem_treinar === null
                  ? "sem treino no histórico analisado"
                  : `último treino ${fmtDiasCorridos(linha.dias_corridos_sem_treinar)}`
              }
              destaque="text-foreground"
            />
            <Indicador
              icone={TrendingUp}
              rotulo="Ritmo atual"
              valor={ritmo === null ? null : `${ritmo}/sem`}
              detalhe={
                ritmoBase === null
                  ? "sem histórico anterior para comparar"
                  : `antes: ${ritmoBase}/sem`
              }
              destaque="text-foreground"
            />
          </div>

          <dl className="divide-border grid divide-y text-sm">
            <Linha rotulo="Meta semanal">
              {linha.meta_semanal}x por semana{" "}
              <span className="text-muted-foreground">· {ORIGEM_META[linha.meta_origem]}</span>
            </Linha>
            <Linha rotulo="Último treino">
              {linha.ultima_presenca ? (
                <>
                  {fmtDate(linha.ultima_presenca)}{" "}
                  <span className="text-muted-foreground">
                    · {fmtDiasCorridos(linha.dias_corridos_sem_treinar)}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground italic">
                  Nenhum treino no histórico analisado
                </span>
              )}
            </Linha>
            <Linha rotulo="Intervalo esperado">
              a cada {linha.gap_esperado.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias
            </Linha>
            {operacao && (
              <Linha rotulo="Chamadas no período">
                {operacao.dias_com_chamada} de {operacao.dias_esperados} dias previstos
                <span className="text-muted-foreground"> · grade {operacao.categoria}</span>
              </Linha>
            )}
            {dados && (
              <Linha rotulo="Período analisado">
                {fmtDate(dados.janela.de)} a {fmtDate(dados.janela.ate)}
                <span className="text-muted-foreground"> · fuso {dados.janela.fuso}</span>
              </Linha>
            )}
          </dl>
        </div>
      )}
    </Card>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-muted-foreground text-[10px] font-semibold tracking-[0.15em] uppercase">
        {rotulo}
      </dt>
      <dd className="text-right sm:text-right">{children}</dd>
    </div>
  );
}
