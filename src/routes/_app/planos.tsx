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
import { fmtMoney } from "@/lib/utils";

export const Route = createFileRoute("/_app/planos")({ component: PlanosPage });

function PlanosPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", categoria: "adulto" as "adulto"|"kids", frequencia_semanal: "1", duracao: "mensal" as "mensal"|"trimestral"|"semestral"|"anual", valor: "", modalidades: "Muay Thai" });

  const { data: planos = [] } = useQuery({
    queryKey: ["planos", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => (await supabase.from("planos").select("*").order("categoria").order("valor")).data ?? [],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    const { error } = await supabase.from("planos").insert({
      tenant_id: profile.tenant_id, nome: form.nome, categoria: form.categoria,
      frequencia_semanal: Number(form.frequencia_semanal), duracao: form.duracao,
      valor: Number(form.valor), modalidades: form.modalidades.split(",").map(s=>s.trim()).filter(Boolean),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Plano criado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["planos"] });
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    await supabase.from("planos").update({ ativo: !ativo }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["planos"] });
  };

  return (
    <div>
      <PageHeader title="Planos" description="Configure planos e valores"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2"/>Novo plano</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo plano</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div><Label>Nome</Label><Input required value={form.nome} onChange={(e)=>setForm({...form, nome: e.target.value})}/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Categoria</Label>
                    <Select value={form.categoria} onValueChange={(v:"adulto"|"kids")=>setForm({...form, categoria: v})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent><SelectItem value="adulto">Adulto</SelectItem><SelectItem value="kids">Kids</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>Duração</Label>
                    <Select value={form.duracao} onValueChange={(v: any)=>setForm({...form, duracao: v})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="trimestral">Trimestral</SelectItem>
                        <SelectItem value="semestral">Semestral</SelectItem>
                        <SelectItem value="anual">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Frequência/semana</Label><Input type="number" min={1} max={7} value={form.frequencia_semanal} onChange={(e)=>setForm({...form, frequencia_semanal: e.target.value})}/></div>
                  <div><Label>Valor (R$)</Label><Input type="number" step="0.01" required value={form.valor} onChange={(e)=>setForm({...form, valor: e.target.value})}/></div>
                </div>
                <div><Label>Modalidades (vírgula)</Label><Input value={form.modalidades} onChange={(e)=>setForm({...form, modalidades: e.target.value})}/></div>
                <Button type="submit" className="w-full gradient-primary text-primary-foreground">Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Modalidades</TableHead><TableHead>Freq</TableHead><TableHead>Duração</TableHead><TableHead>Valor</TableHead><TableHead/></TableRow></TableHeader>
          <TableBody>
            {planos.map((p: any) => (
              <TableRow key={p.id} className={!p.ativo ? "opacity-50" : ""}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell><StatusBadge status={p.categoria}/></TableCell>
                <TableCell className="text-sm">{p.modalidades?.join(", ")}</TableCell>
                <TableCell>{p.frequencia_semanal}x</TableCell>
                <TableCell className="capitalize">{p.duracao}</TableCell>
                <TableCell className="font-semibold text-primary">{fmtMoney(Number(p.valor))}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={()=>toggleAtivo(p.id, p.ativo)}>{p.ativo ? "Desativar" : "Ativar"}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
