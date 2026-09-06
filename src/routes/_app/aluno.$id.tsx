import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RequireTela } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { FrequenciaAlunoSecao } from "@/components/FrequenciaAluno";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Mail, Phone, CalendarDays, CreditCard } from "lucide-react";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { frequenciaAluno } from "@/lib/presencas.functions";
import { PAPEIS_DE_PRESENCA } from "@/lib/acesso-telas";

export const Route = createFileRoute("/_app/aluno/$id")({
  component: FichaAlunoProtegida,
  head: () => ({
    meta: [
      { title: "Ficha do aluno | Axus Kombat" },
      { name: "description", content: "Dados, plano e frequência do aluno." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function FichaAlunoProtegida() {
  return (
    <RequireTela tela="/aluno/$id">
      <FichaAluno />
    </RequireTela>
  );
}

function FichaAluno() {
  const { id } = Route.useParams();
  const { profile, roles } = useAuth();
  const buscarFrequencia = useServerFn(frequenciaAluno);
  const [dias, setDias] = useState(28);

  // O financeiro entra na ficha pelo plano e pela mensalidade, mas o RLS de
  // `presencas` nao devolve linha nenhuma para ele. Renderizar a secao assim
  // encheria a tela de "Sem dados suficientes" e daria a entender que a
  // academia nao fez chamada — mentira, e justamente a leitura que as guardas
  // existem para impedir. Melhor dizer que a secao nao e do papel dele.
  const podeVerFrequencia = roles.some((r) => PAPEIS_DE_PRESENCA.includes(r));

  const { data: aluno, isLoading: carregandoAluno } = useQuery({
    queryKey: ["aluno", id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      // Sem filtro de tenant aqui de propósito: o RLS de `alunos` já recorta
      // por academia E por categoria do papel. Um id de outra academia devolve
      // nada, e é isso que a tela mostra.
      const { data, error } = await supabase.from("alunos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: contrato } = useQuery({
    queryKey: ["contrato-aluno", id],
    enabled: !!profile?.tenant_id && !!aluno,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos")
        .select("*, planos(nome, frequencia_semanal)")
        .eq("aluno_id", id)
        .in("status", ["ativo", "pausado"])
        .order("data_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // UMA chamada para este aluno. A mesma RPC que alimenta o painel, filtrada
  // no banco por aluno_id — não é a lista inteira baixada e filtrada aqui.
  const {
    data: frequencia,
    isLoading: carregandoFrequencia,
    error: erroFrequencia,
  } = useQuery({
    queryKey: ["frequencia-aluno", id, dias],
    enabled: !!profile?.tenant_id && !!aluno && podeVerFrequencia,
    queryFn: () => buscarFrequencia({ data: { aluno_id: id, dias } }),
  });

  const linha = useMemo(() => frequencia?.alunos?.[0], [frequencia]);

  if (carregandoAluno) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!aluno) {
    return (
      <div className="grid min-h-[50vh] place-items-center px-4">
        <Card className="gradient-card border-border max-w-md p-8 text-center">
          <h1 className="font-display text-lg tracking-wider uppercase">Aluno não encontrado</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Este aluno não existe, foi excluído, ou não faz parte da sua academia.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/alunos">Voltar para alunos</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const a = aluno as Record<string, any>;
  const c = contrato as Record<string, any> | null | undefined;

  return (
    <div>
      <PageHeader
        title={a.nome_completo}
        description="Ficha do aluno"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/alunos">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Alunos
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={a.status} />
        <StatusBadge status={a.categoria} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="gradient-card border-border p-4 sm:p-5">
          <h2 className="text-muted-foreground mb-3 text-[10px] font-semibold tracking-[0.15em] uppercase">
            Contato
          </h2>
          <dl className="space-y-2 text-sm">
            <Info icone={Mail} rotulo="E-mail" valor={a.email} />
            <Info icone={Phone} rotulo="Telefone" valor={a.telefone} />
            <Info
              icone={CalendarDays}
              rotulo="Entrada"
              valor={a.data_entrada ? fmtDate(a.data_entrada) : null}
            />
          </dl>
        </Card>

        <Card className="gradient-card border-border p-4 sm:p-5 lg:col-span-2">
          <h2 className="text-muted-foreground mb-3 text-[10px] font-semibold tracking-[0.15em] uppercase">
            Plano
          </h2>
          {c ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <Info icone={CreditCard} rotulo="Plano" valor={c.planos?.nome} />
              <Info
                icone={CreditCard}
                rotulo="Mensalidade"
                valor={fmtMoney(Number(c.valor_mensalidade))}
              />
              <Info
                icone={CalendarDays}
                rotulo="Frequência contratada"
                valor={
                  c.planos?.frequencia_semanal
                    ? `${c.planos.frequencia_semanal}x por semana`
                    : null
                }
              />
              <Info icone={CalendarDays} rotulo="Vencimento" valor={`Dia ${c.dia_vencimento}`} />
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm italic">
              Sem contrato ativo. A meta de frequência cai no histórico do próprio aluno.
            </p>
          )}
        </Card>
      </div>

      {podeVerFrequencia ? (
        <FrequenciaAlunoSecao
          dados={frequencia}
          linha={linha}
          carregando={carregandoFrequencia}
          erro={erroFrequencia}
          dias={dias}
          onDiasChange={setDias}
        />
      ) : (
        <Card className="gradient-card border-border p-6">
          <h2 className="font-display text-base font-bold tracking-[0.08em] uppercase">
            Frequência
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            A frequência do aluno faz parte do acompanhamento de treino e não do seu perfil de
            acesso. Peça a um administrador ou à recepção se precisar desse dado.
          </p>
        </Card>
      )}
    </div>
  );
}

function Info({
  icone: Icone,
  rotulo,
  valor,
}: {
  icone: React.ElementType;
  rotulo: string;
  valor: string | null | undefined;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <Icone className="text-muted-foreground h-3.5 w-3.5 shrink-0 translate-y-0.5" />
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="ml-auto text-right break-words">
        {valor ? valor : <span className="text-muted-foreground italic">—</span>}
      </dd>
    </div>
  );
}
