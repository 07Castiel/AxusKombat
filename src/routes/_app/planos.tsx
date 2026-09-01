import { RequireAdmin } from "@/components/RequireRole";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { translateError, firstZodMessage } from "@/lib/errors";
import { planoSchema } from "@/lib/validators";
import { fmtMoney } from "@/lib/utils";

export const Route = createFileRoute("/_app/planos")({
  component: PlanosPageProtegido,
  head: () => ({
    meta: [
      { title: "Planos | Axus Kombat" },
      { name: "description", content: "Gerencie planos de mensalidade da academia." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Duracao = "mensal" | "trimestral" | "semestral" | "anual" | "personalizado";
type Categoria = "adulto" | "kids";

const EMPTY = {
  nome: "",
  descricao: "",
  categoria: "adulto" as Categoria,
  frequencia_semanal: "1",
  duracao: "mensal" as Duracao,
  dias_personalizado: "",
  valor: "",
  modalidades: "",
  ativo: true,
};

function PlanosPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState<{ id: string; nome: string; vinculadas: number } | null>(null);

  const { data: planos = [] } = useQuery({
    queryKey: ["planos", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => (await supabase.from("planos").select("*").order("categoria").order("valor")).data ?? [],
  });

  const startCreate = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };
  const startEdit = (p: any) => {
    setEditingId(p.id);
    setForm({
      nome: p.nome,
      descricao: p.descricao ?? "",
      categoria: p.categoria,
      frequencia_semanal: String(p.frequencia_semanal ?? 1),
      duracao: p.duracao,
      dias_personalizado: p.dias_personalizado ? String(p.dias_personalizado) : "",
      valor: String(p.valor),
      modalidades: (p.modalidades ?? []).join(", "),
      ativo: p.ativo,
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    const parsed = planoSchema.safeParse({
      nome: form.nome,
      valor: form.valor,
      duracao: form.duracao,
      dias_personalizado: form.duracao === "personalizado" ? form.dias_personalizado : undefined,
      categoria: form.categoria,
      modalidades: form.modalidades.split(",").map((s) => s.trim()).filter(Boolean),
      descricao: form.descricao,
    });
    if (!parsed.success) { toast.error(firstZodMessage(parsed.error)); return; }
    const payload = {
      tenant_id: profile.tenant_id,
      nome: form.nome,
      descricao: form.descricao || null,
      categoria: form.categoria,
      frequencia_semanal: Number(form.frequencia_semanal),
      duracao: form.duracao,
      dias_personalizado: form.duracao === "personalizado" ? Number(form.dias_personalizado) : null,
      valor: Number(form.valor),
      modalidades: form.modalidades.split(",").map((s) => s.trim()).filter(Boolean),
      ativo: form.ativo,
    };
    const { error } = editingId
      ? await supabase.from("planos").update(payload).eq("id", editingId)
      : await supabase.from("planos").insert(payload);
    if (error) { toast.error(translateError(error)); return; }
    toast.success(editingId ? "Plano atualizado" : "Plano criado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["planos"] });
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    const { error } = await supabase.from("planos").update({ ativo: !ativo }).eq("id", id);
    if (error) { toast.error(translateError(error)); return; }
    toast.success(!ativo ? "Plano ativado" : "Plano desativado");
    qc.invalidateQueries({ queryKey: ["planos"] });
  };

  const askDelete = async (p: any) => {
    const { count } = await supabase
      .from("contratos")
      .select("*", { count: "exact", head: true })
      .eq("plano_id", p.id)
      .eq("status", "ativo");
    setDeleting({ id: p.id, nome: p.nome, vinculadas: count ?? 0 });
  };

  const doDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("planos").delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Plano excluído");
    qc.invalidateQueries({ queryKey: ["planos"] });
  };

  return (
    <div>
      <PageHeader
        title="Planos"
        description="Configure planos e valores"
        actions={
          <Button className="gradient-primary text-primary-foreground" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2"/>Novo plano
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingId ? "Editar plano" : "Novo plano"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Nome *</Label><Input required value={form.nome} onChange={(e)=>setForm({...form, nome: e.target.value})} placeholder="Ex: Plano Mensal"/></div>
            <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e)=>setForm({...form, descricao: e.target.value})} rows={2}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v: Categoria)=>setForm({...form, categoria: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="adulto">Adulto</SelectItem><SelectItem value="kids">Kids</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Duração *</Label>
                <Select value={form.duracao} onValueChange={(v: Duracao)=>setForm({...form, duracao: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="semestral">Semestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                    <SelectItem value="personalizado">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.duracao === "personalizado" && (
                <div><Label>Dias *</Label><Input type="number" min={1} required value={form.dias_personalizado} onChange={(e)=>setForm({...form, dias_personalizado: e.target.value})}/></div>
              )}
              <div><Label>Frequência/semana</Label><Input type="number" min={1} max={7} value={form.frequencia_semanal} onChange={(e)=>setForm({...form, frequencia_semanal: e.target.value})}/></div>
              <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" required value={form.valor} onChange={(e)=>setForm({...form, valor: e.target.value})}/></div>
              <div><Label>Status</Label>
                <Select value={form.ativo ? "ativo" : "inativo"} onValueChange={(v) => setForm({...form, ativo: v === "ativo"})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Modalidades (separar por vírgula)</Label><Input value={form.modalidades} onChange={(e)=>setForm({...form, modalidades: e.target.value})} placeholder="Ex: Muay Thai, Boxe"/></div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="flex-1 gradient-primary text-primary-foreground">
                {editingId ? "Salvar alterações" : "Salvar plano"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {planos.length === 0 ? (
        <Card className="gradient-card border-border p-12 text-center">
          <Wallet className="h-12 w-12 mx-auto text-metal mb-4" />
          <p className="text-muted-foreground mb-4">Nenhum plano cadastrado ainda.</p>
          <Button className="gradient-primary text-primary-foreground" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2"/>Criar plano
          </Button>
        </Card>
      ) : (
        <Card className="gradient-card border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Descrição</TableHead><TableHead>Valor</TableHead><TableHead>Duração</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {planos.map((p: any) => (
                <TableRow key={p.id} className={!p.ativo ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{p.descricao ?? "—"}</TableCell>
                  <TableCell className="font-semibold text-primary">{fmtMoney(Number(p.valor))}</TableCell>
                  <TableCell className="capitalize text-sm">
                    {p.duracao === "personalizado" ? `${p.dias_personalizado ?? "?"} dias` : p.duracao}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => toggleAtivo(p.id, p.ativo)} className={`px-2 py-1 rounded text-[10px] uppercase font-semibold tracking-wider ${p.ativo ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {p.ativo ? "Ativo" : "Inativo"}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(p)} aria-label="Editar plano"><Pencil className="h-4 w-4"/></Button>
                      <Button size="icon" variant="ghost" onClick={() => askDelete(p)} aria-label="Excluir plano" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Excluir plano"
        description={
          deleting?.vinculadas
            ? `Este plano está vinculado a ${deleting.vinculadas} matrícula(s) ativa(s). Tem certeza que deseja excluir o plano "${deleting?.nome}"? Esta ação não pode ser desfeita.`
            : `Tem certeza que deseja excluir o plano "${deleting?.nome}"? Esta ação não pode ser desfeita.`
        }
        onConfirm={doDelete}
      />
    </div>
  );
}

function PlanosPageProtegido() {
  return (
    <RequireAdmin>
      <PlanosPage />
    </RequireAdmin>
  );
}
