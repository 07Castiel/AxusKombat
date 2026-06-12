import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Search, Trash2, Users, UserCheck, UserX, Globe2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translateError } from "@/lib/errors";
import { listVisitorLogs, visitorStats, exportVisitorLogs, deleteVisitorLog } from "@/lib/acessos.functions";

export const Route = createFileRoute("/_app/acessos")({
  component: AcessosPage,
  head: () => ({
    meta: [
      { title: "Acessos | Axus Kombat" },
      { name: "description", content: "Registro e auditoria de acessos ao sistema." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Row = {
  id: string;
  created_at: string;
  ip_address: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  browser: string | null;
  operating_system: string | null;
  device_type: string | null;
  current_page: string | null;
  user_id: string | null;
  is_logged_user: boolean;
};

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => escape(r[c])).join(","))].join("\n");
}

function Bar({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-1.5">
      {data.length === 0 && <p className="text-xs text-muted-foreground">Sem dados</p>}
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-metal w-32 truncate">{d.label}</span>
          <div className="flex-1 h-2 bg-muted/30 rounded-sm overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="text-xs font-semibold text-metal-light w-10 text-right">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function AcessosPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
  }, [loading, isAdmin, navigate]);

  const listFn = useServerFn(listVisitorLogs);
  const statsFn = useServerFn(visitorStats);
  const exportFn = useServerFn(exportVisitorLogs);
  const deleteFn = useServerFn(deleteVisitorLog);

  const filters = useMemo(
    () => ({
      from: from ? new Date(from).toISOString() : null,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
      search: search || null,
    }),
    [from, to, search],
  );

  const stats = useQuery({
    queryKey: ["visitor-stats", filters],
    queryFn: () => statsFn({ data: { from: filters.from, to: filters.to } }),
    enabled: isAdmin,
  });

  const list = useQuery({
    queryKey: ["visitor-list", filters, page],
    queryFn: () => listFn({ data: { ...filters, page, pageSize } }),
    enabled: isAdmin,
  });

  const handleExport = async () => {
    try {
      const res = await exportFn({ data: filters });
      const csv = toCsv(res.rows as Record<string, unknown>[]);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `acessos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída");
    } catch (e) {
      toast.error(translateError(e));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Registro excluído");
      list.refetch();
      stats.refetch();
    } catch (e) {
      toast.error(translateError(e));
    }
  };

  if (!isAdmin) return null;

  const t = stats.data?.totals;
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize));

  return (
    <div className="space-y-6">
      <PageHeader title="Acessos" description="Auditoria e registro de visitas ao sistema" />

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Total" value={t?.total ?? 0} />
        <StatCard icon={<Globe2 className="h-4 w-4" />} label="Visitantes únicos" value={t?.uniqueVisitors ?? 0} />
        <StatCard icon={<UserCheck className="h-4 w-4" />} label="Logados" value={t?.logged ?? 0} />
        <StatCard icon={<UserX className="h-4 w-4" />} label="Não logados" value={t?.notLogged ?? 0} />
        <StatCard label="Hoje" value={t?.today ?? 0} />
        <StatCard label="Semana" value={t?.week ?? 0} />
        <StatCard label="Mês" value={t?.month ?? 0} />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-[10px] uppercase tracking-widest text-metal">De</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest text-metal">Até</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest text-metal">Buscar</Label>
            <div className="flex gap-2">
              <Input
                placeholder="IP, cidade, página…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
              />
              <Button variant="outline" size="icon" onClick={() => { setSearch(searchInput); setPage(1); }}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleExport} variant="outline">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Acessos por dia (30d)">
          <div className="flex items-end gap-1 h-32">
            {(stats.data?.perDay ?? []).map((d) => {
              const max = Math.max(1, ...(stats.data?.perDay ?? []).map((x) => x.value));
              return (
                <div key={d.label} className="flex-1 flex flex-col items-center gap-1" title={`${d.label}: ${d.value}`}>
                  <div className="w-full bg-primary/80" style={{ height: `${(d.value / max) * 100}%`, minHeight: 1 }} />
                </div>
              );
            })}
          </div>
        </ChartCard>
        <ChartCard title="Países"><Bar data={stats.data?.perCountry ?? []} /></ChartCard>
        <ChartCard title="Estados / Regiões"><Bar data={stats.data?.perRegion ?? []} /></ChartCard>
        <ChartCard title="Cidades"><Bar data={stats.data?.perCity ?? []} /></ChartCard>
        <ChartCard title="Navegadores"><Bar data={stats.data?.perBrowser ?? []} /></ChartCard>
        <ChartCard title="Sistemas operacionais"><Bar data={stats.data?.perOs ?? []} /></ChartCard>
        <ChartCard title="Dispositivos"><Bar data={stats.data?.perDevice ?? []} /></ChartCard>
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Navegador</TableHead>
              <TableHead>SO</TableHead>
              <TableHead>Dispositivo</TableHead>
              <TableHead>Página</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list.data?.rows ?? []).map((r: Row) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                <TableCell className="text-xs">{r.ip_address ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  {[r.city, r.region, r.country].filter(Boolean).join(", ") || "—"}
                </TableCell>
                <TableCell className="text-xs">{r.browser ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.operating_system ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.device_type ?? "—"}</TableCell>
                <TableCell className="text-xs max-w-[200px] truncate" title={r.current_page ?? ""}>{r.current_page ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.is_logged_user ? "Logado" : "—"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-4 w-4 text-primary" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {list.data && list.data.rows.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum registro</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between p-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {list.data?.total ?? 0} registros · página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon?: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-metal">
        {icon}
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <p className="font-display text-2xl text-foreground mt-1">{value}</p>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="text-[11px] uppercase tracking-widest text-metal mb-3">{title}</h3>
      {children}
    </Card>
  );
}
