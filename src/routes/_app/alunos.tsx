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
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/alunos")({ component: AlunosPage });

function AlunosPage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    nome_completo: "", telefone: "", data_nascimento: "", categoria: "adulto" as "adulto" | "kids",
    responsavel_nome: "", responsavel_telefone: "", contato_emergencia: "", observacoes_medicas: "",
    peso: "", altura: "",
  });

  const { data: alunos = [] } = useQuery({
    queryKey: ["alunos", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => (await supabase.from("alunos").select("*").order("nome_completo")).data ?? [],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    const isMenor = form.data_nascimento && new Date(form.data_nascimento) > new Date(Date.now() - 18*365*24*3600*1000);
    if (isMenor && !form.responsavel_nome) { toast.error("Responsável obrigatório para menores"); return; }
    const { error } = await supabase.from("alunos").insert({
      tenant_id: profile.tenant_id,
      nome_completo: form.nome_completo, telefone: form.telefone || null,
      data_nascimento: form.data_nascimento || null, categoria: form.categoria,
      responsavel_nome: form.responsavel_nome || null, responsavel_telefone: form.responsavel_telefone || null,
      contato_emergencia: form.contato_emergencia || null, observacoes_medicas: form.observacoes_medicas || null,
      peso: form.peso ? Number(form.peso) : null, altura: form.altura ? Number(form.altura) : null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Aluno cadastrado");
    setOpen(false);
    setForm({ nome_completo: "", telefone: "", data_nascimento: "", categoria: "adulto", responsavel_nome: "", responsavel_telefone: "", contato_emergencia: "", observacoes_medicas: "", peso: "", altura: "" });
    qc.invalidateQueries({ queryKey: ["alunos"] });
  };

  const toggleStatus = async (id: string, current: string) => {
    const next = current === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase.from("alunos").update({ status: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(next === "ativo" ? "Aluno reativado" : "Aluno cancelado (inativo)");
    qc.invalidateQueries({ queryKey: ["alunos"] });
  };

  const filtered = alunos.filter((a) => a.nome_completo.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Alunos"
        description={`${alunos.length} alunos cadastrados`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2"/>Novo aluno</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Novo aluno</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Label>Nome completo *</Label><Input required value={form.nome_completo} onChange={(e)=>setForm({...form, nome_completo: e.target.value})}/></div>
                <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e)=>setForm({...form, telefone: e.target.value})}/></div>
                <div><Label>Data nascimento</Label><Input type="date" value={form.data_nascimento} onChange={(e)=>setForm({...form, data_nascimento: e.target.value})}/></div>
                <div><Label>Categoria *</Label>
                  <Select value={form.categoria} onValueChange={(v: "adulto"|"kids")=>setForm({...form, categoria: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="adulto">Adulto</SelectItem><SelectItem value="kids">Kids</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Peso (kg)</Label><Input type="number" step="0.1" value={form.peso} onChange={(e)=>setForm({...form, peso: e.target.value})}/></div>
                <div><Label>Altura (m)</Label><Input type="number" step="0.01" value={form.altura} onChange={(e)=>setForm({...form, altura: e.target.value})}/></div>
                <div><Label>Contato emergência</Label><Input value={form.contato_emergencia} onChange={(e)=>setForm({...form, contato_emergencia: e.target.value})}/></div>
                <div className="col-span-2"><Label>Responsável (obrigatório se menor)</Label><Input value={form.responsavel_nome} onChange={(e)=>setForm({...form, responsavel_nome: e.target.value})}/></div>
                <div className="col-span-2"><Label>Telefone responsável</Label><Input value={form.responsavel_telefone} onChange={(e)=>setForm({...form, responsavel_telefone: e.target.value})}/></div>
                <div className="col-span-2"><Label>Observações médicas</Label><Textarea value={form.observacoes_medicas} onChange={(e)=>setForm({...form, observacoes_medicas: e.target.value})}/></div>
                <Button type="submit" className="col-span-2 gradient-primary text-primary-foreground">Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="p-4 gradient-card border-border mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
          <Input placeholder="Buscar aluno..." value={search} onChange={(e)=>setSearch(e.target.value)} className="pl-9"/>
        </div>
      </Card>

      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Status</TableHead><TableHead>Telefone</TableHead><TableHead>Entrada</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum aluno encontrado</TableCell></TableRow>}
            {filtered.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.nome_completo}</TableCell>
                <TableCell><StatusBadge status={a.categoria}/></TableCell>
                <TableCell><StatusBadge status={a.status}/></TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.telefone ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(a.data_entrada)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={()=>toggleStatus(a.id, a.status)}>{a.status === "ativo" ? "Cancelar" : "Reativar"}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
