import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney, fmtDate, toISODate } from "@/lib/utils";

export const Route = createFileRoute("/_app/pagamentos")({
  component: PagamentosPage,
  head: () => ({
    meta: [
      { title: "Pagamentos | CT Aquiles" },
      { name: "description", content: "Mensalidades, status de pagamento e inadimplência." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const EMPTY = {
  aluno_id: "",
  valor: "",
  data_vencimento: toISODate(new Date()),
  data_pagamento: "",
  metodo: "pix" as "pix" | "dinheiro" | "cartao" | "boleto",
  status: "pendente" as "pendente" | "pago" | "atrasado",
  observacoes: "",
};

function effectiveStatus(p: any): "pago" | "pendente" | "atrasado" {
  if (p.status === "pago") return "pago";
  const today = toISODate(new Date());
  if (p.data_vencimento < today) return "atrasado";
  return "pendente";
}

function PagamentosPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState<{ id: string } | null>(null);

  const [fStatus, setFStatus] = useState<string>("todos");
  const [fAluno, setFAluno] = useState<string>("todos");
  const [fMes, setFMes] = useState<string>(new Date().toISOString().slice(0, 7));

  const { data } = useQuery({
    queryKey: ["pagamentos", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const [p, a] = await Promise.all([
        supabase.from("pagamentos").select("*, alunos(nome_completo)").order("data_vencimento", { ascending: false }),
        supabase.from("alunos").select("id, nome_completo").order("nome_completo"),
      ]);
      return { pagamentos: p.data ?? [], alunos: a.data ?? [] };
    },
  });

  const startCreate = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };
  const startEdit = (p: any) => {
    setEditingId(p.id);
    setForm({
      aluno_id: p.aluno_id,
      valor: String(p.valor),
      data_vencimento: p.data_vencimento,
      data_pagamento: p.data_pagamento ?? "",
      metodo: p.metodo,
      status: p.status,
      observacoes: p.observacoes ?? "",
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    if (!form.aluno_id) { toast.error("Selecione um aluno"); return; }
    if (!form.valor) { toast.error("Informe o valor"); return; }

    const payload = {
      tenant_id: profile.tenant_id,
      aluno_id: form.aluno_id,
      valor: Number(form.valor),
      data_vencimento: form.data_vencimento,
      data_pagamento: form.data_pagamento || null,
      metodo: form.metodo,
      status: form.status,
      observacoes: form.observacoes || null,
      matricula_id: null,
    };

    const { error } = editingId
      ? await supabase.from("pagamentos").update(payload).eq("id", editingId)
      : await supabase.from("pagamentos").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editingId ? "Pagamento atualizado" : "Pagamento registrado");
    setOpen(false);
    qc.invalidateQueries();
  };

  const doDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("pagamentos").delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Pagamento excluído");
    qc.invalidateQueries({ queryKey: ["pagamentos"] });
  };

  const filtered = useMemo(() => {
    return (data?.pagamentos ?? []).filter((p: any) => {
      const status = effectiveStatus(p);
      if (fStatus !== "todos" && status !== fStatus) return false;
      if (fAluno !== "todos" && p.aluno_id !== fAluno) return false;
      if (fMes && !p.data_vencimento?.startsWith(fMes)) return false;
      return true;
    });
  }, [data, fStatus, fAluno, fMes]);

  const statusBadge = (s: "pago" | "pendente" | "atrasado") => {
    const map = {
      pago: "bg-success/20 text-success border-success/30",
      pendente: "bg-warning/20 text-warning border-warning/30",
      atrasado: "bg-destructive/20 text-destructive border-destructive/30",
    };
    return <Badge variant="outline" className={`uppercase ${map[s]}`}>{s}</Badge>;
  };

  return (
    <div>
      <PageHeader
        title="Pagamentos"
        description="Controle manual de mensalidades"
        actions={
          <Button className="gradient-primary text-primary-foreground" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2"/>Registrar pagamento
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Editar pagamento" : "Registrar pagamento"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div><Label>Aluno</Label>
              <Select value={form.aluno_id} onValueChange={(v)=>setForm({...form, aluno_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger>
                <SelectContent>{data?.alunos.map((a: any)=>(<SelectItem key={a.id} value={a.id}>{a.nome_completo}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor (R$)</Label><Input type="number" step="0.01" required value={form.valor} onChange={(e)=>setForm({...form, valor: e.target.value})}/></div>
              <div><Label>Método</Label>
                <Select value={form.metodo} onValueChange={(v: any)=>setForm({...form, metodo: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Data vencimento</Label><Input type="date" required value={form.data_vencimento} onChange={(e)=>setForm({...form, data_vencimento: e.target.value})}/></div>
              <div><Label>Data pagamento</Label><Input type="date" value={form.data_pagamento} onChange={(e)=>setForm({...form, data_pagamento: e.target.value, status: e.target.value ? "pago" : form.status})}/></div>
              <div className="col-span-2"><Label>Status</Label>
                <Select value={form.status} onValueChange={(v: any)=>setForm({...form, status: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e)=>setForm({...form, observacoes: e.target.value})}/></div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground">
              {editingId ? "Salvar alterações" : "Registrar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
                <SelectItem value="atrasado">Atrasado</SelectItem>
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
            <Label className="text-xs">Mês/ano</Label>
            <Input type="month" value={fMes} onChange={(e)=>setFMes(e.target.value)}/>
          </div>
        </div>
      </Card>

      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Aluno</TableHead><TableHead>Valor</TableHead><TableHead>Vencimento</TableHead><TableHead>Pago em</TableHead><TableHead>Método</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum pagamento</TableCell></TableRow>}
            {filtered.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.alunos?.nome_completo ?? "—"}</TableCell>
                <TableCell className="font-semibold">{fmtMoney(Number(p.valor))}</TableCell>
                <TableCell className="text-sm">{fmtDate(p.data_vencimento)}</TableCell>
                <TableCell className="text-sm">{fmtDate(p.data_pagamento)}</TableCell>
                <TableCell className="text-sm uppercase">{p.metodo}</TableCell>
                <TableCell>{statusBadge(effectiveStatus(p))}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={()=>startEdit(p)} title="Editar"><Pencil className="h-4 w-4"/></Button>
                    <Button size="icon" variant="ghost" onClick={()=>setDeleting({ id: p.id })} title="Excluir" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Excluir pagamento"
        description="Tem certeza que deseja excluir este pagamento? Esta ação não pode ser desfeita."
        onConfirm={doDelete}
      />
    </div>
  );
}
