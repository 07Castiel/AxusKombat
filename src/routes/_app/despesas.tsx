import { RequireTela } from "@/components/RequireRole";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { translateError } from "@/lib/errors";
import { fmtDate, fmtMoney, toISODate } from "@/lib/utils";
import { upsertDespesa, deleteDespesa } from "@/lib/despesas.functions";

export const Route = createFileRoute("/_app/despesas")({
  component: DespesasPageProtegido,
  head: () => ({
    meta: [
      { title: "Despesas | Axus Kombat" },
      { name: "description", content: "Controle de despesas da academia." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const CATEGORIAS = ["Aluguel", "Energia", "Água", "Internet", "Material", "Salário", "Manutenção", "Marketing", "Impostos", "Outros"];
const EMPTY = { id: "", descricao: "", categoria: "Outros", valor: "", data: toISODate(new Date()), observacoes: "" };

function DespesasPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertDespesa);
  const deleteFn = useServerFn(deleteDespesa);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState<{ id: string; desc: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [filtroMes, setFiltroMes] = useState(toISODate(new Date()).slice(0, 7));
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");

  const { data: despesas = [] } = useQuery({
    queryKey: ["despesas", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("despesas").select("*").order("data", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return despesas.filter((d: any) => {
      if (filtroMes && !d.data?.startsWith(filtroMes)) return false;
      if (filtroCategoria !== "todas" && d.categoria !== filtroCategoria) return false;
      return true;
    });
  }, [despesas, filtroMes, filtroCategoria]);

  const total = filtered.reduce((s: number, d: any) => s + Number(d.valor), 0);

  const startCreate = () => { setForm(EMPTY); setOpen(true); };
  const startEdit = (d: any) => {
    setForm({
      id: d.id, descricao: d.descricao ?? "", categoria: d.categoria ?? "Outros",
      valor: String(d.valor ?? ""), data: d.data ?? toISODate(new Date()),
      observacoes: d.observacoes ?? "",
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertFn({ data: {
        id: form.id || undefined,
        descricao: form.descricao, categoria: form.categoria,
        valor: Number(form.valor), data: form.data,
        observacoes: form.observacoes || null,
      }});
      toast.success(form.id ? "Despesa atualizada" : "Despesa cadastrada");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["despesas"] });
    } catch (err: any) {
      toast.error(translateError(err));
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await deleteFn({ data: { id: deleting.id } });
      toast.success("Despesa excluída");
      qc.invalidateQueries({ queryKey: ["despesas"] });
    } catch (err: any) { toast.error(translateError(err)); }
    finally { setDeleting(null); }
  };

  return (
    <div>
      <PageHeader
        title="Despesas"
        description={`${filtered.length} despesas no período · ${fmtMoney(total)}`}
        actions={
          <Button className="gradient-primary text-primary-foreground" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2"/>Nova despesa
          </Button>
        }
      />

      <Card className="p-4 gradient-card border-border mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Mês</Label>
            <Input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="mt-1.5"/>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="mt-1.5"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => { setFiltroMes(""); setFiltroCategoria("todas"); }}>
              Limpar filtros
            </Button>
          </div>
        </div>
      </Card>

      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50"/>Nenhuma despesa neste período
              </TableCell></TableRow>
            )}
            {filtered.map((d: any) => (
              <TableRow key={d.id}>
                <TableCell className="text-sm">{fmtDate(d.data)}</TableCell>
                <TableCell className="font-medium">{d.descricao}</TableCell>
                <TableCell className="text-xs uppercase tracking-wider text-muted-foreground">{d.categoria}</TableCell>
                <TableCell className="text-right font-bold text-warning">{fmtMoney(Number(d.valor))}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(d)}><Pencil className="h-3.5 w-3.5"/></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting({ id: d.id, desc: d.descricao })}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive"/>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar despesa" : "Nova despesa"}</DialogTitle>
            <DialogDescription>Registre os custos da academia para acompanhar o lucro líquido.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div><Label>Descrição *</Label><Input required value={form.descricao} onChange={(e) => setForm({...form, descricao: e.target.value})}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Categoria *</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({...form, categoria: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Data *</Label><Input type="date" required value={form.data} onChange={(e) => setForm({...form, data: e.target.value})}/></div>
            </div>
            <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" required value={form.valor} onChange={(e) => setForm({...form, valor: e.target.value})}/></div>
            <div><Label>Observações</Label><Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({...form, observacoes: e.target.value})}/></div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="gradient-primary text-primary-foreground" disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Excluir despesa?"
        description={deleting ? `Tem certeza que deseja excluir "${deleting.desc}"?` : ""}
        onConfirm={doDelete}
      />
    </div>
  );
}

function DespesasPageProtegido() {
  return (
    <RequireTela tela="/despesas">
      <DespesasPage />
    </RequireTela>
  );
}
