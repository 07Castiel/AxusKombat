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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { fmtDate, toISODate } from "@/lib/utils";

export const Route = createFileRoute("/_app/graduacoes")({
  component: GraduacoesPage,
  head: () => ({
    meta: [
      { title: "Graduações | CT Aquiles" },
      { name: "description", content: "Faixas, graduação dos alunos e ranking." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function GraduacoesPage() {
  const { profile } = useAuth();
  return (
    <div>
      <PageHeader title="Graduações" description="Faixas, atribuições e ranking" />
      <Tabs defaultValue="faixas">
        <TabsList className="mb-4">
          <TabsTrigger value="faixas">Faixas</TabsTrigger>
          <TabsTrigger value="atribuir">Atribuir</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
        </TabsList>
        <TabsContent value="faixas"><FaixasTab tenantId={profile?.tenant_id ?? null}/></TabsContent>
        <TabsContent value="atribuir"><AtribuirTab tenantId={profile?.tenant_id ?? null}/></TabsContent>
        <TabsContent value="ranking"><RankingTab tenantId={profile?.tenant_id ?? null}/></TabsContent>
      </Tabs>
    </div>
  );
}

/* ----- Tab 1: Faixas ----- */
const EMPTY_FAIXA = { nome: "", cor: "#dc2626", ordem: "0", categoria: "adulto" as "adulto" | "kids" };

function FaixasTab({ tenantId }: { tenantId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FAIXA);
  const [deleting, setDeleting] = useState<{ id: string; nome: string } | null>(null);

  const { data: graduacoes = [] } = useQuery({
    queryKey: ["graduacoes", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("graduacoes").select("*").order("ordem", { ascending: false })).data ?? [],
  });

  const startCreate = () => { setEditingId(null); setForm(EMPTY_FAIXA); setOpen(true); };
  const startEdit = (g: any) => {
    setEditingId(g.id);
    setForm({ nome: g.nome, cor: g.cor ?? "#dc2626", ordem: String(g.ordem), categoria: g.categoria });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    const payload = { tenant_id: tenantId, nome: form.nome, cor: form.cor, ordem: Number(form.ordem), categoria: form.categoria };
    const { error } = editingId
      ? await supabase.from("graduacoes").update(payload).eq("id", editingId)
      : await supabase.from("graduacoes").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editingId ? "Graduação atualizada" : "Graduação criada");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["graduacoes"] });
  };

  const doDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("graduacoes").delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Graduação excluída");
    qc.invalidateQueries({ queryKey: ["graduacoes"] });
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button className="gradient-primary text-primary-foreground" onClick={startCreate}>
          <Plus className="h-4 w-4 mr-2"/>Nova faixa
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Editar faixa" : "Nova faixa"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div><Label>Nome</Label><Input required value={form.nome} onChange={(e)=>setForm({...form, nome: e.target.value})}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cor</Label><Input type="color" value={form.cor} onChange={(e)=>setForm({...form, cor: e.target.value})}/></div>
              <div><Label>Ordem (ranking)</Label><Input type="number" value={form.ordem} onChange={(e)=>setForm({...form, ordem: e.target.value})}/></div>
            </div>
            <div><Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v: any)=>setForm({...form, categoria: v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="adulto">Adulto</SelectItem><SelectItem value="kids">Kids</SelectItem></SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground">
              {editingId ? "Salvar alterações" : "Criar faixa"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Cor</TableHead><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Ordem</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {graduacoes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma faixa cadastrada</TableCell></TableRow>}
            {graduacoes.map((g: any) => (
              <TableRow key={g.id}>
                <TableCell><span className="inline-block h-6 w-12 rounded" style={{ background: g.cor }}/></TableCell>
                <TableCell className="font-medium">{g.nome}</TableCell>
                <TableCell className="capitalize">{g.categoria}</TableCell>
                <TableCell>{g.ordem}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={()=>startEdit(g)} aria-label="Editar graduação"><Pencil className="h-4 w-4"/></Button>
                    <Button size="icon" variant="ghost" onClick={()=>setDeleting({ id: g.id, nome: g.nome })} aria-label="Excluir graduação" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
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
        title="Excluir faixa"
        description={`Tem certeza que deseja excluir a faixa ${deleting?.nome}?`}
        onConfirm={doDelete}
      />
    </div>
  );
}

/* ----- Tab 2: Atribuir ----- */
function AtribuirTab({ tenantId }: { tenantId: string | null }) {
  const qc = useQueryClient();
  const [aluno_id, setAlunoId] = useState("");
  const [graduacao_id, setGradId] = useState("");
  const [data, setData] = useState(toISODate(new Date()));
  const [observacoes, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: dd } = useQuery({
    queryKey: ["atribuir-data", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [a, g, h] = await Promise.all([
        supabase.from("alunos").select("id, nome_completo, graduacao_atual_id, categoria").order("nome_completo"),
        supabase.from("graduacoes").select("*").order("ordem"),
        supabase.from("historico_graduacoes").select("*, graduacoes:graduacao_nova_id(nome, cor)").order("data", { ascending: false }).limit(20),
      ]);
      return { alunos: a.data ?? [], graduacoes: g.data ?? [], historico: h.data ?? [] };
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !aluno_id || !graduacao_id) { toast.error("Selecione aluno e graduação"); return; }
    setSaving(true);
    const aluno = dd?.alunos.find((a: any) => a.id === aluno_id);
    const { error: e1 } = await supabase.from("historico_graduacoes").insert({
      tenant_id: tenantId, aluno_id, graduacao_nova_id: graduacao_id,
      graduacao_anterior_id: aluno?.graduacao_atual_id ?? null,
      data, observacoes: observacoes || null,
    });
    if (e1) { setSaving(false); toast.error(e1.message); return; }
    const { error: e2 } = await supabase.from("alunos").update({ graduacao_atual_id: graduacao_id }).eq("id", aluno_id);
    setSaving(false);
    if (e2) { toast.error(e2.message); return; }
    toast.success("Graduação atribuída ao aluno");
    setAlunoId(""); setGradId(""); setObs(""); setData(toISODate(new Date()));
    qc.invalidateQueries({ queryKey: ["atribuir-data"] });
    qc.invalidateQueries({ queryKey: ["ranking"] });
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-6 gradient-card border-border">
        <h3 className="font-semibold mb-4">Atribuir graduação</h3>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Aluno</Label>
            <Select value={aluno_id} onValueChange={setAlunoId}>
              <SelectTrigger><SelectValue placeholder="Selecione o aluno"/></SelectTrigger>
              <SelectContent>{dd?.alunos.map((a: any)=>(<SelectItem key={a.id} value={a.id}>{a.nome_completo}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div><Label>Graduação</Label>
            <Select value={graduacao_id} onValueChange={setGradId}>
              <SelectTrigger><SelectValue placeholder="Selecione a faixa"/></SelectTrigger>
              <SelectContent>{dd?.graduacoes.map((g: any)=>(<SelectItem key={g.id} value={g.id}>{g.nome} ({g.categoria})</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div><Label>Data da graduação</Label><Input type="date" value={data} onChange={(e)=>setData(e.target.value)}/></div>
          <div><Label>Observações</Label><Textarea value={observacoes} onChange={(e)=>setObs(e.target.value)}/></div>
          <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={saving}>
            Salvar graduação
          </Button>
        </form>
      </Card>

      <Card className="p-6 gradient-card border-border">
        <h3 className="font-semibold mb-4">Histórico recente</h3>
        <div className="space-y-2 max-h-[420px] overflow-y-auto">
          {(dd?.historico ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sem registros ainda.</p>}
          {dd?.historico.map((h: any) => {
            const aluno = dd.alunos.find((a: any) => a.id === h.aluno_id);
            return (
              <div key={h.id} className="flex items-center gap-3 p-2 rounded-md border border-border">
                <div className="h-8 w-2 rounded-full" style={{ background: h.graduacoes?.cor ?? "#888" }}/>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{aluno?.nome_completo ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{h.graduacoes?.nome} · {fmtDate(h.data)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ----- Tab 3: Ranking ----- */
function RankingTab({ tenantId }: { tenantId: string | null }) {
  const { data } = useQuery({
    queryKey: ["ranking", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [a, g, h] = await Promise.all([
        supabase.from("alunos").select("id, nome_completo, graduacao_atual_id, categoria").eq("status", "ativo"),
        supabase.from("graduacoes").select("*"),
        supabase.from("historico_graduacoes").select("aluno_id, data").order("data", { ascending: false }),
      ]);
      return { alunos: a.data ?? [], graduacoes: g.data ?? [], historico: h.data ?? [] };
    },
  });

  const ranking = useMemo(() => {
    if (!data) return [];
    const gradMap = new Map(data.graduacoes.map((g: any) => [g.id, g]));
    const ultimaData = new Map<string, string>();
    data.historico.forEach((h: any) => {
      if (!ultimaData.has(h.aluno_id)) ultimaData.set(h.aluno_id, h.data);
    });
    return data.alunos
      .map((a: any) => {
        const g: any = a.graduacao_atual_id ? gradMap.get(a.graduacao_atual_id) : null;
        return {
          ...a,
          graduacao: g,
          ordem: g?.ordem ?? -1,
          ultima_data: ultimaData.get(a.id) ?? null,
        };
      })
      .sort((x: any, y: any) => y.ordem - x.ordem);
  }, [data]);

  const trophy = (pos: number) => {
    if (pos === 0) return <Trophy className="h-5 w-5" style={{ color: "#FFD700" }}/>;
    if (pos === 1) return <Trophy className="h-5 w-5" style={{ color: "#C0C0C0" }}/>;
    if (pos === 2) return <Trophy className="h-5 w-5" style={{ color: "#CD7F32" }}/>;
    return <span className="text-sm font-bold text-muted-foreground">{pos + 1}</span>;
  };

  return (
    <Card className="gradient-card border-border overflow-hidden">
      <Table>
        <TableHeader><TableRow><TableHead className="w-16">#</TableHead><TableHead>Aluno</TableHead><TableHead>Graduação</TableHead><TableHead>Categoria</TableHead><TableHead>Última graduação</TableHead></TableRow></TableHeader>
        <TableBody>
          {ranking.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum aluno no ranking</TableCell></TableRow>}
          {ranking.map((r: any, i: number) => (
            <TableRow key={r.id} className={i < 3 ? "bg-primary/5" : ""}>
              <TableCell><div className="flex items-center justify-center w-8">{trophy(i)}</div></TableCell>
              <TableCell className="font-medium">{r.nome_completo}</TableCell>
              <TableCell>
                {r.graduacao ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-4 w-8 rounded" style={{ background: r.graduacao.cor }}/>
                    <span>{r.graduacao.nome}</span>
                  </div>
                ) : <span className="text-xs text-muted-foreground">Sem graduação</span>}
              </TableCell>
              <TableCell className="capitalize">{r.categoria}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.ultima_data ? fmtDate(r.ultima_data) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
