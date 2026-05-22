import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { translateError } from "@/lib/errors";
import { fmtMoney, fmtDate, addDuracao, toISODate } from "@/lib/utils";

export const Route = createFileRoute("/_app/matriculas")({
  component: MatriculasPage,
  head: () => ({
    meta: [
      { title: "Matrículas | CT Aquiles" },
      { name: "description", content: "Controle de matrículas dos alunos por plano." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const EMPTY = {
  aluno_id: "", plano_id: "",
  data_inicio: toISODate(new Date()),
  data_vencimento: "",
  valor_final: "",
  desconto: "0",
  observacoes: "",
};

function MatriculasPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState<{ id: string; nome: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["matriculas", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const [m, a, p] = await Promise.all([
        supabase.from("matriculas").select("*, alunos(nome_completo, categoria), planos(nome, valor, duracao)").order("created_at", { ascending: false }),
        supabase.from("alunos").select("id, nome_completo, categoria").eq("status", "ativo").order("nome_completo"),
        supabase.from("planos").select("*").eq("ativo", true).order("nome"),
      ]);
      return { matriculas: m.data ?? [], alunos: a.data ?? [], planos: p.data ?? [] };
    },
  });

  const startCreate = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };
  const startEdit = (m: any) => {
    setEditingId(m.id);
    setForm({
      aluno_id: m.aluno_id, plano_id: m.plano_id,
      data_inicio: m.data_inicio, data_vencimento: m.data_vencimento,
      valor_final: String(m.valor_final), desconto: String(m.desconto ?? 0),
      observacoes: m.observacoes ?? "",
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    const plano = data?.planos.find((p: any) => p.id === form.plano_id);
    if (!plano) { toast.error("Selecione um plano"); return; }
    if (!form.aluno_id) { toast.error("Selecione um aluno"); return; }

    const desconto = Number(form.desconto) || 0;
    const valorFinal = form.valor_final
      ? Number(form.valor_final)
      : Number(plano.valor) - desconto;
    const venc = form.data_vencimento
      ? form.data_vencimento
      : toISODate(addDuracao(new Date(form.data_inicio), plano.duracao, plano.dias_personalizado));

    const payload = {
      tenant_id: profile.tenant_id,
      aluno_id: form.aluno_id, plano_id: form.plano_id,
      data_inicio: form.data_inicio, data_vencimento: venc,
      desconto, valor_final: valorFinal,
      observacoes: form.observacoes || null,
    };

    if (editingId) {
      const { error } = await supabase.from("matriculas").update(payload).eq("id", editingId);
      if (error) { toast.error(translateError(error)); return; }
      toast.success("Matrícula atualizada");
    } else {
      const { data: mat, error } = await supabase.from("matriculas").insert(payload).select().single();
      if (error || !mat) { toast.error(error?.message ?? "Erro"); return; }
      await supabase.from("pagamentos").insert({
        tenant_id: profile.tenant_id, matricula_id: mat.id, aluno_id: form.aluno_id,
        valor: valorFinal, data_vencimento: venc, status: "pendente", metodo: "pix",
      });
      toast.success("Matrícula criada + primeiro pagamento gerado");
    }
    setOpen(false);
    qc.invalidateQueries();
  };

  const updateStatus = async (id: string, status: "ativa" | "cancelada") => {
    const { error } = await supabase.from("matriculas").update({ status }).eq("id", id);
    if (error) { toast.error(translateError(error)); return; }
    toast.success(status === "ativa" ? "Matrícula reativada" : "Matrícula cancelada");
    qc.invalidateQueries({ queryKey: ["matriculas"] });
  };

  const doDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("matriculas").delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Matrícula excluída");
    qc.invalidateQueries({ queryKey: ["matriculas"] });
  };

  return (
    <div>
      <PageHeader
        title="Matrículas"
        actions={
          <Button className="gradient-primary text-primary-foreground" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2"/>Nova matrícula
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingId ? "Editar matrícula" : "Nova matrícula"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Aluno</Label>
              <Select value={form.aluno_id} onValueChange={(v)=>setForm({...form, aluno_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger>
                <SelectContent>{data?.alunos.map((a: any)=>(<SelectItem key={a.id} value={a.id}>{a.nome_completo}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div><Label>Plano</Label>
              <Select value={form.plano_id} onValueChange={(v)=>setForm({...form, plano_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger>
                <SelectContent>{data?.planos.map((p: any)=>(<SelectItem key={p.id} value={p.id}>{p.nome} — {fmtMoney(Number(p.valor))} ({p.duracao})</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data início</Label><Input type="date" value={form.data_inicio} onChange={(e)=>setForm({...form, data_inicio: e.target.value})}/></div>
              <div><Label>Data vencimento {editingId ? "" : "(auto)"}</Label><Input type="date" value={form.data_vencimento} onChange={(e)=>setForm({...form, data_vencimento: e.target.value})}/></div>
              <div><Label>Desconto (R$)</Label><Input type="number" step="0.01" value={form.desconto} onChange={(e)=>setForm({...form, desconto: e.target.value})}/></div>
              <div><Label>Valor final (opcional)</Label><Input type="number" step="0.01" placeholder="Calculado do plano" value={form.valor_final} onChange={(e)=>setForm({...form, valor_final: e.target.value})}/></div>
            </div>
            <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e)=>setForm({...form, observacoes: e.target.value})}/></div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground">
              {editingId ? "Salvar alterações" : "Criar matrícula"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Aluno</TableHead><TableHead>Plano</TableHead><TableHead>Início</TableHead><TableHead>Vence</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data?.matriculas ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma matrícula</TableCell></TableRow>}
            {data?.matriculas.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.alunos?.nome_completo}</TableCell>
                <TableCell className="text-sm">{m.planos?.nome}</TableCell>
                <TableCell className="text-sm">{fmtDate(m.data_inicio)}</TableCell>
                <TableCell className="text-sm">{fmtDate(m.data_vencimento)}</TableCell>
                <TableCell className="font-semibold">{fmtMoney(Number(m.valor_final))}</TableCell>
                <TableCell><StatusBadge status={m.status}/></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={()=>startEdit(m)} title="Editar"><Pencil className="h-4 w-4"/></Button>
                    <Button size="icon" variant="ghost" onClick={()=>updateStatus(m.id, m.status === "cancelada" ? "ativa" : "cancelada")} title={m.status === "cancelada" ? "Reativar" : "Cancelar"}><RotateCcw className="h-4 w-4"/></Button>
                    <Button size="icon" variant="ghost" onClick={()=>setDeleting({ id: m.id, nome: m.alunos?.nome_completo ?? "matrícula" })} title="Excluir" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
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
        title="Excluir matrícula"
        description={`Tem certeza que deseja excluir a matrícula de ${deleting?.nome}? Esta ação não pode ser desfeita.`}
        onConfirm={doDelete}
      />
    </div>
  );
}
