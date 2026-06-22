import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, RefreshCw, Play, Save, MessageSquare, QrCode, Smartphone, Wifi, WifiOff, Loader2, Megaphone } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { translateError } from "@/lib/errors";
import {
  getWhatsappTemplates, saveWhatsappTemplates,
  listNotifications, resendNotification, runNotificationsNow,
} from "@/lib/notifications.functions";
import {
  getWhatsappConnection, connectWhatsapp, refreshWhatsappStatus,
  disconnectWhatsapp, sendWhatsappTest,
} from "@/lib/whatsapp-connection.functions";
import { enviarComunicado } from "@/lib/comunicados.functions";

export const Route = createFileRoute("/_app/notificacoes")({
  component: NotificacoesPage,
  head: () => ({
    meta: [
      { title: "Notificações | Axus Kombat" },
      { name: "description", content: "Conexão WhatsApp e avisos automáticos de mensalidade." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const TIPO_LABEL: Record<string, string> = {
  AVISO_7_DIAS: "7 dias antes", AVISO_3_DIAS: "3 dias antes", AVISO_VENCIMENTO: "Vencimento", COMUNICADO: "Comunicado",
};

function NotificacoesPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => { if (!loading && !isAdmin) navigate({ to: "/" }); }, [loading, isAdmin, navigate]);

  const getConn = useServerFn(getWhatsappConnection);
  const connect = useServerFn(connectWhatsapp);
  const refresh = useServerFn(refreshWhatsappStatus);
  const disconnect = useServerFn(disconnectWhatsapp);
  const sendTest = useServerFn(sendWhatsappTest);

  const getTpl = useServerFn(getWhatsappTemplates);
  const saveTpl = useServerFn(saveWhatsappTemplates);
  const list = useServerFn(listNotifications);
  const resend = useServerFn(resendNotification);
  const runNow = useServerFn(runNotificationsNow);
  const enviarComunicadoFn = useServerFn(enviarComunicado);

  const connQuery = useQuery({ queryKey: ["whatsapp_connection"], queryFn: () => getConn(), enabled: isAdmin });
  const tplQuery = useQuery({ queryKey: ["whatsapp_templates"], queryFn: () => getTpl(), enabled: isAdmin });
  const [tpl, setTpl] = useState<any>(null);
  useEffect(() => { if (tplQuery.data) setTpl({ ...tplQuery.data }); }, [tplQuery.data]);

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

  // QR modal + polling
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef<number | null>(null);
  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [comunicado, setComunicado] = useState({ mensagem: "", categoria: "todos" as "todos"|"adulto"|"kids", apenas_ativos: true });
  const [enviandoComunicado, setEnviandoComunicado] = useState(false);

  function stopPolling() {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
  }
  useEffect(() => () => stopPolling(), []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const r: any = await connect();
      setQr(r.qr);
      setQrOpen(true);
      stopPolling();
      pollRef.current = window.setInterval(async () => {
        try {
          const s: any = await refresh();
          qc.setQueryData(["whatsapp_connection"], s);
          if (s.connected) {
            stopPolling();
            setQrOpen(false);
            toast.success(`WhatsApp conectado${s.phone_display ? ` (${s.phone_display})` : ""}`);
          }
        } catch { /* silently retry */ }
      }, 3000);
    } catch (e: any) {
      toast.error(translateError(e));
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar o WhatsApp desta academia?")) return;
    try {
      await disconnect();
      toast.success("WhatsApp desconectado");
      qc.invalidateQueries({ queryKey: ["whatsapp_connection"] });
    } catch (e: any) { toast.error(translateError(e)); }
  }

  async function handleRefresh() {
    try {
      const s: any = await refresh();
      qc.setQueryData(["whatsapp_connection"], s);
    } catch (e: any) { toast.error(translateError(e)); }
  }

  async function handleSendTest() {
    if (!testTo.trim()) return toast.error("Informe um número para teste");
    setSendingTest(true);
    try {
      const r: any = await sendTest({ data: { to: testTo.trim() } });
      if (r.ok) toast.success("Mensagem enviada com sucesso");
      else toast.error(r.error ?? "Falha ao enviar mensagem");
    } catch (e: any) { toast.error(translateError(e)); }
    finally { setSendingTest(false); }
  }

  async function handleSaveTpl() {
    if (!tpl) return;
    setSaving(true);
    try {
      await saveTpl({ data: {
        template_7_dias: tpl.template_7_dias,
        template_3_dias: tpl.template_3_dias,
        template_vencimento: tpl.template_vencimento,
      }});
      toast.success("Mensagens salvas");
      qc.invalidateQueries({ queryKey: ["whatsapp_templates"] });
    } catch (e: any) { toast.error(translateError(e)); }
    finally { setSaving(false); }
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

  const conn = connQuery.data as any;
  const status: "conectado" | "conectando" | "desconectado" = conn?.status ?? "desconectado";
  const statusLabel = status === "conectado" ? "Conectado" : status === "conectando" ? "Conectando" : "Desconectado";

  return (
    <div>
      <PageHeader
        title="Notificações"
        description="Conexão WhatsApp e avisos automáticos de mensalidade"
        actions={
          <Button variant="outline" onClick={handleRunNow}>
            <Play className="h-4 w-4" /> Executar agora
          </Button>
        }
      />

      <Tabs defaultValue="whatsapp" className="space-y-4">
        <TabsList>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="templates">Mensagens</TabsTrigger>
          <TabsTrigger value="comunicado"><Megaphone className="h-3.5 w-3.5 mr-1"/>Comunicado</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* ---------------- WhatsApp connection ---------------- */}
        <TabsContent value="whatsapp" className="space-y-4">
          <Card className="p-6 max-w-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {status === "conectado" ? <Wifi className="h-5 w-5 text-emerald-500" /> :
                    status === "conectando" ? <Loader2 className="h-5 w-5 animate-spin text-amber-500" /> :
                    <WifiOff className="h-5 w-5 text-muted-foreground" />}
                  <h3 className="font-display uppercase tracking-wider text-metal-light">WhatsApp da academia</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Status: <strong className={
                    status === "conectado" ? "text-emerald-500" :
                    status === "conectando" ? "text-amber-500" : "text-muted-foreground"
                  }>{statusLabel}</strong>
                </p>
                {conn?.phone_display && (
                  <p className="text-sm">Número conectado: <strong>{conn.phone_display}</strong></p>
                )}
                {conn?.last_connection && (
                  <p className="text-xs text-muted-foreground">
                    Última conexão: {new Date(conn.last_connection).toLocaleString("pt-BR")}
                  </p>
                )}
                {status === "desconectado" && conn?.last_connection && (
                  <p className="text-xs text-destructive">Conexão perdida — reconecte para retomar os envios.</p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={handleRefresh} title="Atualizar status">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 mt-6">
              <Button onClick={handleConnect} disabled={connecting}>
                <QrCode className="h-4 w-4" />
                {connecting ? "Gerando QR…" : status === "conectado" ? "Reconectar WhatsApp" : "Conectar WhatsApp"}
              </Button>
              {status === "conectado" && (
                <Button variant="outline" onClick={handleDisconnect}>Desconectar</Button>
              )}
            </div>
          </Card>

          <Card className="p-6 max-w-2xl space-y-3">
            <h3 className="font-display uppercase tracking-wider text-metal-light flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Mensagem de teste
            </h3>
            <p className="text-xs text-muted-foreground">
              Envia uma mensagem de verificação para o número informado.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 flex-1 min-w-48">
                <Label className="text-xs">Número para teste</Label>
                <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="(11) 99999-9999" />
              </div>
              <Button onClick={handleSendTest} disabled={sendingTest || status !== "conectado"}>
                <Send className="h-4 w-4" /> {sendingTest ? "Enviando…" : "Enviar mensagem de teste"}
              </Button>
            </div>
            {status !== "conectado" && (
              <p className="text-xs text-muted-foreground">Conecte o WhatsApp para habilitar o envio.</p>
            )}
          </Card>
        </TabsContent>

        {/* ---------------- Templates ---------------- */}
        <TabsContent value="templates">
          {!tpl ? <Card className="p-8 text-center text-muted-foreground">Carregando…</Card> : (
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
                    value={tpl[f.key] ?? ""}
                    onChange={(e) => setTpl({ ...tpl, [f.key]: e.target.value })}
                  />
                </div>
              ))}
              <Button onClick={handleSaveTpl} disabled={saving}>
                <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar mensagens"}
              </Button>
            </Card>
          )}
        </TabsContent>

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
      </Tabs>

      {/* ---------------- QR Modal ---------------- */}
      <Dialog open={qrOpen} onOpenChange={(o) => { setQrOpen(o); if (!o) stopPolling(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Escaneie o QR Code</DialogTitle>
            <DialogDescription>Use o WhatsApp do celular para conectar.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {qr ? (
              <img src={qr} alt="QR Code WhatsApp" className="w-64 h-64 bg-white p-2 rounded" />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            <div className="text-xs text-muted-foreground space-y-2 w-full">
              <p className="flex items-center gap-1 font-semibold text-foreground"><Smartphone className="h-3 w-3" /> Android</p>
              <p>WhatsApp → Menu (⋮) → Dispositivos conectados → Conectar dispositivo</p>
              <p className="flex items-center gap-1 font-semibold text-foreground mt-2"><Smartphone className="h-3 w-3" /> iPhone</p>
              <p>WhatsApp → Configurações → Dispositivos conectados → Conectar dispositivo</p>
            </div>
            <p className="text-xs text-amber-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Aguardando conexão…</p>
            <Button variant="outline" size="sm" onClick={handleConnect} disabled={connecting}>
              <RefreshCw className="h-3 w-3" /> Gerar novo QR
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
