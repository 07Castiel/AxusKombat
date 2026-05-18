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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/horarios")({ component: HorariosPage });

const DIAS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"] as const;
const LBL: Record<string, string> = { segunda: "Segunda", terca: "Terça", quarta: "Quarta", quinta: "Quinta", sexta: "Sexta", sabado: "Sábado", domingo: "Domingo" };

const EMPTY = {
  dias: [] as string[],
  hora: "",
  hora_fim: "",
  modalidade_id: "",
  professor: "",
  categoria: "adulto" as "adulto" | "kids",
  capacidade_maxima: "",
  observacao: "",
};

function HorariosPage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState<{ id: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["horarios-full", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const [h, m] = await Promise.all([
        supabase.from("horarios").select("*, modalidades(nome)").order("dia").order("hora"),
        supabase.from("modalidades").select("*").eq("ativo", true).order("nome"),
      ]);
      return { horarios: h.data ?? [], modalidades: m.data ?? [] };
    },
  });

  const startCreate = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };
  const startEdit = (h: any) => {
    setEditingId(h.id);
    setForm({
      dias: [h.dia],
      hora: String(h.hora).slice(0, 5),
      hora_fim: h.hora_fim ? String(h.hora_fim).slice(0, 5) : "",
      modalidade_id: h.modalidade_id,
      professor: h.professor ?? "",
      categoria: h.categoria,
      capacidade_maxima: h.capacidade_maxima?.toString() ?? "",
      observacao: h.observacao ?? "",
    });
    setOpen(true);
  };

  const toggleDia = (d: string) => {
    setForm((f) => ({ ...f, dias: f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d] }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    if (form.dias.length === 0) { toast.error("Selecione ao menos um dia da semana"); return; }
    if (!form.modalidade_id) { toast.error("Selecione a modalidade"); return; }

    const base = {
      tenant_id: profile.tenant_id,
      modalidade_id: form.modalidade_id,
      hora: form.hora,
      hora_fim: form.hora_fim || null,
      professor: form.professor || null,
      categoria: form.categoria,
      capacidade_maxima: form.capacidade_maxima ? Number(form.capacidade_maxima) : null,
      observacao: form.observacao || null,
    };

    type Dia = "domingo" | "segunda" | "terca" | "quarta" | "quinta" | "sexta" | "sabado";
    if (editingId) {
      const { error } = await supabase.from("horarios").update({ ...base, dia: form.dias[0] as Dia }).eq("id", editingId);
      if (error) { toast.error(error.message); return; }
      toast.success("Horário atualizado");
    } else {
      const rows = form.dias.map((dia) => ({ ...base, dia: dia as Dia }));
      const { error } = await supabase.from("horarios").insert(rows);
      if (error) { toast.error(error.message); return; }
      toast.success(`${rows.length} horário(s) criado(s)`);
    }
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["horarios-full"] });
  };

  const doDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("horarios").delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Horário excluído");
    qc.invalidateQueries({ queryKey: ["horarios-full"] });
  };

  return (
    <div>
      <PageHeader
        title="Horários"
        description="Grade semanal de aulas"
        actions={
          isAdmin && (
            <Button className="gradient-primary text-primary-foreground" onClick={startCreate}>
              <Plus className="h-4 w-4 mr-2"/>Novo horário
            </Button>
          )
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingId ? "Editar horário" : "Novo horário"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Dia(s) da semana</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {DIAS.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={form.dias.includes(d)} onCheckedChange={() => toggleDia(d)} disabled={!!editingId && form.dias[0] !== d && form.dias.length > 0 && editingId !== null} />
                    {LBL[d]}
                  </label>
                ))}
              </div>
              {editingId && <p className="text-xs text-muted-foreground mt-1">Ao editar, apenas o primeiro dia será aplicado.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Hora início</Label><Input type="time" required value={form.hora} onChange={(e)=>setForm({...form, hora: e.target.value})}/></div>
              <div><Label>Hora término</Label><Input type="time" value={form.hora_fim} onChange={(e)=>setForm({...form, hora_fim: e.target.value})}/></div>
              <div><Label>Modalidade</Label>
                <Select value={form.modalidade_id} onValueChange={(v)=>setForm({...form, modalidade_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger>
                  <SelectContent>{data?.modalidades.map((m: any)=>(<SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div><Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v: any)=>setForm({...form, categoria: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="adulto">Adulto</SelectItem><SelectItem value="kids">Kids</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Professor</Label><Input value={form.professor} onChange={(e)=>setForm({...form, professor: e.target.value})}/></div>
              <div><Label>Capacidade máx.</Label><Input type="number" min="1" value={form.capacidade_maxima} onChange={(e)=>setForm({...form, capacidade_maxima: e.target.value})}/></div>
            </div>
            <div><Label>Observações</Label><Textarea value={form.observacao} onChange={(e)=>setForm({...form, observacao: e.target.value})}/></div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground">
              {editingId ? "Salvar alterações" : "Criar horário(s)"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Grade visual */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
        {DIAS.map((dia) => {
          const aulas = (data?.horarios ?? []).filter((h: any) => h.dia === dia);
          return (
            <Card key={dia} className="gradient-card border-border p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{LBL[dia]}</h3>
              <div className="space-y-1.5">
                {aulas.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
                {aulas.map((a: any) => (
                  <div key={a.id} className={`p-2 rounded-md border-l-2 ${a.categoria === "kids" ? "border-warning bg-warning/5" : "border-primary bg-primary/5"}`}>
                    <p className="text-xs font-semibold">{String(a.hora).slice(0,5)}{a.hora_fim ? `–${String(a.hora_fim).slice(0,5)}` : ""}</p>
                    <p className="text-[10px] text-muted-foreground">{a.modalidades?.nome}{a.categoria === "kids" ? " Kids" : ""}</p>
                    {a.professor && <p className="text-[10px] text-muted-foreground">{a.professor}</p>}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Tabela completa */}
      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Dia</TableHead><TableHead>Horário</TableHead><TableHead>Modalidade</TableHead><TableHead>Categoria</TableHead><TableHead>Professor</TableHead><TableHead>Capacidade</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data?.horarios ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum horário cadastrado</TableCell></TableRow>}
            {data?.horarios.map((h: any) => (
              <TableRow key={h.id}>
                <TableCell className="capitalize">{LBL[h.dia]}</TableCell>
                <TableCell>{String(h.hora).slice(0,5)}{h.hora_fim ? `–${String(h.hora_fim).slice(0,5)}` : ""}</TableCell>
                <TableCell>{h.modalidades?.nome}</TableCell>
                <TableCell className="capitalize">{h.categoria}</TableCell>
                <TableCell>{h.professor ?? "—"}</TableCell>
                <TableCell>{h.capacidade_maxima ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {isAdmin && (
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={()=>startEdit(h)} title="Editar"><Pencil className="h-4 w-4"/></Button>
                      <Button size="icon" variant="ghost" onClick={()=>setDeleting({ id: h.id })} title="Excluir" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Excluir horário"
        description="Tem certeza que deseja excluir este horário? Esta ação não pode ser desfeita."
        onConfirm={doDelete}
      />
    </div>
  );
}
