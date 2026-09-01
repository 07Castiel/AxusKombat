import { RequireTela } from "@/components/RequireRole";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, RotateCcw, Ban, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { translateError } from "@/lib/errors";
import { fmtMoney, fmtDate, toISODate } from "@/lib/utils";
import { registrarPagamento, cancelarMensalidade, reabrirMensalidade, processarMensalidadesAgora } from "@/lib/mensalidades.functions";

export const Route = createFileRoute("/_app/financeiro")({
  component: FinanceiroPageProtegido,
  head: () => ({
    meta: [
      { title: "Financeiro | Axus Kombat" },
      { name: "description", content: "Mensalidades recorrentes, recebimentos e inadimplência." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const STATUS_BADGE: Record<string, string> = {
  pago: "bg-success/20 text-success border-success/30",
  pendente: "bg-warning/20 text-warning border-warning/30",
  vencido: "bg-destructive/20 text-destructive border-destructive/30",
  cancelado: "bg-muted text-muted-foreground border-border",
};

function FinanceiroPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const registrarFn = useServerFn(registrarPagamento);
  const cancelarFn = useServerFn(cancelarMensalidade);
  const reabrirFn = useServerFn(reabrirMensalidade);
  const processarFn = useServerFn(processarMensalidadesAgora);

  const [fStatus, setFStatus] = useState<string>("todos");
  const [fAluno, setFAluno] = useState<string>("todos");
  const [fMes, setFMes] = useState<string>(new Date().toISOString().slice(0, 7));

  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [pay, setPay] = useState({
    data_pagamento: toISODate(new Date()),
    forma_pagamento: "pix" as "pix" | "dinheiro" | "cartao" | "boleto",
    desconto: "0",
    observacoes: "",
  });

  const { data } = useQuery({
    queryKey: ["mensalidades", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const [m, a] = await Promise.all([
        supabase.from("mensalidades").select("*, alunos(nome_completo)").order("data_vencimento", { ascending: false }),
        supabase.from("alunos").select("id, nome_completo").order("nome_completo"),
      ]);
      return { mensalidades: (m.data ?? []) as any[], alunos: a.data ?? [] };
    },
  });

  const filtered = useMemo(() => {
    return (data?.mensalidades ?? []).filter((m: any) => {
      if (fStatus !== "todos" && m.status !== fStatus) return false;
      if (fAluno !== "todos" && m.aluno_id !== fAluno) return false;
      if (fMes && !m.competencia?.startsWith(fMes)) return false;
      return true;
    });
  }, [data, fStatus, fAluno, fMes]);

  const totals = useMemo(() => {
    const acc = { recebido: 0, previsto: 0, vencido: 0, pendente: 0 };
    for (const m of filtered) {
      const v = Number(m.valor_final ?? m.valor);
      if (m.status === "pago") acc.recebido += v;
      if (m.status !== "cancelado") acc.previsto += v;
      if (m.status === "vencido") acc.vencido += v;
      if (m.status === "pendente") acc.pendente += v;
    }
    return acc;
  }, [filtered]);

  const openPay = (m: any) => {
    setPayTarget(m);
    setPay({
      data_pagamento: toISODate(new Date()),
      forma_pagamento: "pix",
      desconto: m.desconto ? String(m.desconto) : "0",
      observacoes: "",
    });
    setPayOpen(true);
  };

  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    try {
      await registrarFn({ data: {
        mensalidade_id: payTarget.id,
        data_pagamento: pay.data_pagamento,
        forma_pagamento: pay.forma_pagamento,
        desconto: Number(pay.desconto) || 0,
        observacoes: pay.observacoes || null,
      }});
      toast.success("Pagamento registrado");
      setPayOpen(false);
      qc.invalidateQueries({ queryKey: ["mensalidades"] });
    } catch (err: any) { toast.error(translateError(err)); }
  };

  const doCancelar = async (id: string) => {
    try { await cancelarFn({ data: { mensalidade_id: id }}); toast.success("Mensalidade cancelada"); qc.invalidateQueries({ queryKey: ["mensalidades"] }); }
    catch (e: any) { toast.error(translateError(e)); }
  };
  const doReabrir = async (id: string) => {
    try { await reabrirFn({ data: { mensalidade_id: id }}); toast.success("Mensalidade reaberta"); qc.invalidateQueries({ queryKey: ["mensalidades"] }); }
    catch (e: any) { toast.error(translateError(e)); }
  };
  const doProcessar = async () => {
    try {
      const r: any = await processarFn();
      toast.success(`Processado: ${r?.geradas ?? 0} geradas, ${r?.marcadas_vencidas ?? 0} marcadas vencidas`);
      qc.invalidateQueries({ queryKey: ["mensalidades"] });
    } catch (e: any) { toast.error(translateError(e)); }
  };

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Mensalidades recorrentes e recebimentos"
        actions={
          <Button variant="outline" onClick={doProcessar}>
            <RefreshCw className="h-4 w-4 mr-2" /> Processar agora
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Mini label="Recebido (filtro)" value={fmtMoney(totals.recebido)} cls="text-success" />
        <Mini label="Previsto (filtro)" value={fmtMoney(totals.previsto)} cls="text-primary" />
        <Mini label="Vencido" value={fmtMoney(totals.vencido)} cls="text-destructive" />
        <Mini label="Pendente" value={fmtMoney(totals.pendente)} cls="text-warning" />
      </div>

      <Card className="p-4 gradient-card border-border mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Aluno</Label>
            <Select value={fAluno} onValueChange={setFAluno}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {data?.alunos.map((a: any)=>(<SelectItem key={a.id} value={a.id}>{a.nome_completo}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Competência (mês/ano)</Label>
            <Input type="month" value={fMes} onChange={(e)=>setFMes(e.target.value)}/>
          </div>
        </div>
      </Card>

      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aluno</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Desconto</TableHead>
              <TableHead>Pago em</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhuma mensalidade no filtro</TableCell></TableRow>}
            {filtered.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.alunos?.nome_completo ?? "—"}</TableCell>
                <TableCell className="text-sm">{m.competencia ? new Date(m.competencia + "T12:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "—"}</TableCell>
                <TableCell className="text-sm">{fmtDate(m.data_vencimento)}</TableCell>
                <TableCell className="font-semibold">{fmtMoney(Number(m.valor_final ?? m.valor))}</TableCell>
                <TableCell className="text-sm">{Number(m.desconto) > 0 ? fmtMoney(Number(m.desconto)) : "—"}</TableCell>
                <TableCell className="text-sm">{fmtDate(m.data_pagamento)}</TableCell>
                <TableCell className="text-sm uppercase">{m.forma_pagamento ?? "—"}</TableCell>
                <TableCell><Badge variant="outline" className={`uppercase ${STATUS_BADGE[m.status]}`}>{m.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    {m.status !== "pago" && m.status !== "cancelado" && (
                      <Button size="icon" variant="ghost" onClick={()=>openPay(m)} title="Registrar pagamento"><CheckCircle2 className="h-4 w-4 text-success"/></Button>
                    )}
                    {m.status === "pago" && (
                      <Button size="icon" variant="ghost" onClick={()=>doReabrir(m.id)} title="Reabrir"><RotateCcw className="h-4 w-4"/></Button>
                    )}
                    {m.status !== "cancelado" && (
                      <Button size="icon" variant="ghost" onClick={()=>doCancelar(m.id)} title="Cancelar" className="text-destructive"><Ban className="h-4 w-4"/></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription>
              {payTarget?.alunos?.nome_completo} — {fmtMoney(Number(payTarget?.valor ?? 0))} (vence em {fmtDate(payTarget?.data_vencimento)})
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPay} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data do pagamento *</Label><Input type="date" required value={pay.data_pagamento} onChange={(e)=>setPay({...pay, data_pagamento: e.target.value})}/></div>
              <div><Label>Forma *</Label>
                <Select value={pay.forma_pagamento} onValueChange={(v: any)=>setPay({...pay, forma_pagamento: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Desconto (R$)</Label><Input type="number" step="0.01" min="0" value={pay.desconto} onChange={(e)=>setPay({...pay, desconto: e.target.value})}/></div>
              <div className="col-span-2"><Label>Observações</Label><Textarea rows={2} value={pay.observacoes} onChange={(e)=>setPay({...pay, observacoes: e.target.value})}/></div>
            </div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground">Confirmar pagamento</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Mini({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <Card className="p-4 gradient-card border-border">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold mt-1 ${cls}`}>{value}</p>
    </Card>
  );
}

function FinanceiroPageProtegido() {
  return (
    <RequireTela tela="/financeiro">
      <FinanceiroPage />
    </RequireTela>
  );
}
