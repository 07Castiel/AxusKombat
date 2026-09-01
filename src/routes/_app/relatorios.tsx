import { RequireTela } from "@/components/RequireRole";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  comTabelasPendentes,
  type RelatorioPeriodo,
} from "@/integrations/supabase/tabelas-pendentes";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtMoney } from "@/lib/utils";
import { Download, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_app/relatorios")({
  component: RelatoriosPageProtegido,
  head: () => ({
    meta: [
      { title: "Relatórios | Axus Kombat" },
      { name: "description", content: "Relatórios financeiros e de desempenho da academia." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function RelatoriosPage() {
  const { profile } = useAuth();
  const [from, setFrom] = useState(firstDayOfMonth(new Date(Date.now() - 5 * 30 * 86400000)));
  const [to, setTo] = useState(lastDayOfMonth());

  const { data } = useQuery({
    queryKey: ["relatorios", profile?.tenant_id, from, to],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      // Agregação no Postgres (A4). A versão anterior baixava mensalidades,
      // despesas e alunos do período e somava aqui — sujeito ao mesmo corte
      // silencioso de 1000 linhas do PostgREST que atingia o painel.
      const { data, error } = await comTabelasPendentes(supabase).rpc("relatorio_periodo", {
        p_de: from,
        p_ate: to,
      });
      if (error) throw error;
      return data as RelatorioPeriodo | null;
    },
  });

  const totais = data?.totais ?? { recebido: 0, vencido: 0, pendente: 0 };
  const totalRecebido = Number(totais.recebido);
  const totalVencido = Number(totais.vencido);
  const totalPendente = Number(totais.pendente);
  const totalDespesas = Number(data?.despesas ?? 0);
  const lucro = totalRecebido - totalDespesas;

  const monthly = (data?.mensal ?? []).map((m) => ({
    mes: m.mes,
    receita: Number(m.receita),
    despesa: Number(m.despesa),
  }));
  const ranking = (data?.inadimplentes ?? []).map((r) => ({
    nome: r.nome,
    atrasadas: Number(r.atrasadas),
    total: Number(r.total),
  }));
  const despesasPorCat = (data?.despesas_por_categoria ?? []).map((c) => ({
    categoria: c.categoria,
    total: Number(c.total),
  }));

  const comp = data?.composicao_alunos ?? { adulto: 0, kids: 0, ativos: 0, total: 0 };
  const alunosAdulto = comp.adulto;
  const alunosKids = comp.kids;

  const exportCSV = () => {
    const lines = [
      ["Relatório Axus Kombat", `${from} a ${to}`].join(","),
      "",
      ["Indicador", "Valor"].join(","),
      ["Total recebido", totalRecebido].join(","),
      ["Total vencido", totalVencido].join(","),
      ["Total pendente", totalPendente].join(","),
      ["Total despesas", totalDespesas].join(","),
      ["Lucro líquido", lucro].join(","),
      "",
      ["Mês", "Receita", "Despesa"].join(","),
      ...monthly.map((m) => [m.mes, m.receita, m.despesa].join(",")),
      "",
      ["Top inadimplentes (aluno, mensalidades atrasadas, total devido)"].join(","),
      ...ranking.map((r) => [r.nome, r.atrasadas, r.total].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Indicadores consolidados do período selecionado"
        actions={
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        }
      />

      <Card className="p-4 gradient-card border-border mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label>De</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Até</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFrom(firstDayOfMonth());
                setTo(lastDayOfMonth());
              }}
            >
              Mês atual
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date();
                d.setFullYear(d.getFullYear() - 1);
                setFrom(d.toISOString().slice(0, 10));
                setTo(lastDayOfMonth());
              }}
            >
              Últimos 12m
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card className="p-5 gradient-card border-border">
          <p className="text-xs uppercase text-muted-foreground">Recebido</p>
          <p className="text-2xl font-bold text-success mt-1">{fmtMoney(totalRecebido)}</p>
        </Card>
        <Card className="p-5 gradient-card border-border">
          <p className="text-xs uppercase text-muted-foreground">Vencido</p>
          <p className="text-2xl font-bold text-destructive mt-1">{fmtMoney(totalVencido)}</p>
        </Card>
        <Card className="p-5 gradient-card border-border">
          <p className="text-xs uppercase text-muted-foreground">Pendente</p>
          <p className="text-2xl font-bold text-warning mt-1">{fmtMoney(totalPendente)}</p>
        </Card>
        <Card className="p-5 gradient-card border-border">
          <p className="text-xs uppercase text-muted-foreground">Despesas</p>
          <p className="text-2xl font-bold text-warning mt-1">{fmtMoney(totalDespesas)}</p>
        </Card>
        <Card className="p-5 gradient-card border-border">
          <p className="text-xs uppercase text-muted-foreground">Lucro líquido</p>
          <p
            className={`text-2xl font-bold mt-1 ${lucro >= 0 ? "text-primary" : "text-destructive"}`}
          >
            {fmtMoney(lucro)}
          </p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-5 gradient-card border-border">
          <h3 className="font-display uppercase tracking-wider text-sm text-metal-light mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Receita vs. Despesa
          </h3>
          {monthly.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Sem dados no período</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="receita" fill="#16a34a" name="Receita" />
                <Bar dataKey="despesa" fill="#B50000" name="Despesa" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5 gradient-card border-border">
          <h3 className="font-display uppercase tracking-wider text-sm text-metal-light mb-3">
            Despesas por categoria
          </h3>
          {despesasPorCat.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Sem despesas no período
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={despesasPorCat} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="categoria" type="category" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Bar dataKey="total" fill="#B50000" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="gradient-card border-border overflow-hidden">
          <h3 className="font-display uppercase tracking-wider text-sm text-metal-light p-5 pb-3">
            Top 10 inadimplentes
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aluno</TableHead>
                <TableHead className="text-right">Em atraso</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                    Nenhum aluno em atraso 🎉
                  </TableCell>
                </TableRow>
              )}
              {ranking.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell className="text-right">{r.atrasadas}</TableCell>
                  <TableCell className="text-right font-bold text-destructive">
                    {fmtMoney(r.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-5 gradient-card border-border">
          <h3 className="font-display uppercase tracking-wider text-sm text-metal-light mb-4">
            Composição de alunos
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-metal-light">Adulto</span>
                <span className="font-bold">{alunosAdulto}</span>
              </div>
              <div className="h-2 bg-muted rounded overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(alunosAdulto / Math.max(1, comp.total)) * 100}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-metal-light">Kids</span>
                <span className="font-bold">{alunosKids}</span>
              </div>
              <div className="h-2 bg-muted rounded overflow-hidden">
                <div
                  className="h-full bg-warning"
                  style={{ width: `${(alunosKids / Math.max(1, comp.total)) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-3 border-t border-border mt-3">
              Total de {comp.total} alunos cadastrados ({comp.ativos} ativos)
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function RelatoriosPageProtegido() {
  return (
    <RequireTela tela="/relatorios">
      <RelatoriosPage />
    </RequireTela>
  );
}
