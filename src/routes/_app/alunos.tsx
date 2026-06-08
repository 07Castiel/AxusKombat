import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Search, Pencil, RotateCcw, Trash2, User, Heart, ClipboardList, Ban } from "lucide-react";
import { toast } from "sonner";
import { translateError, firstZodMessage } from "@/lib/errors";
import { alunoSchema } from "@/lib/validators";
import { fmtDate, fmtMoney, addDuracao, toISODate } from "@/lib/utils";

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
  // matrícula integrada
  matricular: true,
  matricula_id: "" as string,
  plano_id: "",
  data_inicio: toISODate(new Date()),
  desconto: "0",
  valor_final: "",
};
type FormState = typeof EMPTY;

function AlunosPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [deleting, setDeleting] = useState<{ id: string; nome: string } | null>(null);
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

  // matrículas ativas → mapa por aluno_id
  const { data: matriculasAtivas = [] } = useQuery({
    queryKey: ["matriculas-ativas", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matriculas")
        .select("*, planos(nome, valor, duracao, dias_personalizado)")
        .eq("status", "ativa")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const matriculaByAluno = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of matriculasAtivas) if (!map.has(m.aluno_id)) map.set(m.aluno_id, m);
    return map;
  }, [matriculasAtivas]);

  const { data: planos = [] } = useQuery({
    queryKey: ["planos-ativos", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("planos").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const planoSelecionado = useMemo(
    () => planos.find((p: any) => p.id === form.plano_id),
    [planos, form.plano_id],
  );

  const valorCalculado = useMemo(() => {
    if (!planoSelecionado) return null;
    const desc = Number(form.desconto) || 0;
    return Math.max(0, Number(planoSelecionado.valor) - desc);
  }, [planoSelecionado, form.desconto]);

  const vencimentoCalculado = useMemo(() => {
    if (!planoSelecionado || !form.data_inicio) return null;
    return toISODate(addDuracao(new Date(form.data_inicio), planoSelecionado.duracao, planoSelecionado.dias_personalizado));
  }, [planoSelecionado, form.data_inicio]);

  const startCreate = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };

  const startEdit = (a: any) => {
    setEditingId(a.id);
    const mat = matriculaByAluno.get(a.id);
    setForm({
      ...EMPTY,
      nome_completo: a.nome_completo ?? "", email: a.email ?? "", telefone: a.telefone ?? "",
      data_nascimento: a.data_nascimento ?? "", cpf: a.cpf ?? "", endereco: a.endereco ?? "",
      categoria: a.categoria ?? "adulto",
      responsavel_nome: a.responsavel_nome ?? "", responsavel_telefone: a.responsavel_telefone ?? "",
      contato_emergencia: a.contato_emergencia ?? "",
      observacoes: a.observacoes ?? "", observacoes_medicas: a.observacoes_medicas ?? "",
      peso: a.peso?.toString() ?? "", altura: a.altura?.toString() ?? "",
      matricular: !!mat,
      matricula_id: mat?.id ?? "",
      plano_id: mat?.plano_id ?? "",
      data_inicio: mat?.data_inicio ?? toISODate(new Date()),
      desconto: mat?.desconto != null ? String(mat.desconto) : "0",
      valor_final: mat?.valor_final != null ? String(mat.valor_final) : "",
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    const parsed = alunoSchema.safeParse(form);
    if (!parsed.success) { toast.error(firstZodMessage(parsed.error)); return; }

    if (form.matricular && !form.plano_id) {
      toast.error("Selecione um plano ou desmarque a matrícula.");
      return;
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

      // matrícula
      if (form.matricular && planoSelecionado && vencimentoCalculado && alunoId) {
        const desconto = Number(form.desconto) || 0;
        const valorFinal = form.valor_final
          ? Number(form.valor_final)
          : (valorCalculado ?? Number(planoSelecionado.valor));

        if (form.matricula_id) {
          // edita matrícula existente
          const { error: matErr } = await supabase.from("matriculas").update({
            plano_id: planoSelecionado.id,
            data_inicio: form.data_inicio,
            data_vencimento: vencimentoCalculado,
            desconto,
            valor_final: valorFinal,
            status: "ativa",
          }).eq("id", form.matricula_id);
          if (matErr) { toast.error(translateError(matErr)); return; }
        } else {
          // cria nova matrícula + 1º pagamento pendente
          const { data: mat, error: matErr } = await supabase.from("matriculas").insert({
            tenant_id: profile.tenant_id,
            aluno_id: alunoId,
            plano_id: planoSelecionado.id,
            data_inicio: form.data_inicio,
            data_vencimento: vencimentoCalculado,
            desconto,
            valor_final: valorFinal,
          }).select().single();
          if (matErr || !mat) { toast.error(translateError(matErr ?? "Matrícula falhou.")); return; }
          const { error: payErr } = await supabase.from("pagamentos").insert({
            tenant_id: profile.tenant_id,
            matricula_id: mat.id,
            aluno_id: alunoId,
            valor: valorFinal,
            data_vencimento: vencimentoCalculado,
            status: "pendente",
            metodo: "pix",
          });
          if (payErr) toast.error(translateError(payErr));
        }
      } else if (!form.matricular && form.matricula_id) {
        // usuário desmarcou: cancela matrícula ativa
        const { error: cancelErr } = await supabase
          .from("matriculas")
          .update({ status: "cancelada" })
          .eq("id", form.matricula_id);
        if (cancelErr) { toast.error(translateError(cancelErr)); return; }
      }

      toast.success(editingId ? "Aluno atualizado" : (form.matricular ? "Aluno cadastrado e matriculado" : "Aluno cadastrado"));
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
              Cadastro do aluno e matrícula em um único fluxo.
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

            {/* Bloco 3 — Matrícula (criação E edição) */}
            <section className="rounded-lg border border-border/60 bg-card/40 p-4">
              <header className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-sm uppercase tracking-widest text-metal-light">
                    Matrícula {form.matricula_id ? "ativa" : ""}
                  </h3>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.matricular}
                    onCheckedChange={(v)=>setForm({...form, matricular: !!v})}
                  />
                  <span className="text-metal-light">
                    {form.matricula_id ? "Manter matrícula ativa" : "Matricular agora"}
                  </span>
                </label>
              </header>

              {form.matricular && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <Label>Plano *</Label>
                    <Select value={form.plano_id} onValueChange={(v)=>setForm({...form, plano_id: v})}>
                      <SelectTrigger><SelectValue placeholder={planos.length ? "Selecione um plano" : "Nenhum plano cadastrado"} /></SelectTrigger>
                      <SelectContent>
                        {planos.map((p: any)=>(
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome} — {fmtMoney(Number(p.valor))} ({p.duracao})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Data início</Label>
                    <Input type="date" value={form.data_inicio} onChange={(e)=>setForm({...form, data_inicio: e.target.value})}/>
                  </div>
                  <div>
                    <Label>Vencimento (auto)</Label>
                    <Input value={vencimentoCalculado ? fmtDate(vencimentoCalculado) : "—"} disabled />
                  </div>
                  <div>
                    <Label>Desconto (R$)</Label>
                    <Input type="number" step="0.01" value={form.desconto} onChange={(e)=>setForm({...form, desconto: e.target.value})}/>
                  </div>
                  <div>
                    <Label>Valor final</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={valorCalculado != null ? String(valorCalculado.toFixed(2)) : "Selecione um plano"}
                      value={form.valor_final}
                      onChange={(e)=>setForm({...form, valor_final: e.target.value})}
                    />
                    {planoSelecionado && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Calculado: {fmtMoney(valorCalculado ?? 0)} — deixe em branco para usar o automático.
                      </p>
                    )}
                  </div>
                </div>
              )}
              {!form.matricular && form.matricula_id && (
                <p className="text-xs text-destructive flex items-center gap-2">
                  <Ban className="h-3.5 w-3.5"/> Ao salvar, a matrícula ativa será cancelada.
                </p>
              )}
            </section>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={()=>setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="gradient-primary text-primary-foreground min-w-[180px]">
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : (form.matricular ? "Cadastrar e matricular" : "Cadastrar aluno")}
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
              <TableHead>Plano atual</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum aluno encontrado</TableCell></TableRow>}
            {filtered.map((a: any) => {
              const mat = matriculaByAluno.get(a.id);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.nome_completo}
                    {a.telefone && <div className="text-xs text-muted-foreground">{a.telefone}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {mat ? (
                      <span>{mat.planos?.nome ?? "—"} <span className="text-muted-foreground">· {fmtMoney(Number(mat.valor_final))}</span></span>
                    ) : (
                      <span className="text-muted-foreground italic">Sem matrícula</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{mat ? fmtDate(mat.data_vencimento) : "—"}</TableCell>
                  <TableCell><StatusBadge status={a.categoria}/></TableCell>
                  <TableCell><StatusBadge status={a.status}/></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(a.data_entrada)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
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
