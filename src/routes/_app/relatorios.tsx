import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { fmtMoney } from "@/lib/utils";

export const Route = createFileRoute("/_app/relatorios")({
  component: RelatoriosPage,
  head: () => ({
    meta: [
      { title: "Relatórios | CT Aquiles" },
      { name: "description", content: "Relatórios financeiros e de desempenho da academia." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function RelatoriosPage() {
  const { profile } = useAuth();
  const { data } = useQuery({
    queryKey: ["relatorios", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const [p, d, a] = await Promise.all([
        supabase.from("pagamentos").select("valor, status, data_pagamento"),
        supabase.from("despesas").select("valor, data"),
        supabase.from("alunos").select("status, categoria"),
      ]);
      return { pagamentos: p.data ?? [], despesas: d.data ?? [], alunos: a.data ?? [] };
    },
  });

  const totalRecebido = (data?.pagamentos ?? []).filter((p) => p.status === "pago").reduce((s, p) => s + Number(p.valor), 0);
  const totalDespesas = (data?.despesas ?? []).reduce((s, d) => s + Number(d.valor), 0);
  const alunosAdulto = (data?.alunos ?? []).filter((a) => a.categoria === "adulto").length;
  const alunosKids = (data?.alunos ?? []).filter((a) => a.categoria === "kids").length;

  return (
    <div>
      <PageHeader title="Relatórios" description="Indicadores consolidados" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 gradient-card border-border">
          <p className="text-xs uppercase text-muted-foreground">Total recebido</p>
          <p className="text-2xl font-bold text-success mt-1">{fmtMoney(totalRecebido)}</p>
        </Card>
        <Card className="p-5 gradient-card border-border">
          <p className="text-xs uppercase text-muted-foreground">Total despesas</p>
          <p className="text-2xl font-bold text-warning mt-1">{fmtMoney(totalDespesas)}</p>
        </Card>
        <Card className="p-5 gradient-card border-border">
          <p className="text-xs uppercase text-muted-foreground">Lucro líquido</p>
          <p className="text-2xl font-bold text-primary mt-1">{fmtMoney(totalRecebido - totalDespesas)}</p>
        </Card>
        <Card className="p-5 gradient-card border-border">
          <p className="text-xs uppercase text-muted-foreground">Alunos</p>
          <p className="text-2xl font-bold mt-1">{alunosAdulto + alunosKids}</p>
          <p className="text-xs text-muted-foreground mt-1">{alunosAdulto} adulto · {alunosKids} kids</p>
        </Card>
      </div>
    </div>
  );
}
