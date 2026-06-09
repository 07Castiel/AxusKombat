import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Send, RefreshCw, Play, Save, MessageSquare } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translateError } from "@/lib/errors";
import {
  getWhatsappConfig, saveWhatsappConfig, testWhatsappConnection,
  listNotifications, resendNotification, runNotificationsNow,
} from "@/lib/notifications.functions";

export const Route = createFileRoute("/_app/notificacoes")({
  component: NotificacoesPage,
  head: () => ({
    meta: [
      { title: "Notificações | Axus Kombat" },
      { name: "description", content: "Avisos automáticos de matrícula via WhatsApp." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const TIPO_LABEL: Record<string, string> = {
  AVISO_7_DIAS: "7 dias antes", AVISO_3_DIAS: "3 dias antes", AVISO_VENCIMENTO: "Vencimento",
};

function NotificacoesPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => { if (!loading && !isAdmin) navigate({ to: "/" }); }, [loading, isAdmin, navigate]);

  const getCfg = useServerFn(getWhatsappConfig);
  const saveCfg = useServerFn(saveWhatsappConfig);
  const testCfg = useServerFn(testWhatsappConnection);
  const list = useServerFn(listNotifications);
  const resend = useServerFn(resendNotification);
  const runNow = useServerFn(runNotificationsNow);

  const cfgQuery = useQuery({ queryKey: ["whatsapp_config"], queryFn: () => getCfg(), enabled: isAdmin });
  const [cfg, setCfg] = useState<any>(null);
  useEffect(() => { if (cfgQuery.data) setCfg({ ...cfgQuery.data }); }, [cfgQuery.data]);

  const [filters, setFilters] = useState<{ status: string; tipo: string }>({ status: "", tipo: "" });
  const notifQuery = useQuery({
    queryKey: ["notificacoes", filters],
    queryFn: () => list({ data: {
      status: (filters.status || null) as any,
      tipo: filters.tipo || null,
      limit: 200,
    }}),
    enabled: isAdmin,
  });

  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!cfg) return;
    setSaving(true);
    try {
      await saveCfg({ data: {
        provider: cfg.provider, instance_name: cfg.instance_name ?? null,
        api_url: cfg.api_url ?? null, api_token: cfg.api_token ?? null,
        sender_number: cfg.sender_number ?? null, enabled: !!cfg.enabled,
        template_7_dias: cfg.template_7_dias, template_3_dias: cfg.template_3_dias,
        template_vencimento: cfg.template_vencimento,
      }});
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["whatsapp_config"] });
    } catch (e: any) { toast.error(translateError(e)); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    if (!testTo.trim()) return toast.error("Informe um número para teste");
    try {
      const r = await testCfg({ data: { to: testTo.trim() } });
      if (r.ok) toast.success("Mensagem de teste enviada");
      else toast.error(r.error ?? "Falha no teste");
      qc.invalidateQueries({ queryKey: ["whatsapp_config"] });
    } catch (e: any) { toast.error(translateError(e)); }
  }

  async function handleResend(id: string) {
    try {
      const r = await resend({ data: { notification_id: id } });
      if (r.ok) toast.success("Notificação reenviada");
      else toast.error(r.error ?? "Falha ao reenviar");
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
    } catch (e: any) { toast.error(translateError(e)); }
  }

  async function handleRunNow() {
    try {
      const r: any = await runNow();
      toast.success(`Rotina executada: ${r?.summary?.sent ?? 0} enviadas, ${r?.summary?.failed ?? 0} falhas`);
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
    } catch (e: any) { toast.error(translateError(e)); }
  }

  if (!isAdmin) return null;

  return (
    <div>
      <PageHeader
        title="Notificações"
        description="Avisos automáticos de matrícula via WhatsApp"
        actions={
          <Button variant="outline" onClick={handleRunNow}>
            <Play className="h-4 w-4" /> Executar agora
          </Button>
        }
      />

      <Tabs defaultValue="historico" className="space-y-4">
        <TabsList>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="config">WhatsApp</TabsTrigger>
          <TabsTrigger value="templates">Mensagens</TabsTrigger>
        </TabsList>

        {/* ---------------- Histórico ---------------- */}
        <TabsContent value="historico" className="space-y-4">
          <Card className="p-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={filters.status || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? "" : v }))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="enviada">Enviada</SelectItem>
                  <SelectItem value="falhou">Falhou</SelectItem>
                  <SelectItem value="agendada">Agendada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={filters.tipo || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, tipo: v === "all" ? "" : v }))}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="AVISO_7_DIAS">7 dias antes</SelectItem>
                  <SelectItem value="AVISO_3_DIAS">3 dias antes</SelectItem>
                  <SelectItem value="AVISO_VENCIMENTO">Vencimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["notificacoes"] })}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
          </Card>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifQuery.isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
                {!notifQuery.isLoading && (notifQuery.data?.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma notificação encontrada.</TableCell></TableRow>
                )}
                {(notifQuery.data ?? []).map((n: any) => (
                  <TableRow key={n.id}>
                    <TableCell className="text-xs">{new Date(n.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{n.aluno?.nome_completo ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{n.destinatario ?? "—"}</TableCell>
                    <TableCell className="text-xs">{TIPO_LABEL[n.tipo] ?? n.tipo}</TableCell>
                    <TableCell><StatusBadge status={n.status === "enviada" ? "ativo" : n.status === "falhou" ? "vencida" : "pendente"} /></TableCell>
                    <TableCell className="text-xs text-destructive max-w-xs truncate" title={n.erro ?? ""}>{n.erro ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleResend(n.id)} title="Reenviar">
                        <Send className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ---------------- Config WhatsApp ---------------- */}
        <TabsContent value="config">
          {!cfg ? <Card className="p-8 text-center text-muted-foreground">Carregando…</Card> : (
            <Card className="p-6 space-y-4 max-w-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display uppercase tracking-wider text-metal-light">Conexão WhatsApp</h3>
                  <p className="text-xs text-muted-foreground">Status: <StatusBadge status={cfg.enabled ? "ativa" : "inativo"} /></p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="enabled" className="text-xs">Ativo</Label>
                  <Switch id="enabled" checked={!!cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Provedor</Label>
                  <Select value={cfg.provider} onValueChange={(v) => setCfg({ ...cfg, provider: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="evolution">Evolution API</SelectItem>
                      <SelectItem value="zapi">Z-API</SelectItem>
                      <SelectItem value="cloud">WhatsApp Cloud (Meta)</SelectItem>
                      <SelectItem value="mock">Mock (apenas log)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Nome da instância</Label>
                  <Input value={cfg.instance_name ?? ""} onChange={(e) => setCfg({ ...cfg, instance_name: e.target.value })} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>URL da API</Label>
                  <Input value={cfg.api_url ?? ""} onChange={(e) => setCfg({ ...cfg, api_url: e.target.value })} placeholder="https://..." />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Token</Label>
                  <Input type="password" value={cfg.api_token ?? ""} onChange={(e) => setCfg({ ...cfg, api_token: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Número remetente</Label>
                  <Input value={cfg.sender_number ?? ""} onChange={(e) => setCfg({ ...cfg, sender_number: e.target.value })} placeholder="5511999999999" />
                </div>
                {cfg.last_test_at && (
                  <div className="space-y-1">
                    <Label>Último teste</Label>
                    <p className="text-xs text-muted-foreground">{new Date(cfg.last_test_at).toLocaleString("pt-BR")} — {cfg.last_test_result}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-white/5">
                <div className="space-y-1 flex-1 min-w-48">
                  <Label className="text-xs">Testar enviando para</Label>
                  <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="5511999999999" />
                </div>
                <Button variant="outline" onClick={handleTest}>
                  <MessageSquare className="h-4 w-4" /> Enviar teste
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ---------------- Templates ---------------- */}
        <TabsContent value="templates">
          {!cfg ? <Card className="p-8 text-center text-muted-foreground">Carregando…</Card> : (
            <Card className="p-6 space-y-5 max-w-3xl">
              <p className="text-xs text-muted-foreground">
                Variáveis: <code>{"{nome}"}</code>, <code>{"{academia}"}</code>, <code>{"{vencimento}"}</code>, <code>{"{valor}"}</code>
              </p>
              {[
                { key: "template_7_dias", label: "Aviso 7 dias antes" },
                { key: "template_3_dias", label: "Aviso 3 dias antes" },
                { key: "template_vencimento", label: "Aviso no dia do vencimento" },
              ].map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label>{f.label}</Label>
                  <Textarea
                    rows={3}
                    value={cfg[f.key] ?? ""}
                    onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })}
                  />
                </div>
              ))}
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar mensagens"}
              </Button>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
