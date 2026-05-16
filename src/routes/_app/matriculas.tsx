import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney, fmtDate, addDuracao, toISODate } from "@/lib/utils";

export const Route = createFileRoute("/_app/matriculas")({ component: MatriculasPage });

function MatriculasPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ aluno_id: "", plano_id: "", data_inicio: toISODate(new Date()), desconto: "0" });

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    const plano = data?.planos.find((p) => p.id === form.plano_id);
    const aluno = data?.alunos.find((a) => a.id === form.aluno_id);
    if (!plano || !aluno) { toast.error("Selecione aluno e plano"); return; }
    const inicio = new Date(form.data_inicio);
    const venc = addDuracao(inicio, plano.duracao as "mensal" | "trimestral" | "semestral" | "anual");
    const desconto = Number(form.desconto) || 0;
    const valorFinal = Number(plano.valor) - desconto;
    const { data: mat, error } = await supabase.from("matriculas").insert({
      tenant_id: profile.tenant_id, aluno_id: form.aluno_id, plano_id: form.plano_id,
      data_inicio: form.data_inicio, data_vencimento: toISODate(venc),
      desconto, valor_final: valorFinal,
    }).select().single();
    if (error || !mat) { toast.error(error?.message ?? "Erro"); return; }
    // criar pagamento pendente
    await supabase.from("pagamentos").insert({
      tenant_id: profile.tenant_id, matricula_id: mat.id, aluno_id: form.aluno_id,
      valor: valorFinal, data_vencimento: toISODate(venc), status: "pendente", metodo: "pix",
    });
    toast.success("Matrícula criada");
    setOpen(false);
    qc.invalidateQueries();
  };

  const updateStatus = async (id: string, status: "ativa" | "cancelada") => {
    const { error } = await supabase.from("matriculas").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Atualizado");
    qc.invalidateQueries({ queryKey: ["matriculas"] });
  };

  return (
    <div>
      <PageHeader
        title="Matrículas"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2"/>Nova matrícula</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova matrícula</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div><Label>Aluno</Label>
                  <Select value={form.aluno_id} onValueChange={(v)=>setForm({...form, aluno_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger>
                    <SelectContent>{data?.alunos.map((a)=>(<SelectItem key={a.id} value={a.id}>{a.nome_completo}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div><Label>Plano</Label>
                  <Select value={form.plano_id} onValueChange={(v)=>setForm({...form, plano_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger>
                    <SelectContent>{data?.planos.map((p)=>(<SelectItem key={p.id} value={p.id}>{p.nome} — {fmtMoney(Number(p.valor))} ({p.duracao})</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Data início</Label><Input type="date" value={form.data_inicio} onChange={(e)=>setForm({...form, data_inicio: e.target.value})}/></div>
                  <div><Label>Desconto (R$)</Label><Input type="number" step="0.01" value={form.desconto} onChange={(e)=>setForm({...form, desconto: e.target.value})}/></div>
                </div>
                <Button type="submit" className="w-full gradient-primary text-primary-foreground">Criar matrícula + pagamento</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Aluno</TableHead><TableHead>Plano</TableHead><TableHead>Início</TableHead><TableHead>Vence</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead/></TableRow></TableHeader>
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
                  {m.status !== "cancelada" ? <Button size="sm" variant="ghost" onClick={()=>updateStatus(m.id, "cancelada")}>Cancelar</Button>
                    : <Button size="sm" variant="ghost" onClick={()=>updateStatus(m.id, "ativa")}>Reativar</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
