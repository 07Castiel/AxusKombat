import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, KeyRound, Power, Trash2, Search } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translateError } from "@/lib/errors";

import {
  listStaff, createStaff, updateStaff, toggleStaffActive, resetStaffPassword, deleteStaff,
  STAFF_ROLES, PERMISSION_MODULES, ROLE_LABELS, ROLE_PRESETS,
  type StaffRole, type PermissionsMap, type PermissionModule,
} from "@/lib/staff.functions";

export const Route = createFileRoute("/_app/equipe")({
  component: EquipePage,
  head: () => ({
    meta: [
      { title: "Professores e Funcionários | Axus Kombat" },
      { name: "description", content: "Gestão da equipe da academia, perfis e permissões." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const MODULE_LABELS: Record<PermissionModule, string> = {
  alunos: "Alunos", pagamentos: "Pagamentos", planos: "Planos",
  modalidades: "Modalidades", horarios: "Horários", graduacoes: "Graduações",
  relatorios: "Relatórios", configuracoes: "Configurações",
};

type Row = {
  id: string; nome_completo: string; email: string; telefone: string | null;
  ativo: boolean; permissions: any; roles: string[];
};

function EquipePage() {
  const { isAdmin, user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
  }, [loading, isAdmin, navigate]);

  const list = useServerFn(listStaff);
  const create = useServerFn(createStaff);
  const update = useServerFn(updateStaff);
  const toggle = useServerFn(toggleStaffActive);
  const resetPwd = useServerFn(resetStaffPassword);
  const remove = useServerFn(deleteStaff);

  const { data, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: () => list(),
    enabled: isAdmin,
  });

  const [search, setSearch] = useState("");
  const rows: Row[] = useMemo(() => {
    const all = (data as Row[]) ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) =>
      r.nome_completo.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }, [data, search]);

  // ---- form state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState<StaffRole>("recepcao");
  const [perms, setPerms] = useState<PermissionsMap>(() => structuredClone(ROLE_PRESETS.recepcao));
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setNome(""); setEmail(""); setTelefone(""); setSenha("");
    setRole("recepcao");
    setPerms(structuredClone(ROLE_PRESETS.recepcao));
    setOpen(true);
  }
  function openEdit(r: Row) {
    setEditing(r);
    setNome(r.nome_completo); setEmail(r.email); setTelefone(r.telefone ?? ""); setSenha("");
    const currentRole = (STAFF_ROLES.find((x) => r.roles.includes(x)) ?? "recepcao") as StaffRole;
    setRole(currentRole);
    const base = structuredClone(ROLE_PRESETS[currentRole]);
    setPerms({ ...base, ...(r.permissions ?? {}) });
    setOpen(true);
  }
  function applyPreset(next: StaffRole) {
    setRole(next);
    setPerms(structuredClone(ROLE_PRESETS[next]));
  }
  function togglePerm(mod: PermissionModule, key: "ver" | "editar", value: boolean) {
    setPerms((p) => {
      const cur = p[mod] ?? { ver: false, editar: false };
      const next = { ...cur, [key]: value };
      if (key === "editar" && value) next.ver = true;
      if (key === "ver" && !value) next.editar = false;
      return { ...p, [mod]: next };
    });
  }

  async function handleSubmit() {
    if (!nome.trim()) return toast.error("Informe o nome");
    if (!editing && !email.trim()) return toast.error("Informe o e-mail");
    if (!editing && senha.length < 6) return toast.error("Senha provisória precisa ter ao menos 6 caracteres");
    setSaving(true);
    try {
      if (editing) {
        await update({ data: {
          user_id: editing.id, nome_completo: nome.trim(), telefone: telefone.trim() || null,
          role, permissions: perms,
        }});
        toast.success("Funcionário atualizado");
      } else {
        await create({ data: {
          nome_completo: nome.trim(), email: email.trim(), telefone: telefone.trim() || null,
          senha_provisoria: senha, role, permissions: perms,
        }});
        toast.success("Funcionário criado");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (e: any) {
      toast.error(translateError(e));
    } finally { setSaving(false); }
  }

  // reset password dialog
  const [pwdRow, setPwdRow] = useState<Row | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  async function handleResetPwd() {
    if (!pwdRow) return;
    if (newPwd.length < 6) return toast.error("Mínimo de 6 caracteres");
    setPwdSaving(true);
    try {
      await resetPwd({ data: { user_id: pwdRow.id, nova_senha: newPwd }});
      toast.success("Senha redefinida");
      setPwdRow(null); setNewPwd("");
    } catch (e: any) { toast.error(translateError(e)); }
    finally { setPwdSaving(false); }
  }

  // confirm delete
  const [delRow, setDelRow] = useState<Row | null>(null);
  async function handleDelete() {
    if (!delRow) return;
    try {
      await remove({ data: { user_id: delRow.id } });
      toast.success("Funcionário excluído");
      qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (e: any) { toast.error(translateError(e)); }
    finally { setDelRow(null); }
  }

  async function handleToggle(r: Row) {
    try {
      await toggle({ data: { user_id: r.id, ativo: !r.ativo } });
      toast.success(r.ativo ? "Acesso desativado" : "Acesso ativado");
      qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (e: any) { toast.error(translateError(e)); }
  }

  if (!isAdmin) return null;

  return (
    <div>
      <PageHeader
        title="Professores e Funcionários"
        description="Equipe da sua academia"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo funcionário
          </Button>
        }
      />

      <Card className="p-4 mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum funcionário cadastrado.</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const main = (STAFF_ROLES.find((x) => r.roles.includes(x)) ?? null) as StaffRole | null;
              const isSelf = r.id === user?.id;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.nome_completo}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email}</TableCell>
                  <TableCell>{main ? ROLE_LABELS[main] : "—"}</TableCell>
                  <TableCell><StatusBadge status={r.ativo ? "ativo" : "inativo"} /></TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setPwdRow(r)} title="Redefinir senha">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleToggle(r)} disabled={isSelf} title={r.ativo ? "Desativar" : "Ativar"}>
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDelRow(r)} disabled={isSelf} title="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Create/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar funcionário" : "Novo funcionário"}</DialogTitle>
            <DialogDescription>
              {editing ? "Atualize dados, perfil e permissões." : "Defina e-mail e senha provisória. O funcionário poderá trocar a senha depois."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Nome completo *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>E-mail *</Label>
              <Input type="email" value={email} disabled={!!editing} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
            {!editing && (
              <div className="space-y-1">
                <Label>Senha provisória *</Label>
                <Input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
            )}
            <div className="space-y-1 md:col-span-2">
              <Label>Perfil (preset)</Label>
              <Select value={role} onValueChange={(v) => applyPreset(v as StaffRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Trocar o perfil reaplica o preset. Você pode ajustar os checkboxes abaixo para personalizar.
              </p>
            </div>
          </div>

          <div className="mt-2">
            <Label className="text-xs uppercase tracking-widest text-metal">Permissões</Label>
            <div className="mt-2 border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Módulo</TableHead>
                    <TableHead className="w-24 text-center">Ver</TableHead>
                    <TableHead className="w-24 text-center">Editar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PERMISSION_MODULES.map((m) => {
                    const p = perms[m] ?? { ver: false, editar: false };
                    return (
                      <TableRow key={m}>
                        <TableCell className="font-medium">{MODULE_LABELS[m]}</TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={p.ver} onCheckedChange={(v) => togglePerm(m, "ver", !!v)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={p.editar} onCheckedChange={(v) => togglePerm(m, "editar", !!v)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!pwdRow} onOpenChange={(o) => { if (!o) { setPwdRow(null); setNewPwd(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <strong>{pwdRow?.nome_completo}</strong>. Compartilhe com segurança.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Nova senha</Label>
            <Input type="text" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPwdRow(null); setNewPwd(""); }} disabled={pwdSaving}>Cancelar</Button>
            <Button onClick={handleResetPwd} disabled={pwdSaving}>{pwdSaving ? "Salvando…" : "Redefinir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!delRow}
        onOpenChange={(o) => { if (!o) setDelRow(null); }}
        title="Excluir funcionário?"
        description={`Tem certeza que deseja excluir ${delRow?.nome_completo}? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={handleDelete}
      />
    </div>
  );
}
