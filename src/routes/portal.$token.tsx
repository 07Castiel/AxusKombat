import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { Award, CalendarDays, CreditCard, Swords } from "lucide-react";
import logo from "@/assets/axus-kombat-logo.png";

export const Route = createFileRoute("/portal/$token")({
  component: PortalAluno,
  head: ({ params }) => ({
    meta: [
      { title: `Portal do Aluno | Axus Kombat` },
      { name: "description", content: "Portal de auto-atendimento do aluno." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const DIAS_LABEL: Record<string, string> = {
  segunda: "Seg", terca: "Ter", quarta: "Qua", quinta: "Qui",
  sexta: "Sex", sabado: "Sáb", domingo: "Dom",
};
const STATUS_COLOR: Record<string, string> = {
  pago: "text-success", pendente: "text-warning", vencido: "text-destructive", cancelado: "text-muted-foreground",
};

function PortalAluno() {
  const { token } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["portal", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portal_aluno_dados", { p_token: token });
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;
  }
  if (!data) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="p-8 max-w-md text-center gradient-card border-border">
          <h1 className="font-display text-xl uppercase tracking-widest mb-2">Link inválido</h1>
          <p className="text-sm text-muted-foreground">Este portal não existe ou foi desativado. Entre em contato com a academia.</p>
        </Card>
      </div>
    );
  }

  const aluno = data.aluno;
  const mens = (data.mensalidades ?? []) as any[];
  const horarios = (data.horarios ?? []) as any[];
  const grad = (data.graduacoes ?? []) as any[];

  const pendentes = mens.filter((m) => m.status === "pendente" || m.status === "vencido");
  const totalPendente = pendentes.reduce((s, m) => s + Number(m.valor_final ?? m.valor), 0);

  return (
    <div className="min-h-screen bg-background text-foreground noise-bg">
      <header className="border-b" style={{ borderColor: "rgba(181,0,0,0.2)" }}>
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center gap-3">
          <img src={logo} alt="Axus Kombat" className="h-12 w-12 object-contain"/>
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.3em] text-metal">Portal do Aluno</p>
            <h1 className="font-display text-lg uppercase tracking-widest text-metal-light">{aluno.academia}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <Card className="p-6 gradient-card border-border">
          <p className="text-xs uppercase tracking-widest text-metal mb-1">Bem-vindo</p>
          <h2 className="font-display text-2xl uppercase tracking-wider">{aluno.nome_completo}</h2>
          <p className="text-xs text-muted-foreground mt-1">Categoria: {aluno.categoria}</p>
        </Card>

        <section>
          <h3 className="font-display uppercase tracking-widest text-sm text-metal-light mb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary"/> Mensalidades
            {totalPendente > 0 && (
              <span className="ml-auto text-destructive font-bold">{fmtMoney(totalPendente)} em aberto</span>
            )}
          </h3>
          <div className="grid gap-2">
            {mens.length === 0 && <Card className="p-4 gradient-card border-border text-sm text-muted-foreground">Nenhuma mensalidade registrada.</Card>}
            {mens.slice(0, 12).map((m) => (
              <Card key={m.id} className="p-3 gradient-card border-border flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{m.competencia}</p>
                  <p className="text-xs text-muted-foreground">Vence em {fmtDate(m.data_vencimento)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{fmtMoney(Number(m.valor_final ?? m.valor))}</p>
                  <p className={`text-[10px] uppercase tracking-widest ${STATUS_COLOR[m.status] ?? ""}`}>{m.status}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-display uppercase tracking-widest text-sm text-metal-light mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary"/> Próximos horários
          </h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {horarios.length === 0 && <Card className="p-4 gradient-card border-border text-sm text-muted-foreground">Nenhum horário disponível.</Card>}
            {horarios.map((h) => (
              <Card key={h.id} className="p-3 gradient-card border-border">
                <div className="flex items-center gap-2">
                  <Swords className="h-3.5 w-3.5 text-primary"/>
                  <p className="font-medium text-sm">{h.modalidade}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {DIAS_LABEL[h.dia] ?? h.dia} · {h.hora?.slice(0,5)}{h.hora_fim ? `–${h.hora_fim.slice(0,5)}` : ""}
                  {h.professor ? ` · ${h.professor}` : ""}
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-display uppercase tracking-widest text-sm text-metal-light mb-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-primary"/> Histórico de graduação
          </h3>
          <div className="grid gap-2">
            {grad.length === 0 && <Card className="p-4 gradient-card border-border text-sm text-muted-foreground">Nenhuma graduação registrada.</Card>}
            {grad.map((g, i) => (
              <Card key={i} className="p-3 gradient-card border-border flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{g.graduacao_nova ?? "—"}</p>
                  {g.observacoes && <p className="text-xs text-muted-foreground mt-0.5">{g.observacoes}</p>}
                </div>
                <p className="text-xs text-muted-foreground">{fmtDate(g.data)}</p>
              </Card>
            ))}
          </div>
        </section>

        <p className="text-center text-[10px] uppercase tracking-widest text-muted-foreground pt-6">Axus Kombat · Portal do Aluno</p>
      </main>
    </div>
  );
}
