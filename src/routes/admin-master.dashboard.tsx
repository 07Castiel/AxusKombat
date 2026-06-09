import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  masterListTenants,
  masterCreateTenant,
  masterUpdateTenant,
  masterToggleTenant,
  masterDeleteTenant,
} from "@/lib/master.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Shield, Building2, Users, LogOut, Search, Eye, Plus, Pencil, Power, Trash2, Loader2 } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-master/dashboard")({
  head: () => ({ meta: [{ title: "Admin Master · Academias" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: MasterDashboard,
});

type TenantForm = {
  id?: string;
  nome: string;
  cnpj_cpf: string;
  responsavel_nome: string;
  responsavel_email: string;
  telefone: string;
  endereco: string;
  ativo: boolean;
};

const emptyForm: TenantForm = {
  nome: "",
  cnpj_cpf: "",
  responsavel_nome: "",
  responsavel_email: "",
  telefone: "",
  endereco: "",
  ativo: true,
};

function MasterDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(masterListTenants);
  const create = useServerFn(masterCreateTenant);
  const update = useServerFn(masterUpdateTenant);
  const toggle = useServerFn(masterToggleTenant);
  const remove = useServerFn(masterDeleteTenant);

  const [token, setToken] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ativa" | "inativa">("all");
  const [page, setPage] = useState(0);
  const PER_PAGE = 15;

  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<TenantForm>(emptyForm);
  const [confirm, setConfirm] = useState<{ kind: "toggle" | "delete"; id: string; nome: string; ativo?: boolean } | null>(null);

  useEffect(() => {
    const t = sessionStorage.getItem("master_token");
    if (!t) { navigate({ to: "/admin-master" }); return; }
    setToken(t);
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["master-tenants", token],
    enabled: !!token,
    queryFn: () => list({ data: { token: token! } }),
  });

  useEffect(() => {
    if (error) {
      sessionStorage.removeItem("master_token");
      navigate({ to: "/admin-master" });
    }
  }, [error, navigate]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["master-tenants"] });

  const createMut = useMutation({
    mutationFn: (payload: TenantForm) => create({ data: { token: token!, tenant: payload } }),
    onSuccess: () => { toast.success("Academia cadastrada"); setEditorOpen(false); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao cadastrar"),
  });

  const updateMut = useMutation({
    mutationFn: (payload: TenantForm) => update({ data: { token: token!, tenantId: payload.id!, tenant: payload } }),
    onSuccess: () => { toast.success("Academia atualizada"); setEditorOpen(false); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });

  const toggleMut = useMutation({
    mutationFn: (p: { id: string; ativo: boolean }) => toggle({ data: { token: token!, tenantId: p.id, ativo: p.ativo } }),
    onSuccess: (_, p) => { toast.success(p.ativo ? "Academia ativada" : "Academia desativada"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao alterar status"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { token: token!, tenantId: id } }),
    onSuccess: () => { toast.success("Academia excluída"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir"),
  });

  const logout = () => {
    sessionStorage.removeItem("master_token");
    navigate({ to: "/admin-master" });
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, "");
    return (data?.tenants ?? []).filter((t: any) => {
      if (statusFilter === "ativa" && !t.ativo) return false;
      if (statusFilter === "inativa" && t.ativo) return false;
      if (!q) return true;
      const matchText =
        t.nome?.toLowerCase().includes(q) ||
        t.responsavel_email?.toLowerCase().includes(q) ||
        t.responsavel_nome?.toLowerCase().includes(q);
      const matchCnpj = qDigits && t.cnpj_cpf && String(t.cnpj_cpf).replace(/\D/g, "").includes(qDigits);
      return matchText || matchCnpj;
    });
  }, [data, search, statusFilter]);

  const paginated = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

  const openCreate = () => { setForm(emptyForm); setEditorOpen(true); };
  const openEdit = (t: any) => {
    setForm({
      id: t.id,
      nome: t.nome ?? "",
      cnpj_cpf: t.cnpj_cpf ?? "",
      responsavel_nome: t.responsavel_nome ?? "",
      responsavel_email: t.responsavel_email ?? "",
      telefone: t.telefone ?? "",
      endereco: t.endereco ?? "",
      ativo: !!t.ativo,
    });
    setEditorOpen(true);
  };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (form.id) updateMut.mutate(form);
    else createMut.mutate(form);
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md gradient-primary grid place-items-center shadow-glow">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold">Admin Mestre</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Painel do SaaS</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4 mr-2" />Sair</Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold mb-1">Academias</h1>
            <p className="text-sm text-muted-foreground">Gestão completa das academias do SaaS</p>
          </div>
          <Button onClick={openCreate} className="gradient-primary text-primary-foreground shadow-glow">
            <Plus className="h-4 w-4 mr-2" />Nova academia
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Stat icon={Building2} label="Total de academias" value={data?.total_academias ?? 0} />
          <Stat icon={Users} label="Total de alunos (rede)" value={data?.total_alunos ?? 0} />
          <Stat icon={Building2} label="Academias ativas" value={(data?.tenants ?? []).filter((t: any) => t.ativo).length} />
        </div>

        <Card className="p-4 gradient-card border-border mb-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CNPJ, responsável ou e-mail..."
                aria-label="Buscar academias"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(0); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="ativa">Apenas ativas</SelectItem>
                <SelectItem value="inativa">Apenas inativas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="gradient-card border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Academia</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Alunos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && paginated.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma academia encontrada</TableCell></TableRow>}
              {paginated.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell className="text-sm font-mono">{t.cnpj_cpf ?? "—"}</TableCell>
                  <TableCell className="text-sm">{t.responsavel_nome ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div>{t.responsavel_email ?? "—"}</div>
                    <div className="text-xs">{t.telefone ?? ""}</div>
                  </TableCell>
                  <TableCell className="font-semibold">{t.total_alunos}</TableCell>
                  <TableCell>
                    <Badge variant={t.ativo ? "default" : "secondary"} className={t.ativo ? "bg-success/20 text-success" : ""}>
                      {t.ativo ? "ativa" : "inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(t.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="icon" variant="ghost" title="Ver detalhes">
                        <Link to="/admin-master/tenant/$id" params={{ id: t.id }}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button size="icon" variant="ghost" title="Editar" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={t.ativo ? "Desativar" : "Ativar"}
                        onClick={() => setConfirm({ kind: "toggle", id: t.id, nome: t.nome, ativo: !t.ativo })}
                      >
                        <Power className={`h-4 w-4 ${t.ativo ? "text-success" : "text-muted-foreground"}`} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Excluir"
                        onClick={() => setConfirm({ kind: "delete", id: t.id, nome: t.nome })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">Página {page + 1} de {totalPages} · {filtered.length} resultado(s)</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </main>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar academia" : "Nova academia"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitForm} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="nome">Nome da academia *</Label>
                <Input id="nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input id="cnpj" value={form.cnpj_cpf} onChange={(e) => setForm({ ...form, cnpj_cpf: e.target.value })} className="mt-1.5" placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <Label htmlFor="tel">Telefone</Label>
                <Input id="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="resp">Responsável</Label>
                <Input id="resp" value={form.responsavel_nome} onChange={(e) => setForm({ ...form, responsavel_nome: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={form.responsavel_email} onChange={(e) => setForm({ ...form, responsavel_email: e.target.value })} className="mt-1.5" />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="end">Endereço</Label>
                <Input id="end" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="st">Status</Label>
                <Select value={form.ativo ? "1" : "0"} onValueChange={(v) => setForm({ ...form, ativo: v === "1" })}>
                  <SelectTrigger id="st" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Ativa</SelectItem>
                    <SelectItem value="0">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="gradient-primary text-primary-foreground">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : form.id ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm?.kind === "toggle"}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={confirm?.ativo ? "Ativar academia?" : "Desativar academia?"}
        description={`Confirme a alteração de status para "${confirm?.nome ?? ""}".`}
        confirmText={confirm?.ativo ? "Ativar" : "Desativar"}
        onConfirm={() => {
          if (confirm) toggleMut.mutate({ id: confirm.id, ativo: !!confirm.ativo });
          setConfirm(null);
        }}
      />

      <ConfirmDialog
        open={confirm?.kind === "delete"}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title="Excluir academia?"
        description={`Esta ação é permanente. Academias com registros vinculados (alunos, matrículas, etc.) não podem ser excluídas — desative em vez de excluir. "${confirm?.nome ?? ""}"`}
        confirmText="Excluir"
        destructive
        onConfirm={() => {
          if (confirm) deleteMut.mutate(confirm.id);
          setConfirm(null);
        }}
      />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <Card className="p-5 gradient-card border-border shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold mt-1 text-primary">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </div>
    </Card>
  );
}
