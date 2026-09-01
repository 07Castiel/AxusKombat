import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  comTabelasPendentes,
  type DashboardResumo,
} from "@/integrations/supabase/tabelas-pendentes";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import {
  Users,
  UserX,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Cake,
  Calendar,
  Clock,
  Loader2,
} from "lucide-react";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Painel | Axus Kombat" },
      {
        name: "description",
        content: "Visão geral da academia: alunos, financeiro e inadimplência.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function Dashboard() {
  const { profile } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      // Agregação no Postgres (A4). Antes o painel baixava TODAS as
      // mensalidades, alunos e despesas e somava aqui — e o PostgREST corta a
      // resposta em 1000 linhas sem erro, então passando disso receita,
      // inadimplência e lucro ficavam errados em silêncio.
      //
      // dashboard_resumo() não é SECURITY DEFINER: roda com o papel de quem
      // chama, então o RLS continua valendo e cada papel vê o que já via.
      const { data, error } = await comTabelasPendentes(supabase).rpc("dashboard_resumo");
      if (error) throw error;
      return data as DashboardResumo | null;
    },
  });

  const alunos = data?.alunos ?? { ativos: 0, inativos: 0, total: 0 };
  const fin = data?.financeiro ?? {
    receita_recebida: 0,
    receita_prevista: 0,
    total_vencidas: 0,
    qtd_vencidas: 0,
    qtd_pendentes: 0,
    inadimplentes: 0,
  };
  const despesasMes = Number(data?.despesas_mes ?? 0);
  const lucro = Number(data?.lucro_mes ?? 0);
  const proximosVencimentos = data?.proximos_vencimentos ?? [];
  const aniversariantes = data?.aniversariantes ?? [];

  const chart = (data?.serie_receita ?? []).map((p) => ({
    mes: new Date(`${p.mes}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short" }),
    Receita: Number(p.receita),
  }));

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title={`Bem-vindo, ${profile?.nome_completo?.split(" ")[0] ?? ""}`}
          description="Visão geral financeira e operacional"
        />
        <div className="grid place-items-center py-24">
          <Loader2 className="text-primary h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Bem-vindo, ${profile?.nome_completo?.split(" ")[0] ?? ""}`}
        description="Visão geral financeira e operacional"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat icon={Users} label="Alunos ativos" value={alunos.ativos} accent="text-success" />
        <Stat
          icon={UserX}
          label="Inativos"
          value={alunos.inativos}
          accent="text-muted-foreground"
        />
        <Stat
          icon={AlertCircle}
          label="Inadimplentes"
          value={fin.inadimplentes}
          accent="text-destructive"
        />
        <Stat icon={Users} label="Total alunos" value={alunos.total} accent="text-foreground" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat
          icon={TrendingUp}
          label="Receita recebida (mês)"
          value={fmtMoney(Number(fin.receita_recebida))}
          accent="text-success"
        />
        <Stat
          icon={Calendar}
          label="Receita prevista (mês)"
          value={fmtMoney(Number(fin.receita_prevista))}
          accent="text-primary"
        />
        <Stat
          icon={AlertCircle}
          label="Vencidas"
          value={`${fin.qtd_vencidas} · ${fmtMoney(Number(fin.total_vencidas))}`}
          accent="text-destructive"
        />
        <Stat icon={Clock} label="Pendentes" value={fin.qtd_pendentes} accent="text-warning" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Stat
          icon={TrendingDown}
          label="Despesas (mês)"
          value={fmtMoney(despesasMes)}
          accent="text-warning"
        />
        <Stat
          icon={TrendingUp}
          label="Lucro (mês)"
          value={fmtMoney(lucro)}
          accent={lucro >= 0 ? "text-success" : "text-destructive"}
        />
        <Stat
          icon={Cake}
          label="Aniversariantes"
          value={aniversariantes.length}
          accent="text-primary"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 gradient-card border-border">
          <h3 className="font-semibold mb-4">Receita recebida — últimos 6 meses</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.27 0.014 250)" />
                <XAxis dataKey="mes" stroke="oklch(0.65 0.012 250)" fontSize={12} />
                <YAxis stroke="oklch(0.65 0.012 250)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.18 0.014 250)",
                    border: "1px solid oklch(0.27 0.014 250)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="Receita" fill="oklch(0.62 0.22 25)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 gradient-card border-border">
          <h3 className="font-semibold mb-4">Próximos vencimentos (7 dias)</h3>
          <div className="space-y-3">
            {proximosVencimentos.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma mensalidade vencendo nos próximos 7 dias.
              </p>
            )}
            {proximosVencimentos.map((m) => (
              <div
                key={m.id}
                className="flex justify-between text-sm border-b border-border pb-2 last:border-0"
              >
                <div>
                  <p className="font-medium truncate max-w-[180px]">{m.aluno}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(m.data_vencimento)}</p>
                </div>
                <span className="text-xs font-semibold text-warning">
                  {fmtMoney(Number(m.valor))}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {aniversariantes.length > 0 && (
        <Card className="mt-6 p-6 gradient-card border-border">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Cake className="h-4 w-4 text-primary" />
            Aniversariantes do mês
          </h3>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {aniversariantes.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-md bg-accent/30">
                <div className="h-9 w-9 rounded-full bg-primary/20 grid place-items-center text-primary text-sm font-bold">
                  {a.nome_completo.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium">{a.nome_completo}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(a.data_nascimento)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <Card className="p-5 gradient-card border-border shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={`text-xl font-bold mt-1 ${accent}`}>{value}</p>
        </div>
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
    </Card>
  );
}
