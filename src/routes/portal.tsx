import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Award, CalendarDays, CreditCard, Loader2, LogIn, LogOut, Swords } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate, fmtMoney } from "@/lib/utils";
import {
  getStudentPortalData,
  studentPortalLogin,
  studentPortalLogout,
} from "@/lib/student-portal.functions";
import logo from "@/assets/axus-kombat-logo.png";

export const Route = createFileRoute("/portal")({
  component: StudentPortalPage,
  head: () => ({
    meta: [
      { title: "Portal do Aluno | Axus Kombat" },
      { name: "description", content: "Consulte mensalidades, horários e graduações no Portal do Aluno Axus Kombat." },
      { property: "og:title", content: "Portal do Aluno | Axus Kombat" },
      { property: "og:description", content: "Acesso seguro às informações do aluno." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-background text-foreground noise-bg">
      <header className="border-b border-primary/20">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-5">
          <img src={logo} alt="Axus Kombat" className="h-12 w-12 object-contain" />
          <div>
            <p className="font-display text-[10px] uppercase tracking-[0.3em] text-metal">Axus Kombat</p>
            <p className="font-display text-lg uppercase tracking-widest text-metal-light">Portal do Aluno</p>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

function StudentPortalPage() {
  const queryClient = useQueryClient();
  const login = useServerFn(studentPortalLogin);
  const logout = useServerFn(studentPortalLogout);
  const [matricula, setMatricula] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["student-portal"],
    queryFn: () => getStudentPortalData(),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["student-portal"] });

  const onLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login({ data: { matricula } });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally { setSubmitting(false); }
  };

  const onLogout = async () => {
    await logout();
    queryClient.setQueryData(["student-portal"], { authenticated: false });
  };

  if (isLoading) return <PortalShell><main className="grid min-h-[70vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main></PortalShell>;

  if (!data?.authenticated) {
    return (
      <PortalShell>
        <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-10">
          <Card className="w-full border-border p-6 sm:p-8">
            <div className="mb-6 text-center">
              <LogIn className="mx-auto h-8 w-8 text-primary" />
              <h1 className="mt-3 font-display text-2xl uppercase tracking-widest">Entrar no portal</h1>
               <p className="mt-2 text-sm text-muted-foreground">Use o número de matrícula fornecido pela sua academia.</p>
            </div>
            <form className="space-y-4" onSubmit={onLogin}>
              <div className="space-y-1.5"><Label htmlFor="matricula">Matrícula</Label><Input id="matricula" autoComplete="username" required value={matricula} onChange={(e) => setMatricula(e.target.value.toUpperCase())} placeholder="AXK-XXXXXXXX" /></div>
              <Button className="w-full" type="submit" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}</Button>
            </form>
             <p className="mt-5 text-center text-xs text-muted-foreground">Não sabe sua matrícula? Solicite o número diretamente à academia.</p>
          </Card>
        </main>
      </PortalShell>
    );
  }

  const monthly = data.mensalidades ?? [];
  const schedules = data.horarios ?? [];
  const graduations = data.graduacoes ?? [];
  const pendingTotal = monthly.filter((item) => item.status === "pendente" || item.status === "vencido").reduce((sum, item) => sum + Number(item.valor_final ?? item.valor), 0);

  return (
    <PortalShell>
      <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs uppercase tracking-widest text-metal">{data.aluno.academia}</p><h1 className="font-display text-2xl uppercase tracking-wider">{data.aluno.nome_completo}</h1><p className="text-xs text-muted-foreground">Categoria: {data.aluno.categoria}</p></div>
          <Button variant="outline" size="sm" onClick={onLogout}><LogOut className="mr-2 h-4 w-4" />Sair</Button>
        </div>

        <section><h2 className="mb-3 flex items-center gap-2 font-display text-sm uppercase tracking-widest text-metal-light"><CreditCard className="h-4 w-4 text-primary" />Mensalidades{pendingTotal > 0 && <span className="ml-auto font-bold text-destructive">{fmtMoney(pendingTotal)} em aberto</span>}</h2><div className="grid gap-2">{monthly.length === 0 && <Card className="p-4 text-sm text-muted-foreground">Nenhuma mensalidade registrada.</Card>}{monthly.map((item) => <Card key={item.id} className="flex items-center justify-between p-3"><div><p className="text-sm font-medium">{item.competencia}</p><p className="text-xs text-muted-foreground">Vence em {fmtDate(item.data_vencimento)}</p></div><div className="text-right"><p className="font-bold">{fmtMoney(Number(item.valor_final ?? item.valor))}</p><p className={`text-[10px] uppercase tracking-widest ${STATUS_COLOR[item.status] ?? ""}`}>{item.status}</p></div></Card>)}</div></section>

        <section><h2 className="mb-3 flex items-center gap-2 font-display text-sm uppercase tracking-widest text-metal-light"><CalendarDays className="h-4 w-4 text-primary" />Próximos horários</h2><div className="grid gap-2 sm:grid-cols-2">{schedules.length === 0 && <Card className="p-4 text-sm text-muted-foreground">Nenhum horário disponível.</Card>}{schedules.map((item) => <Card key={item.id} className="p-3"><div className="flex items-center gap-2"><Swords className="h-3.5 w-3.5 text-primary" /><p className="text-sm font-medium">{item.modalidade}</p></div><p className="mt-1 text-xs text-muted-foreground">{DIAS_LABEL[item.dia] ?? item.dia} · {item.hora?.slice(0, 5)}{item.hora_fim ? `–${item.hora_fim.slice(0, 5)}` : ""}{item.professor ? ` · ${item.professor}` : ""}</p></Card>)}</div></section>

        <section><h2 className="mb-3 flex items-center gap-2 font-display text-sm uppercase tracking-widest text-metal-light"><Award className="h-4 w-4 text-primary" />Histórico de graduação</h2><div className="grid gap-2">{graduations.length === 0 && <Card className="p-4 text-sm text-muted-foreground">Nenhuma graduação registrada.</Card>}{graduations.map((item, index) => <Card key={`${item.data}-${index}`} className="flex items-center justify-between p-3"><div><p className="text-sm font-medium">{item.graduacao_nova ?? "—"}</p>{item.observacoes && <p className="mt-0.5 text-xs text-muted-foreground">{item.observacoes}</p>}</div><p className="text-xs text-muted-foreground">{fmtDate(item.data)}</p></Card>)}</div></section>
      </main>
    </PortalShell>
  );
}