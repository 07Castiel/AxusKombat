import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Pencil, RotateCcw, Trash2, User, Heart, ClipboardList, Ban, Pause, Play, Link as LinkIcon, Copy, Archive } from "lucide-react";
import { toast } from "sonner";
import { translateError, firstZodMessage } from "@/lib/errors";
import { alunoSchema } from "@/lib/validators";
import { fmtDate, fmtMoney, toISODate } from "@/lib/utils";
import { upsertContratoAtivo, cancelarContrato, pausarContrato } from "@/lib/contratos.functions";
import { gerarPortalToken } from "@/lib/tenant.functions";

export const Route = createFileRoute("/_app/alunos")({
  component: AlunosPage,
  head: () => ({
    meta: [
      { title: "Alunos | Axus Kombat" },
      { name: "description", content: "Cadastro e gestão de alunos da academia." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const EMPTY = {
  // dados do aluno
  nome_completo: "", email: "", telefone: "", data_nascimento: "", cpf: "", endereco: "",
  categoria: "adulto" as "adulto" | "kids",
  responsavel_nome: "", responsavel_telefone: "", contato_emergencia: "",
  observacoes: "", observacoes_medicas: "",
  peso: "", altura: "",
  // contrato/plano
  ativarPlano: true,
  contrato_id: "" as string,
  plano_id: "" as string,
  valor_mensalidade: "",
  dia_vencimento: "10",
  data_inicio: toISODate(new Date()),
  status_contrato: "ativo" as "ativo" | "pausado" | "cancelado",
};
type FormState = typeof EMPTY;

function AlunosPage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const upsertContratoFn = useServerFn(upsertContratoAtivo);
  const cancelarContratoFn = useServerFn(cancelarContrato);
  const pausarContratoFn = useServerFn(pausarContrato);
  const gerarTokenFn = useServerFn(gerarPortalToken);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [deleting, setDeleting] = useState<{ id: string; nome: string } | null>(null);
  const [archiving, setArchiving] = useState<{ id: string; nome: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: alunos = [] } = useQuery({
    queryKey: ["alunos", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("alunos").select("*").order("nome_completo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contratosAtivos = [] } = useQuery({
    queryKey: ["contratos-ativos", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos")
        .select("*, planos(nome)")
        .in("status", ["ativo", "pausado"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const contratoByAluno = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of contratosAtivos) if (!map.has(c.aluno_id)) map.set(c.aluno_id, c);
    return map;
  }, [contratosAtivos]);

  const { data: planos = [] } = useQuery({
    queryKey: ["planos-ativos", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("planos").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const startCreate = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };

  const startEdit = (a: any) => {
    setEditingId(a.id);
    const c = contratoByAluno.get(a.id);
    setForm({
      ...EMPTY,
      nome_completo: a.nome_completo ?? "", email: a.email ?? "", telefone: a.telefone ?? "",
      data_nascimento: a.data_nascimento ?? "", cpf: a.cpf ?? "", endereco: a.endereco ?? "",
      categoria: a.categoria ?? "adulto",
      responsavel_nome: a.responsavel_nome ?? "", responsavel_telefone: a.responsavel_telefone ?? "",
      contato_emergencia: a.contato_emergencia ?? "",
      observacoes: a.observacoes ?? "", observacoes_medicas: a.observacoes_medicas ?? "",
      peso: a.peso?.toString() ?? "", altura: a.altura?.toString() ?? "",
      ativarPlano: !!c,
      contrato_id: c?.id ?? "",
      plano_id: c?.plano_id ?? "",
      valor_mensalidade: c?.valor_mensalidade != null ? String(c.valor_mensalidade) : "",
      dia_vencimento: c?.dia_vencimento != null ? String(c.dia_vencimento) : "10",
      data_inicio: c?.data_inicio ?? toISODate(new Date()),
      status_contrato: (c?.status as any) ?? "ativo",
    });
    setOpen(true);
  };

  const onPlanoChange = (planoId: string) => {
    const plano = planos.find((p: any) => p.id === planoId);
    setForm((f) => ({
      ...f,
      plano_id: planoId,
      valor_mensalidade: plano && !f.valor_mensalidade ? String(plano.valor) : f.valor_mensalidade,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    const parsed = alunoSchema.safeParse(form);
    if (!parsed.success) { toast.error(firstZodMessage(parsed.error)); return; }

    if (form.ativarPlano) {
      const dia = Number(form.dia_vencimento);
      if (!form.valor_mensalidade || isNaN(Number(form.valor_mensalidade))) {
        toast.error("Informe o valor da mensalidade."); return;
      }
      if (isNaN(dia) || dia < 1 || dia > 28) {
        toast.error("Dia de vencimento deve estar entre 1 e 28."); return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        nome_completo: form.nome_completo,
        email: form.email || null,
        telefone: form.telefone || null,
        data_nascimento: form.data_nascimento || null,
        cpf: form.cpf || null,
        endereco: form.endereco || null,
        categoria: form.categoria,
        responsavel_nome: form.responsavel_nome || null,
        responsavel_telefone: form.responsavel_telefone || null,
        contato_emergencia: form.contato_emergencia || null,
        observacoes: form.observacoes || null,
        observacoes_medicas: form.observacoes_medicas || null,
        peso: form.peso ? Number(form.peso) : null,
        altura: form.altura ? Number(form.altura) : null,
      };

      let alunoId = editingId;
      if (editingId) {
        const { error } = await supabase.from("alunos").update(payload).eq("id", editingId);
        if (error) { toast.error(translateError(error)); return; }
      } else {
        const { data: novo, error } = await supabase.from("alunos").insert(payload).select().single();
        if (error || !novo) { toast.error(translateError(error ?? "Erro ao cadastrar aluno.")); return; }
        alunoId = novo.id;
      }

      // Contrato
      if (form.ativarPlano && alunoId) {
        try {
          await upsertContratoFn({ data: {
            aluno_id: alunoId,
            plano_id: form.plano_id || null,
            valor_mensalidade: Number(form.valor_mensalidade),
            dia_vencimento: Number(form.dia_vencimento),
            data_inicio: form.data_inicio,
            status: form.status_contrato,
          }});
        } catch (err: any) { toast.error(translateError(err)); return; }
      } else if (!form.ativarPlano && form.contrato_id) {
        try {
          await cancelarContratoFn({ data: { contrato_id: form.contrato_id } });
        } catch (err: any) { toast.error(translateError(err)); return; }
      }

      toast.success(editingId ? "Aluno atualizado" : (form.ativarPlano ? "Aluno cadastrado com mensalidade" : "Aluno cadastrado"));
      setOpen(false);
      qc.invalidateQueries();
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id: string, current: string) => {
    const next = current === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase.from("alunos").update({ status: next }).eq("id", id);
    if (error) { toast.error(translateError(error)); return; }
    toast.success(next === "ativo" ? "Aluno reativado" : "Aluno desativado");
    qc.invalidateQueries({ queryKey: ["alunos"] });
  };

  const doDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("alunos").delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Aluno excluído");
    qc.invalidateQueries();
  };

  const togglePause = async (contratoId: string, isAtivo: boolean) => {
    try {
      await pausarContratoFn({ data: { contrato_id: contratoId, pausar: isAtivo } });
      toast.success(isAtivo ? "Contrato pausado" : "Contrato reativado");
      qc.invalidateQueries();
    } catch (err: any) { toast.error(translateError(err)); }
  };

  const copyPortalLink = async (alunoId: string, existingToken: string | null) => {
    try {
      let token = existingToken;
      if (!token) {
        const r: any = await gerarTokenFn({ data: { aluno_id: alunoId } });
        token = r.token;
        qc.invalidateQueries({ queryKey: ["alunos"] });
      }
      const url = `${window.location.origin}/portal/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link do portal copiado");
    } catch (err: any) { toast.error(translateError(err)); }
  };

  const filtered = alunos.filter((a: any) =>
    a.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
    (a.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Alunos"
        description={`${alunos.length} alunos cadastrados`}
        actions={
          <Button className="gradient-primary text-primary-foreground" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2"/>Novo aluno
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar aluno" : "Novo aluno"}</DialogTitle>
            <DialogDescription>
              Cadastro do aluno e plano de mensalidade em um único fluxo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-5">
            {/* Bloco 1 — Dados pessoais */}
            <section className="rounded-lg border border-border/60 bg-card/40 p-4">
              <header className="flex items-center gap-2 mb-3">
                <User className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm uppercase tracking-widest text-metal-light">Dados pessoais</h3>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2"><Label>Nome completo *</Label><Input required value={form.nome_completo} onChange={(e)=>setForm({...form, nome_completo: e.target.value})}/></div>
                <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e)=>setForm({...form, email: e.target.value})}/></div>
                <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e)=>setForm({...form, telefone: e.target.value})}/></div>
                <div><Label>Data nascimento</Label><Input type="date" value={form.data_nascimento} onChange={(e)=>setForm({...form, data_nascimento: e.target.value})}/></div>
                <div><Label>CPF</Label><Input value={form.cpf} onChange={(e)=>setForm({...form, cpf: e.target.value})}/></div>
                <div className="md:col-span-2"><Label>Endereço</Label><Input value={form.endereco} onChange={(e)=>setForm({...form, endereco: e.target.value})}/></div>
                <div><Label>Categoria *</Label>
                  <Select value={form.categoria} onValueChange={(v: "adulto"|"kids")=>setForm({...form, categoria: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="adulto">Adulto</SelectItem><SelectItem value="kids">Kids</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Contato emergência</Label><Input value={form.contato_emergencia} onChange={(e)=>setForm({...form, contato_emergencia: e.target.value})}/></div>
                <div><Label>Responsável (obrigatório se menor)</Label><Input value={form.responsavel_nome} onChange={(e)=>setForm({...form, responsavel_nome: e.target.value})}/></div>
                <div><Label>Telefone responsável</Label><Input value={form.responsavel_telefone} onChange={(e)=>setForm({...form, responsavel_telefone: e.target.value})}/></div>
              </div>
            </section>

            {/* Bloco 2 — Saúde e físico */}
            <section className="rounded-lg border border-border/60 bg-card/40 p-4">
              <header className="flex items-center gap-2 mb-3">
                <Heart className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm uppercase tracking-widest text-metal-light">Informações físicas e saúde</h3>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label>Peso (kg)</Label><Input type="number" step="0.1" value={form.peso} onChange={(e)=>setForm({...form, peso: e.target.value})}/></div>
                <div><Label>Altura (m)</Label><Input type="number" step="0.01" value={form.altura} onChange={(e)=>setForm({...form, altura: e.target.value})}/></div>
                <div className="md:col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.observacoes} onChange={(e)=>setForm({...form, observacoes: e.target.value})}/></div>
                <div className="md:col-span-2"><Label>Observações médicas</Label><Textarea rows={2} value={form.observacoes_medicas} onChange={(e)=>setForm({...form, observacoes_medicas: e.target.value})}/></div>
              </div>
            </section>

            {/* Bloco 3 — Plano de mensalidade */}
            <section className="rounded-lg border border-border/60 bg-card/40 p-4">
              <header className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-sm uppercase tracking-widest text-metal-light">
                    Plano de mensalidade {form.contrato_id ? "(ativo)" : ""}
                  </h3>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.ativarPlano}
                    onCheckedChange={(v)=>setForm({...form, ativarPlano: !!v})}
                  />
                  <span className="text-metal-light">
                    {form.contrato_id ? "Manter plano ativo" : "Ativar plano agora"}
                  </span>
                </label>
              </header>

              {form.ativarPlano && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <Label>Plano de referência (opcional)</Label>
                      <Select value={form.plano_id || "none"} onValueChange={(v)=>onPlanoChange(v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Sem plano vinculado" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem plano vinculado</SelectItem>
                          {planos.map((p: any)=>(
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome} — {fmtMoney(Number(p.valor))}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Valor da mensalidade (R$) *</Label>
                      <Input type="number" step="0.01" required={form.ativarPlano} value={form.valor_mensalidade}
                        onChange={(e)=>setForm({...form, valor_mensalidade: e.target.value})}/>
                    </div>
                    <div>
                      <Label>Dia do vencimento (1–28) *</Label>
                      <Input type="number" min={1} max={28} required={form.ativarPlano} value={form.dia_vencimento}
                        onChange={(e)=>setForm({...form, dia_vencimento: e.target.value})}/>
                    </div>
                    <div>
                      <Label>Data de início *</Label>
                      <Input type="date" required={form.ativarPlano} value={form.data_inicio}
                        onChange={(e)=>setForm({...form, data_inicio: e.target.value})}/>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select value={form.status_contrato} onValueChange={(v: any)=>setForm({...form, status_contrato: v})}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativo">Ativo</SelectItem>
                          <SelectItem value="pausado">Pausado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    As mensalidades são geradas automaticamente para os próximos 3 meses.
                  </p>
                </>
              )}
              {!form.ativarPlano && form.contrato_id && (
                <p className="text-xs text-destructive flex items-center gap-2">
                  <Ban className="h-3.5 w-3.5"/> Ao salvar, o plano ativo será cancelado e mensalidades futuras canceladas.
                </p>
              )}
            </section>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={()=>setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="gradient-primary text-primary-foreground min-w-[180px]">
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : (form.ativarPlano ? "Cadastrar e ativar plano" : "Cadastrar aluno")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="p-4 gradient-card border-border mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
          <Input placeholder="Buscar por nome ou e-mail..." aria-label="Buscar alunos" value={search} onChange={(e)=>setSearch(e.target.value)} className="pl-9"/>
        </div>
      </Card>

      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Mensalidade</TableHead>
              <TableHead>Dia venc.</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum aluno encontrado</TableCell></TableRow>}
            {filtered.map((a: any) => {
              const c = contratoByAluno.get(a.id);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.nome_completo}
                    {a.telefone && <div className="text-xs text-muted-foreground">{a.telefone}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c ? (
                      <span>{fmtMoney(Number(c.valor_mensalidade))} {c.planos?.nome && <span className="text-muted-foreground">· {c.planos.nome}</span>}</span>
                    ) : (
                      <span className="text-muted-foreground italic">Sem plano</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{c ? `Dia ${c.dia_vencimento}` : "—"}</TableCell>
                  <TableCell><StatusBadge status={a.categoria}/></TableCell>
                  <TableCell><StatusBadge status={a.status}/></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(a.data_entrada)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={()=>copyPortalLink(a.id, a.portal_token)} title="Copiar link do portal" aria-label="Copiar link do portal do aluno"><LinkIcon className="h-4 w-4"/></Button>
                      {c && (
                        <Button size="icon" variant="ghost" onClick={()=>togglePause(c.id, c.status === "ativo")} title={c.status === "ativo" ? "Pausar contrato" : "Reativar contrato"} aria-label="Pausar ou retomar contrato">
                          {c.status === "ativo" ? <Pause className="h-4 w-4"/> : <Play className="h-4 w-4 text-success"/>}
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={()=>startEdit(a)} title="Editar" aria-label="Editar aluno"><Pencil className="h-4 w-4"/></Button>
                      <Button size="icon" variant="ghost" onClick={()=>toggleStatus(a.id, a.status)} title={a.status === "ativo" ? "Desativar" : "Reativar"} aria-label={a.status === "ativo" ? "Desativar aluno" : "Reativar aluno"}><RotateCcw className="h-4 w-4"/></Button>
                      <Button size="icon" variant="ghost" onClick={()=>setDeleting({ id: a.id, nome: a.nome_completo })} title="Excluir" aria-label="Excluir aluno" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Excluir aluno"
        description={`Tem certeza que deseja excluir o aluno ${deleting?.nome}? Esta ação não pode ser desfeita.`}
        onConfirm={doDelete}
      />
    </div>
  );
}
