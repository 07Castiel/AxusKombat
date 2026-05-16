import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Users, UserX, AlertCircle, TrendingUp, TrendingDown, Cake } from "lucide-react";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/")({ component: Dashboard });

function Dashboard() {
  const { profile } = useAuth();

  const { data } = useQuery({
    queryKey: ["dashboard", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const [alunos, pagamentos, despesas] = await Promise.all([
        supabase.from("alunos").select("id, nome_completo, status, data_nascimento, foto_url"),
        supabase.from("pagamentos").select("id, valor, status, data_pagamento, data_vencimento, aluno_id"),
        supabase.from("despesas").select("id, valor, data"),
      ]);
      return {
        alunos: alunos.data ?? [],
        pagamentos: pagamentos.data ?? [],
        despesas: despesas.data ?? [],
      };
    },
  });

  const alunos = data?.alunos ?? [];
  const pagamentos = data?.pagamentos ?? [];
  const despesas = data?.despesas ?? [];

  const ativos = alunos.filter((a) => a.status === "ativo").length;
  const inativos = alunos.filter((a) => a.status === "inativo").length;
  const hoje = new Date().toISOString().slice(0, 10);
  const inadimplentes = new Set(pagamentos.filter((p) => p.status === "atrasado" || (p.status === "pendente" && p.data_vencimento < hoje)).map((p) => p.aluno_id)).size;

  const mesAtual = new Date().toISOString().slice(0, 7);
  const faturamento = pagamentos.filter((p) => p.status === "pago" && p.data_pagamento?.startsWith(mesAtual)).reduce((s, p) => s + Number(p.valor), 0);
  const despesasMes = despesas.filter((d) => d.data?.startsWith(mesAtual)).reduce((s, d) => s + Number(d.valor), 0);
  const lucro = faturamento - despesasMes;

  // últimos 6 meses
  const chart = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
    const ym = d.toISOString().slice(0, 7);
    const rec = pagamentos.filter((p) => p.status === "pago" && p.data_pagamento?.startsWith(ym)).reduce((s, p) => s + Number(p.valor), 0);
    return { mes: d.toLocaleDateString("pt-BR", { month: "short" }), Receita: rec };
  });

  const aniversariantes = alunos.filter((a) => {
    if (!a.data_nascimento) return false;
    const dn = new Date(a.data_nascimento);
    const h = new Date();
    return dn.getMonth() === h.getMonth();
  });

  const pagamentosRecentes = [...pagamentos].sort((a, b) => (b.data_pagamento ?? "").localeCompare(a.data_pagamento ?? "")).slice(0, 5);

  return (
    <div>
      <PageHeader title={`Olá, ${profile?.nome_completo.split(" ")[0]}`} description="Visão geral da sua academia" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat icon={Users} label="Alunos Ativos" value={ativos} accent="text-success" />
        <Stat icon={UserX} label="Inativos" value={inativos} accent="text-muted-foreground" />
        <Stat icon={AlertCircle} label="Inadimplentes" value={inadimplentes} accent="text-destructive" />
        <Stat icon={TrendingUp} label="Faturamento (mês)" value={fmtMoney(faturamento)} accent="text-primary" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat icon={TrendingDown} label="Despesas (mês)" value={fmtMoney(despesasMes)} accent="text-warning" />
        <Stat icon={TrendingUp} label="Lucro (mês)" value={fmtMoney(lucro)} accent={lucro >= 0 ? "text-success" : "text-destructive"} />
        <Stat icon={Cake} label="Aniversariantes" value={aniversariantes.length} accent="text-primary" />
        <Stat icon={Users} label="Total alunos" value={alunos.length} accent="text-foreground" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 gradient-card border-border">
          <h3 className="font-semibold mb-4">Receita — últimos 6 meses</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.27 0.014 250)" />
                <XAxis dataKey="mes" stroke="oklch(0.65 0.012 250)" fontSize={12} />
                <YAxis stroke="oklch(0.65 0.012 250)" fontSize={12} />
                <Tooltip contentStyle={{ background: "oklch(0.18 0.014 250)", border: "1px solid oklch(0.27 0.014 250)", borderRadius: 8 }} />
                <Bar dataKey="Receita" fill="oklch(0.62 0.22 25)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 gradient-card border-border">
          <h3 className="font-semibold mb-4">Pagamentos recentes</h3>
          <div className="space-y-3">
            {pagamentosRecentes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento ainda.</p>}
            {pagamentosRecentes.map((p) => (
              <div key={p.id} className="flex justify-between text-sm border-b border-border pb-2 last:border-0">
                <div>
                  <p className="font-medium">{fmtMoney(Number(p.valor))}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(p.data_pagamento ?? p.data_vencimento)}</p>
                </div>
                <span className={`text-xs uppercase font-semibold ${p.status === "pago" ? "text-success" : p.status === "atrasado" ? "text-destructive" : "text-warning"}`}>{p.status}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {aniversariantes.length > 0 && (
        <Card className="mt-6 p-6 gradient-card border-border">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Cake className="h-4 w-4 text-primary"/>Aniversariantes do mês</h3>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {aniversariantes.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-md bg-accent/30">
                <div className="h-9 w-9 rounded-full bg-primary/20 grid place-items-center text-primary text-sm font-bold">{a.nome_completo.charAt(0)}</div>
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

function Stat({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string | number; accent: string }) {
  return (
    <Card className="p-5 gradient-card border-border shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
        </div>
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
    </Card>
  );
}
