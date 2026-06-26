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
import { Plus, Pencil, Trash2, Trophy, Award, Search } from "lucide-react";
import { toast } from "sonner";
import { translateError, firstZodMessage } from "@/lib/errors";
import { graduacaoSchema } from "@/lib/validators";
import { fmtDate, toISODate } from "@/lib/utils";

export const Route = createFileRoute("/_app/graduacoes")({
  component: GraduacoesPage,
  head: () => ({
    meta: [
      { title: "Graduações | Axus Kombat" },
      { name: "description", content: "Graduações dos alunos por modalidade e ranking." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function useModalidades(tenantId: string | null) {
  return useQuery({
    queryKey: ["modalidades", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("modalidades").select("*").eq("ativo", true).order("nome")).data ?? [],
  });
}

function GraduacoesPage() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? null;
  const { data: modalidades = [] } = useModalidades(tenantId);
  const [modalidadeId, setModalidadeId] = useState<string>("");

  const selected = modalidades.find((m: any) => m.id === modalidadeId);
  const termo = selected?.termo_graduacao || "Graduação";

  if (modalidades.length === 0) {
    return (
      <div>
        <PageHeader title="Graduações" description="Graduação dos alunos e ranking" />
        <Card className="gradient-card border-border p-12 text-center">
          <Award className="h-12 w-12 mx-auto text-metal mb-4" />
          <p className="text-muted-foreground">
            Cadastre uma modalidade primeiro para gerenciar graduações.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={`Graduações por ${termo}`} description="Gerencie as graduações da sua academia" />

      <div className="mb-4 max-w-sm">
        <Label className="uppercase-label text-[11px]">Modalidade</Label>
        <Select value={modalidadeId} onValueChange={setModalidadeId}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione uma modalidade"/></SelectTrigger>
          <SelectContent>
            {modalidades.map((m: any) => (
              <SelectItem key={m.id} value={m.id}>{m.nome} ({m.termo_graduacao})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="faixas">
        <TabsList className="mb-4">
          <TabsTrigger value="faixas">{termo}s</TabsTrigger>
          <TabsTrigger value="atribuir">Atribuir</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
        </TabsList>
        <TabsContent value="faixas"><FaixasTab tenantId={tenantId} modalidadeId={modalidadeId} termo={termo}/></TabsContent>
        <TabsContent value="atribuir"><AtribuirTab tenantId={tenantId} modalidadeId={modalidadeId} termo={termo}/></TabsContent>
        <TabsContent value="ranking"><RankingTab tenantId={tenantId} modalidadeId={modalidadeId} termo={termo}/></TabsContent>
      </Tabs>
    </div>
  );
}

/* ----- Tab 1: Faixas ----- */
const EMPTY_FAIXA = { nome: "", cor: "#dc2626", ordem: "0", categoria: "adulto" as "adulto" | "kids" };

function FaixasTab({ tenantId, modalidadeId, termo }: { tenantId: string | null; modalidadeId: string; termo: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FAIXA);
  const [deleting, setDeleting] = useState<{ id: string; nome: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<"todas" | "adulto" | "kids">("todas");

  const { data: graduacoes = [] } = useQuery({
    queryKey: ["graduacoes", tenantId, modalidadeId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from("graduacoes").select("*").order("ordem", { ascending: false });
      if (modalidadeId) q = q.eq("modalidade_id", modalidadeId);
      return (await q).data ?? [];
    },
  });

  const graduacoesFiltradas = useMemo(() => {
    const termoBusca = busca.trim().toLowerCase();
    return graduacoes.filter((g: any) => {
      if (filtroCategoria !== "todas" && g.categoria !== filtroCategoria) return false;
      if (termoBusca && !g.nome.toLowerCase().includes(termoBusca)) return false;
      return true;
    });
  }, [graduacoes, busca, filtroCategoria]);

  const startCreate = () => {
    if (!modalidadeId) { toast.error("Selecione uma modalidade primeiro"); return; }
    setEditingId(null); setForm(EMPTY_FAIXA); setOpen(true);
  };
  const startEdit = (g: any) => {
    setEditingId(g.id);
    setForm({ nome: g.nome, cor: g.cor ?? "#dc2626", ordem: String(g.ordem), categoria: g.categoria });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !modalidadeId) return;
    const parsed = graduacaoSchema.safeParse({
      nome: form.nome, modalidade_id: modalidadeId, categoria: form.categoria, cor: form.cor, ordem: form.ordem,
    });
    if (!parsed.success) { toast.error(firstZodMessage(parsed.error)); return; }
    const payload = { tenant_id: tenantId, modalidade_id: modalidadeId, nome: form.nome, cor: form.cor, ordem: Number(form.ordem), categoria: form.categoria };
    const { error } = editingId
      ? await supabase.from("graduacoes").update(payload).eq("id", editingId)
      : await supabase.from("graduacoes").insert(payload);
    if (error) { toast.error(translateError(error)); return; }
    toast.success(editingId ? `${termo} atualizado(a)` : `${termo} criado(a)`);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["graduacoes"] });
  };

  const doDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("graduacoes").delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: ["graduacoes"] });
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-3">
        <div className="flex flex-col sm:flex-row gap-2 flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
            <Input
              placeholder={`Buscar ${termo.toLowerCase()}...`}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={filtroCategoria} onValueChange={(v: "todas"|"adulto"|"kids") => setFiltroCategoria(v)}>
            <SelectTrigger className="sm:w-40"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas categorias</SelectItem>
              <SelectItem value="adulto">Adulto</SelectItem>
              <SelectItem value="kids">Kids</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="gradient-primary text-primary-foreground" onClick={startCreate}>
          <Plus className="h-4 w-4 mr-2"/>Novo(a) {termo}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? `Editar ${termo}` : `Novo(a) ${termo}`}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div><Label>{termo}</Label><Input required value={form.nome} onChange={(e)=>setForm({...form, nome: e.target.value})}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cor</Label><Input type="color" value={form.cor} onChange={(e)=>setForm({...form, cor: e.target.value})}/></div>
              <div><Label>Ordem (ranking)</Label><Input type="number" value={form.ordem} onChange={(e)=>setForm({...form, ordem: e.target.value})}/></div>
            </div>
            <div><Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v: "adulto"|"kids")=>setForm({...form, categoria: v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="adulto">Adulto</SelectItem><SelectItem value="kids">Kids</SelectItem></SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground">
              {editingId ? "Salvar alterações" : "Criar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Cor</TableHead><TableHead>{termo}</TableHead><TableHead>Categoria</TableHead><TableHead>Ordem</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {graduacoes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum(a) {termo.toLowerCase()} cadastrado(a){modalidadeId ? "" : " — selecione uma modalidade"}</TableCell></TableRow>}
            {graduacoes.map((g: any) => (
              <TableRow key={g.id}>
                <TableCell><span className="inline-block h-6 w-12 rounded" style={{ background: g.cor }}/></TableCell>
                <TableCell className="font-medium">{g.nome}</TableCell>
                <TableCell className="capitalize">{g.categoria}</TableCell>
                <TableCell>{g.ordem}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={()=>startEdit(g)} aria-label="Editar"><Pencil className="h-4 w-4"/></Button>
                    <Button size="icon" variant="ghost" onClick={()=>setDeleting({ id: g.id, nome: g.nome })} aria-label="Excluir" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
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
        title={`Excluir ${termo}`}
        description={`Tem certeza que deseja excluir "${deleting?.nome}"?`}
        onConfirm={doDelete}
      />
    </div>
  );
}

/* ----- Tab 2: Atribuir ----- */
function AtribuirTab({ tenantId, modalidadeId, termo }: { tenantId: string | null; modalidadeId: string; termo: string }) {
  const qc = useQueryClient();
  const [aluno_id, setAlunoId] = useState("");
  const [graduacao_id, setGradId] = useState("");
  const [data, setData] = useState(toISODate(new Date()));
  const [observacoes, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: dd } = useQuery({
    queryKey: ["atribuir-data", tenantId, modalidadeId],
    enabled: !!tenantId,
    queryFn: async () => {
      let gq = supabase.from("graduacoes").select("*").order("ordem");
      if (modalidadeId) gq = gq.eq("modalidade_id", modalidadeId);
      const [a, g, h] = await Promise.all([
        supabase.from("alunos").select("id, nome_completo, graduacao_atual_id, categoria").order("nome_completo"),
        gq,
        supabase.from("historico_graduacoes").select("*, graduacoes:graduacao_nova_id(nome, cor)").order("data", { ascending: false }).limit(20),
      ]);
      return { alunos: a.data ?? [], graduacoes: g.data ?? [], historico: h.data ?? [] };
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !aluno_id || !graduacao_id) { toast.error(`Selecione aluno e ${termo.toLowerCase()}`); return; }
    setSaving(true);
    const aluno = dd?.alunos.find((a: any) => a.id === aluno_id);
    const { error: e1 } = await supabase.from("historico_graduacoes").insert({
      tenant_id: tenantId, aluno_id, graduacao_nova_id: graduacao_id,
      graduacao_anterior_id: aluno?.graduacao_atual_id ?? null,
      data, observacoes: observacoes || null,
    });
    if (e1) { setSaving(false); toast.error(translateError(e1)); return; }
    const { error: e2 } = await supabase.from("alunos").update({ graduacao_atual_id: graduacao_id }).eq("id", aluno_id);
    setSaving(false);
    if (e2) { toast.error(translateError(e2)); return; }
    toast.success(`${termo} atribuído(a) ao aluno`);
    setAlunoId(""); setGradId(""); setObs(""); setData(toISODate(new Date()));
    qc.invalidateQueries({ queryKey: ["atribuir-data"] });
    qc.invalidateQueries({ queryKey: ["ranking"] });
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-6 gradient-card border-border">
        <h3 className="font-semibold mb-4">Atribuir {termo}</h3>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Aluno</Label>
            <Select value={aluno_id} onValueChange={setAlunoId}>
              <SelectTrigger><SelectValue placeholder="Selecione o aluno"/></SelectTrigger>
              <SelectContent>{dd?.alunos.map((a: any)=>(<SelectItem key={a.id} value={a.id}>{a.nome_completo}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div><Label>{termo}</Label>
            <Select value={graduacao_id} onValueChange={setGradId}>
              <SelectTrigger><SelectValue placeholder={`Selecione o(a) ${termo.toLowerCase()}`}/></SelectTrigger>
              <SelectContent>{dd?.graduacoes.map((g: any)=>(<SelectItem key={g.id} value={g.id}>{g.nome} ({g.categoria})</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div><Label>Data</Label><Input type="date" value={data} onChange={(e)=>setData(e.target.value)}/></div>
          <div><Label>Observações</Label><Textarea value={observacoes} onChange={(e)=>setObs(e.target.value)}/></div>
          <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={saving}>
            Salvar
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
function RankingTab({ tenantId, modalidadeId, termo }: { tenantId: string | null; modalidadeId: string; termo: string }) {
  const { data } = useQuery({
    queryKey: ["ranking", tenantId, modalidadeId],
    enabled: !!tenantId,
    queryFn: async () => {
      let gq = supabase.from("graduacoes").select("*");
      if (modalidadeId) gq = gq.eq("modalidade_id", modalidadeId);
      const [a, g, h] = await Promise.all([
        supabase.from("alunos").select("id, nome_completo, graduacao_atual_id, categoria").eq("status", "ativo"),
        gq,
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
        return { ...a, graduacao: g, ordem: g?.ordem ?? -1, ultima_data: ultimaData.get(a.id) ?? null };
      })
      .filter((r: any) => !modalidadeId || r.graduacao)
      .sort((x: any, y: any) => y.ordem - x.ordem);
  }, [data, modalidadeId]);

  const trophy = (pos: number) => {
    if (pos === 0) return <Trophy className="h-5 w-5" style={{ color: "#FFD700" }}/>;
    if (pos === 1) return <Trophy className="h-5 w-5" style={{ color: "#C0C0C0" }}/>;
    if (pos === 2) return <Trophy className="h-5 w-5" style={{ color: "#CD7F32" }}/>;
    return <span className="text-sm font-bold text-muted-foreground">{pos + 1}</span>;
  };

  return (
    <Card className="gradient-card border-border overflow-hidden">
      <Table>
        <TableHeader><TableRow><TableHead className="w-16">#</TableHead><TableHead>Aluno</TableHead><TableHead>{termo}</TableHead><TableHead>Categoria</TableHead><TableHead>Última {termo.toLowerCase()}</TableHead></TableRow></TableHeader>
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
                ) : <span className="text-xs text-muted-foreground">—</span>}
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
