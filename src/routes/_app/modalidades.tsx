import { RequireTela } from "@/components/RequireRole";
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
import { Plus, Pencil, Trash2, Swords } from "lucide-react";
import { toast } from "sonner";
import { translateError, firstZodMessage } from "@/lib/errors";
import { modalidadeSchema } from "@/lib/validators";

export const Route = createFileRoute("/_app/modalidades")({
  component: ModalidadesPageProtegido,
  head: () => ({
    meta: [
      { title: "Modalidades | Axus Kombat" },
      { name: "description", content: "Gerencie as modalidades e artes marciais da academia." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const EMPTY = { nome: "", descricao: "", termo_graduacao: "Faixa", ativo: true };

function ModalidadesPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState<{ id: string; nome: string; uso: number } | null>(null);

  const { data: modalidades = [] } = useQuery({
    queryKey: ["modalidades", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => (await supabase.from("modalidades").select("*").order("nome")).data ?? [],
  });

  const startCreate = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };
  const startEdit = (m: any) => {
    setEditingId(m.id);
    setForm({
      nome: m.nome,
      descricao: m.descricao ?? "",
      termo_graduacao: m.termo_graduacao ?? "Graduação",
      ativo: m.ativo,
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    const parsed = modalidadeSchema.safeParse({
      nome: form.nome, termo_graduacao: form.termo_graduacao, descricao: form.descricao,
    });
    if (!parsed.success) { toast.error(firstZodMessage(parsed.error)); return; }
    const payload = {
      tenant_id: profile.tenant_id,
      nome: form.nome,
      descricao: form.descricao || null,
      termo_graduacao: form.termo_graduacao || "Graduação",
      ativo: form.ativo,
    };
    const { error } = editingId
      ? await supabase.from("modalidades").update(payload).eq("id", editingId)
      : await supabase.from("modalidades").insert(payload);
    if (error) { toast.error(translateError(error)); return; }
    toast.success(editingId ? "Modalidade atualizada" : "Modalidade criada");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["modalidades"] });
  };

  const askDelete = async (m: any) => {
    const [{ count: horarios }, { count: graduacoes }] = await Promise.all([
      supabase.from("horarios").select("*", { count: "exact", head: true }).eq("modalidade_id", m.id),
      supabase.from("graduacoes").select("*", { count: "exact", head: true }).eq("modalidade_id", m.id),
    ]);
    setDeleting({ id: m.id, nome: m.nome, uso: (horarios ?? 0) + (graduacoes ?? 0) });
  };

  const doDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("modalidades").delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Modalidade excluída");
    qc.invalidateQueries({ queryKey: ["modalidades"] });
  };

  return (
    <div>
      <PageHeader
        title="Modalidades"
        description="Artes marciais oferecidas pela academia"
        actions={
          <Button className="gradient-primary text-primary-foreground" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2"/>Nova modalidade
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Editar modalidade" : "Nova modalidade"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Nome *</Label><Input required value={form.nome} onChange={(e)=>setForm({...form, nome: e.target.value})} placeholder="Ex: Jiu-Jitsu, Muay Thai, Karatê"/></div>
            <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e)=>setForm({...form, descricao: e.target.value})} rows={2}/></div>
            <div>
              <Label>Termo de graduação *</Label>
              <Input required value={form.termo_graduacao} onChange={(e)=>setForm({...form, termo_graduacao: e.target.value})} placeholder="Ex: Faixa, Grau, Cinto, Dan, Kyu, Nível..."/>
              <p className="text-[11px] text-muted-foreground mt-1">Nome que essa modalidade usa para suas graduações.</p>
            </div>
            <div><Label>Status</Label>
              <Select value={form.ativo ? "ativo" : "inativo"} onValueChange={(v) => setForm({...form, ativo: v === "ativo"})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="flex-1 gradient-primary text-primary-foreground">
                {editingId ? "Salvar alterações" : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {modalidades.length === 0 ? (
        <Card className="gradient-card border-border p-12 text-center">
          <Swords className="h-12 w-12 mx-auto text-metal mb-4" />
          <p className="text-muted-foreground mb-4">Nenhuma modalidade cadastrada ainda.</p>
          <Button className="gradient-primary text-primary-foreground" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2"/>Adicionar Modalidade
          </Button>
        </Card>
      ) : (
        <Card className="gradient-card border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Descrição</TableHead><TableHead>Termo de graduação</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {modalidades.map((m: any) => (
                <TableRow key={m.id} className={!m.ativo ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{m.descricao ?? "—"}</TableCell>
                  <TableCell className="text-sm">{m.termo_graduacao}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-[10px] uppercase font-semibold tracking-wider ${m.ativo ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {m.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(m)} aria-label="Editar"><Pencil className="h-4 w-4"/></Button>
                      <Button size="icon" variant="ghost" onClick={() => askDelete(m)} aria-label="Excluir" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
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
        title="Excluir modalidade"
        description={
          deleting?.uso
            ? `Esta modalidade está vinculada a ${deleting.uso} registro(s) (horários/graduações). Tem certeza que deseja excluir "${deleting?.nome}"? Esta ação não pode ser desfeita.`
            : `Tem certeza que deseja excluir a modalidade "${deleting?.nome}"? Esta ação não pode ser desfeita.`
        }
        onConfirm={doDelete}
      />
    </div>
  );
}

function ModalidadesPageProtegido() {
  return (
    <RequireTela tela="/modalidades">
      <ModalidadesPage />
    </RequireTela>
  );
}
