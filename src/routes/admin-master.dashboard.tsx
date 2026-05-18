import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { masterListTenants } from "@/lib/master.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Shield, Building2, Users, LogOut, Search, Eye } from "lucide-react";
import { fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/admin-master/dashboard")({
  head: () => ({ meta: [{ title: "Admin Master · Academias" }, { name: "robots", content: "noindex, nofollow" }] }), component: MasterDashboard });

function MasterDashboard() {
  const navigate = useNavigate();
  const list = useServerFn(masterListTenants);
  const [token, setToken] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PER_PAGE = 15;

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

  const logout = () => {
    sessionStorage.removeItem("master_token");
    navigate({ to: "/admin-master" });
  };

  const filtered = (data?.tenants ?? []).filter((t: any) => {
    const q = search.toLowerCase();
    return (
      t.nome?.toLowerCase().includes(q) ||
      t.responsavel_email?.toLowerCase().includes(q) ||
      t.responsavel_nome?.toLowerCase().includes(q)
    );
  });
  const paginated = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

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
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4 mr-2"/>Sair</Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Visão geral do SaaS</h1>
        <p className="text-sm text-muted-foreground mb-6">Todas as academias e métricas globais</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Stat icon={Building2} label="Total de academias" value={data?.total_academias ?? 0} />
          <Stat icon={Users} label="Total de alunos (rede)" value={data?.total_alunos ?? 0} />
          <Stat icon={Building2} label="Academias ativas" value={(data?.tenants ?? []).filter((t: any) => t.ativo).length} />
        </div>

        <Card className="p-4 gradient-card border-border mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
            <Input
              placeholder="Buscar por academia, responsável ou e-mail..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
        </Card>

        <Card className="gradient-card border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Academia</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Alunos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && paginated.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma academia encontrada</TableCell></TableRow>}
              {paginated.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell className="text-sm">{t.responsavel_nome ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.responsavel_email ?? "—"}</TableCell>
                  <TableCell className="font-semibold">{t.total_alunos}</TableCell>
                  <TableCell>
                    <Badge variant={t.ativo ? "default" : "secondary"} className={t.ativo ? "bg-success/20 text-success" : ""}>
                      {t.ativo ? "ativa" : "inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(t.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/admin-master/tenant/$id" params={{ id: t.id }}>
                        <Eye className="h-4 w-4 mr-1"/>Ver
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </main>
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
