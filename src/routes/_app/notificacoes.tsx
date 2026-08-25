import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Send, RefreshCw, Play, Save, MessageSquare, QrCode, Smartphone, Wifi, WifiOff,
  Loader2, Megaphone, Plus, Trash2, Settings2, FileText, History, X,
  AlertTriangle, CheckCircle2,
} from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { translateError } from "@/lib/errors";
import { erroLabel, erroAcao } from "@/lib/notification-errors";
import {
  getNotificationSettings, saveNotificationSettings,
  listTemplates, upsertTemplate, deleteTemplate,
  listNotifications, resendNotification, runDispatchNow,
  getNotificationsHealth, retryAllFailed, discardAllFailed,
  resendPendingAfterReconnect, discardPendingAfterReconnect,
} from "@/lib/notifications.functions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
      { name: "description", content: "Automação de mensagens, conexão WhatsApp e histórico de envios." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const TIPO_LABEL: Record<string, string> = {
  lembrete: "Lembrete", vencimento: "Vencimento", atraso: "Atraso",
  boas_vindas: "Boas-vindas", manual: "Manual", COMUNICADO: "Comunicado",
};

const VARIAVEIS = [
  "primeiro_nome", "nome", "academia", "vencimento", "valor",
  "telefone", "modalidade", "plano", "pix", "dias_restantes",
  "professor", "link_pagamento", "assinatura",
];

const TIMEZONES = [
  "America/Sao_Paulo", "America/Fortaleza", "America/Manaus",
  "America/Rio_Branco", "America/Belem", "America/Noronha",
];

function NotificacoesPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => { if (!loading && !isAdmin) navigate({ to: "/" }); }, [loading, isAdmin, navigate]);
  if (!isAdmin) return null;

  return (
    <div>
      <PageHeader
        title="Notificações"
        description="Automação de mensagens, conexão WhatsApp e histórico de envios"
      />
      <ServiceStatus qc={qc} />
      <Tabs defaultValue="whatsapp" className="space-y-4">
        <TabsList>
          <TabsTrigger value="whatsapp"><Wifi className="h-3.5 w-3.5 mr-1"/>WhatsApp</TabsTrigger>
          <TabsTrigger value="automacao"><Settings2 className="h-3.5 w-3.5 mr-1"/>Automação</TabsTrigger>
          <TabsTrigger value="modelos"><FileText className="h-3.5 w-3.5 mr-1"/>Modelos</TabsTrigger>
          <TabsTrigger value="comunicados"><Megaphone className="h-3.5 w-3.5 mr-1"/>Comunicados</TabsTrigger>
          <TabsTrigger value="historico"><History className="h-3.5 w-3.5 mr-1"/>Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp"><TabWhatsapp /></TabsContent>
        <TabsContent value="automacao"><TabAutomacao qc={qc} /></TabsContent>
        <TabsContent value="modelos"><TabModelos qc={qc} /></TabsContent>
        <TabsContent value="comunicados"><TabComunicados /></TabsContent>
        <TabsContent value="historico"><TabHistorico qc={qc} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== STATUS DO SERVIÇO ====================
function ServiceStatus({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const health = useServerFn(getNotificationsHealth);
  const retryAll = useServerFn(retryAllFailed);
  const discardAll = useServerFn(discardAllFailed);
  const [retrying, setRetrying] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const hq = useQuery({
    queryKey: ["notifications_health"],
    queryFn: () => health(),
    refetchInterval: 60_000,
  });
  const h: any = hq.data;

  async function handleRetryAll() {
    setRetrying(true);
    try {
      const r: any = await retryAll();
      toast.success(`Reenvio executado: ${r?.summary?.sent ?? 0} enviada(s), ${r?.summary?.failed ?? 0} falha(s)`);
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
      qc.invalidateQueries({ queryKey: ["notifications_health"] });
    } catch (e: any) { toast.error(translateError(e)); }
    finally { setRetrying(false); }
  }

  async function handleDiscardAll() {
    setDiscarding(true);
    try {
      const r: any = await discardAll();
      toast.success(`${r?.total ?? 0} mensagem(ns) com falha descartada(s)`);
      setDiscardOpen(false);
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
      qc.invalidateQueries({ queryKey: ["notifications_health"] });
    } catch (e: any) { toast.error(translateError(e)); }
    finally { setDiscarding(false); }
  }


  if (!h) return null;

  const cor = h.estado === "ativo" ? "text-emerald-500"
    : h.estado === "instavel" ? "text-amber-500" : "text-destructive";
  const rotulo = h.estado === "ativo" ? "Servidor ativo"
    : h.estado === "instavel" ? "Servidor ativo com pendências" : "Servidor inativo";

  return (
    <div className="space-y-3 mb-4">
      <Card className="p-4 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-2">
          <span className={`relative flex h-2.5 w-2.5`}>
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${h.estado === "ativo" ? "bg-emerald-500" : h.estado === "instavel" ? "bg-amber-500" : "bg-destructive"}`} />
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${h.estado === "ativo" ? "bg-emerald-500" : h.estado === "instavel" ? "bg-amber-500" : "bg-destructive"}`} />
          </span>
          <div>
            <p className={`text-sm font-semibold uppercase tracking-wider ${cor}`}>{rotulo}</p>
            <p className="text-xs text-muted-foreground">
              {h.ultima_execucao
                ? `Última verificação há ${h.minutos_desde_ultima} min`
                : "Nenhuma verificação registrada ainda"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {h.whatsapp.conectado
            ? <><Wifi className="h-4 w-4 text-emerald-500" /><span>WhatsApp conectado</span></>
            : <><WifiOff className="h-4 w-4 text-destructive" /><span>WhatsApp desconectado</span></>}
        </div>

        <div className="flex items-center gap-6 text-sm">
          <span><strong>{h.fila.agendadas}</strong> <span className="text-muted-foreground">na fila</span></span>
          <span><strong>{h.fila.atrasadas}</strong> <span className="text-muted-foreground">aguardando envio</span></span>
          <span className={h.fila.falhas > 0 ? "text-destructive" : ""}>
            <strong>{h.fila.falhas}</strong> <span className="text-muted-foreground">com falha</span>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => hq.refetch()}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          {h.fila.falhas > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => setDiscardOpen(true)} disabled={discarding}>
                {discarding ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Não enviar
              </Button>
              <Button size="sm" onClick={handleRetryAll} disabled={retrying}>
                {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Reenviar falhas
              </Button>
            </>
          )}
        </div>

      </Card>

      {h.falhas_por_motivo.length > 0 && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 space-y-2">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-semibold uppercase tracking-wider">
              Mensagens automáticas não enviadas
            </p>
          </div>
          <ul className="space-y-1 text-sm">
            {h.falhas_por_motivo.map((f: any) => (
              <li key={f.codigo} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{f.total}×</span>
                <span>{erroLabel(f.codigo)}</span>
                <span className="text-muted-foreground">— {erroAcao(f.codigo)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {h.estado === "ativo" && h.fila.falhas === 0 && h.fila.atrasadas === 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Todas as mensagens automáticas estão em dia.
        </p>
      )}
    </div>
  );
}

// ============================ WHATSAPP ============================
function TabWhatsapp() {
  const qc = useQueryClient();
  const getConn = useServerFn(getWhatsappConnection);
  const connect = useServerFn(connectWhatsapp);
  const refresh = useServerFn(refreshWhatsappStatus);
  const disconnect = useServerFn(disconnectWhatsapp);
  const sendTest = useServerFn(sendWhatsappTest);
  const resendPending = useServerFn(resendPendingAfterReconnect);
  const discardPending = useServerFn(discardPendingAfterReconnect);
  const [pendentes, setPendentes] = useState(0);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingBusy, setPendingBusy] = useState(false);
  const askedRef = useRef(false);

  function maybeAskPending(s: any) {
    if (s?.connected && (s?.pendentes_reconexao ?? 0) > 0 && !askedRef.current) {
      askedRef.current = true;
      setPendentes(s.pendentes_reconexao);
      setPendingOpen(true);
    }
  }

  async function handleResendPending() {
    setPendingBusy(true);
    try {
      const r: any = await resendPending();
      toast.success(`${r.enviadas} mensagem(ns) reenviada(s)${r.falhas ? `, ${r.falhas} com falha` : ""}`);
      setPendingOpen(false);
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
      qc.invalidateQueries({ queryKey: ["notifications_health"] });
      qc.invalidateQueries({ queryKey: ["whatsapp_connection"] });
    } catch (e: any) { toast.error(translateError(e)); }
    finally { setPendingBusy(false); }
  }

  async function handleDiscardPending() {
    setPendingBusy(true);
    try {
      const r: any = await discardPending();
      toast.success(`${r.total} mensagem(ns) marcada(s) como não reenviada(s)`);
      setPendingOpen(false);
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
      qc.invalidateQueries({ queryKey: ["notifications_health"] });
      qc.invalidateQueries({ queryKey: ["whatsapp_connection"] });
    } catch (e: any) { toast.error(translateError(e)); }
    finally { setPendingBusy(false); }
  }

  const connQuery = useQuery({ queryKey: ["whatsapp_connection"], queryFn: () => getConn() });
  useEffect(() => { maybeAskPending(connQuery.data); }, [connQuery.data]);
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const pollRef = useRef<number | null>(null);
  function stopPolling() { if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; } }
  useEffect(() => () => stopPolling(), []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const r: any = await connect();
      setQr(r.qr); setQrOpen(true); stopPolling();
      pollRef.current = window.setInterval(async () => {
        try {
          const s: any = await refresh();
          qc.setQueryData(["whatsapp_connection"], s);
          if (s.connected) { stopPolling(); setQrOpen(false); toast.success(`WhatsApp conectado${s.phone_display ? ` (${s.phone_display})` : ""}`); maybeAskPending(s); }
        } catch { /* retry */ }
      }, 3000);
    } catch (e: any) { toast.error(translateError(e)); }
    finally { setConnecting(false); }
  }
  async function handleDisconnect() {
    if (!confirm("Desconectar o WhatsApp desta academia?")) return;
    try { await disconnect(); toast.success("WhatsApp desconectado"); qc.invalidateQueries({ queryKey: ["whatsapp_connection"] }); }
    catch (e: any) { toast.error(translateError(e)); }
  }
  async function handleRefresh() { try { const s: any = await refresh(); qc.setQueryData(["whatsapp_connection"], s); maybeAskPending(s); } catch (e: any) { toast.error(translateError(e)); } }
  async function handleSendTest() {
    if (!testTo.trim()) return toast.error("Informe um número para teste");
    setSendingTest(true);
    try {
      const r: any = await sendTest({ data: { to: testTo.trim() } });
      if (r.ok) toast.success("Mensagem enviada com sucesso"); else toast.error(r.error ?? "Falha ao enviar mensagem");
    } catch (e: any) { toast.error(translateError(e)); } finally { setSendingTest(false); }
  }

  const conn = connQuery.data as any;
  const status: "conectado" | "conectando" | "desconectado" = conn?.status ?? "desconectado";
  const statusLabel = status === "conectado" ? "Conectado" : status === "conectando" ? "Conectando" : "Desconectado";

  return (
    <div className="space-y-4">
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
              Status: <strong className={status === "conectado" ? "text-emerald-500" : status === "conectando" ? "text-amber-500" : "text-muted-foreground"}>{statusLabel}</strong>
            </p>
            {conn?.phone_display && <p className="text-sm">Número conectado: <strong>{conn.phone_display}</strong></p>}
            {conn?.last_connection && <p className="text-xs text-muted-foreground">Última conexão: {new Date(conn.last_connection).toLocaleString("pt-BR")}</p>}
            {status === "desconectado" && conn?.last_connection && <p className="text-xs text-destructive">Conexão perdida — reconecte para retomar os envios.</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={handleRefresh} title="Atualizar status"><RefreshCw className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-6">
          <Button onClick={handleConnect} disabled={connecting}>
            <QrCode className="h-4 w-4" /> {connecting ? "Gerando QR…" : status === "conectado" ? "Reconectar WhatsApp" : "Conectar WhatsApp"}
          </Button>
          {status === "conectado" && <Button variant="outline" onClick={handleDisconnect}>Desconectar</Button>}
        </div>
      </Card>

      <Card className="p-6 max-w-2xl space-y-3">
        <h3 className="font-display uppercase tracking-wider text-metal-light flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Mensagem de teste
        </h3>
        <p className="text-xs text-muted-foreground">Envia uma mensagem de verificação para o número informado.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-48">
            <Label className="text-xs">Número para teste</Label>
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          <Button onClick={handleSendTest} disabled={sendingTest || status !== "conectado"}>
            <Send className="h-4 w-4" /> {sendingTest ? "Enviando…" : "Enviar mensagem de teste"}
          </Button>
        </div>
        {status !== "conectado" && <p className="text-xs text-muted-foreground">Conecte o WhatsApp para habilitar o envio.</p>}
      </Card>

      <Dialog open={qrOpen} onOpenChange={(o) => { setQrOpen(o); if (!o) stopPolling(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Escaneie o QR Code</DialogTitle>
            <DialogDescription>Use o WhatsApp do celular para conectar.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {qr ? <img src={qr} alt="QR Code WhatsApp" className="w-64 h-64 bg-white p-2 rounded" />
              : <div className="w-64 h-64 flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            <div className="text-xs text-muted-foreground space-y-2 w-full">
              <p className="flex items-center gap-1 font-semibold text-foreground"><Smartphone className="h-3 w-3" /> Android</p>
              <p>WhatsApp → Menu (⋮) → Dispositivos conectados → Conectar dispositivo</p>
              <p className="flex items-center gap-1 font-semibold text-foreground mt-2"><Smartphone className="h-3 w-3" /> iPhone</p>
              <p>WhatsApp → Configurações → Dispositivos conectados → Conectar dispositivo</p>
            </div>
            <p className="text-xs text-amber-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Aguardando conexão…</p>
            <Button variant="outline" size="sm" onClick={handleConnect} disabled={connecting}><RefreshCw className="h-3 w-3" /> Gerar novo QR</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingOpen} onOpenChange={(o) => { if (!pendingBusy) setPendingOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wifi className="h-5 w-5 text-emerald-500" /> WhatsApp reconectado</DialogTitle>
            <DialogDescription>
              Existem <strong>{pendentes} mensagem(ns) não enviada(s)</strong> durante a desconexão. Deseja reenviá-las?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleDiscardPending} disabled={pendingBusy}>Não reenviar</Button>
            <Button onClick={handleResendPending} disabled={pendingBusy}>
              {pendingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Reenviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================ AUTOMACAO ============================
function DaysChips({ value, onChange, placeholder }: { value: number[]; onChange: (v: number[]) => void; placeholder: string }) {
  const [input, setInput] = useState("");
  function add() {
    const n = parseInt(input.trim(), 10);
    if (!isNaN(n) && n > 0 && n <= 30 && !value.includes(n)) onChange([...value, n].sort((a, b) => a - b));
    setInput("");
  }
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {value.map((d) => (
        <span key={d} className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ background: "rgba(181,0,0,0.15)", border: "1px solid rgba(181,0,0,0.35)" }}>
          {d} {d === 1 ? "dia" : "dias"}
          <button onClick={() => onChange(value.filter((x) => x !== d))} className="hover:text-destructive"><X className="h-3 w-3" /></button>
        </span>
      ))}
      <div className="flex gap-1">
        <Input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder} className="w-24 h-8 text-xs" />
        <Button size="sm" variant="outline" onClick={add} className="h-8"><Plus className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

function TabAutomacao({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const getSettings = useServerFn(getNotificationSettings);
  const saveSettings = useServerFn(saveNotificationSettings);
  const runNow = useServerFn(runDispatchNow);
  const settingsQuery = useQuery({ queryKey: ["notification_settings"], queryFn: () => getSettings() });
  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (settingsQuery.data) setForm({ ...settingsQuery.data }); }, [settingsQuery.data]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      const r: any = await saveSettings({ data: {
        dias_antes_lembrete: form.dias_antes_lembrete ?? [],
        enviar_no_vencimento: !!form.enviar_no_vencimento,
        dias_apos_vencimento: form.dias_apos_vencimento ?? [],
        hora_inicio: (form.hora_inicio ?? "08:00").slice(0, 5),
        hora_fim: (form.hora_fim ?? "20:00").slice(0, 5),
        hora_preferencial: (form.hora_preferencial ?? "09:00").slice(0, 5),
        timezone: form.timezone ?? "America/Sao_Paulo",
        pix_chave: form.pix_chave ?? null,
        assinatura: form.assinatura ?? null,
      }});
      toast.success(`Configurações salvas. ${r.reagendadas ?? 0} mensalidade(s) reagendadas.`);
      qc.invalidateQueries({ queryKey: ["notification_settings"] });
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
    } catch (e: any) { toast.error(translateError(e)); } finally { setSaving(false); }
  }

  async function handleRunNow() {
    setRunning(true);
    try {
      const r: any = await runNow();
      const s = r?.summary ?? {};
      toast.success(`Verificação concluída — enviadas: ${s.sent ?? 0} · falhas: ${s.failed ?? 0} · fora da janela: ${s.skipped_window ?? 0}`);
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
    } catch (e: any) { toast.error(translateError(e)); } finally { setRunning(false); }
  }

  if (!form) return <Card className="p-8 text-center text-muted-foreground">Carregando…</Card>;

  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="p-6 space-y-6">
        <div>
          <h3 className="font-display uppercase tracking-wider text-metal-light mb-3">Regras de envio</h3>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Enviar lembrete N dias ANTES do vencimento</Label>
              <div className="mt-2"><DaysChips value={form.dias_antes_lembrete ?? []} onChange={(v) => setForm({ ...form, dias_antes_lembrete: v })} placeholder="ex: 2" /></div>
            </div>
            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <Label>Enviar no dia do vencimento</Label>
                <p className="text-xs text-muted-foreground">Dispara automaticamente na data exata.</p>
              </div>
              <Switch checked={!!form.enviar_no_vencimento} onCheckedChange={(v) => setForm({ ...form, enviar_no_vencimento: v })} />
            </div>
            <div className="border-t pt-4">
              <Label className="text-xs">Enviar cobrança N dias APÓS o vencimento</Label>
              <p className="text-[10px] text-muted-foreground mb-2">Deixe vazio para não enviar.</p>
              <DaysChips value={form.dias_apos_vencimento ?? []} onChange={(v) => setForm({ ...form, dias_apos_vencimento: v })} placeholder="ex: 1" />
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="font-display uppercase tracking-wider text-metal-light mb-3">Janela de horário</h3>
          <p className="text-xs text-muted-foreground mb-3">Nunca envia mensagens fora deste intervalo, em nenhuma hipótese.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Horário permitido — início</Label>
              <Input type="time" value={(form.hora_inicio ?? "08:00").slice(0,5)} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Horário permitido — fim</Label>
              <Input type="time" value={(form.hora_fim ?? "20:00").slice(0,5)} onChange={(e) => setForm({ ...form, hora_fim: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Horário preferencial</Label>
              <Input type="time" value={(form.hora_preferencial ?? "09:00").slice(0,5)} onChange={(e) => setForm({ ...form, hora_preferencial: e.target.value })} />
            </div>
          </div>
          <div className="mt-3">
            <Label className="text-xs">Fuso horário</Label>
            <Select value={form.timezone ?? "America/Sao_Paulo"} onValueChange={(v) => setForm({ ...form, timezone: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h3 className="font-display uppercase tracking-wider text-metal-light">Personalização</h3>
          <div>
            <Label className="text-xs">Chave PIX (variável {"{pix}"})</Label>
            <Input value={form.pix_chave ?? ""} onChange={(e) => setForm({ ...form, pix_chave: e.target.value })} placeholder="CPF, CNPJ, e-mail ou chave aleatória" />
          </div>
          <div>
            <Label className="text-xs">Assinatura padrão (variável {"{assinatura}"})</Label>
            <Textarea rows={2} value={form.assinatura ?? ""} onChange={(e) => setForm({ ...form, assinatura: e.target.value })} placeholder="Ex: Equipe Axus Kombat" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar configurações"}</Button>
          <Button variant="outline" onClick={handleRunNow} disabled={running}>
            <Play className="h-4 w-4" /> {running ? "Executando…" : "Executar verificações agora"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Verifica todos os alunos e envia imediatamente todas as mensagens programadas para hoje.</p>
      </Card>
    </div>
  );
}

// ============================ MODELOS ============================
function TabModelos({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const list = useServerFn(listTemplates);
  const upsert = useServerFn(upsertTemplate);
  const del = useServerFn(deleteTemplate);
  const tplQuery = useQuery({ queryKey: ["notification_templates"], queryFn: () => list() });

  const [editing, setEditing] = useState<any | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function open(t?: any) { setEditing(t ?? { tipo: "lembrete", dias_offset: -2, mensagem: "", ativo: true }); }
  function insertVar(v: string) {
    if (!editing) return;
    const ta = textareaRef.current;
    const insert = `{${v}}`;
    if (ta) {
      const start = ta.selectionStart, end = ta.selectionEnd, val = editing.mensagem ?? "";
      const next = val.slice(0, start) + insert + val.slice(end);
      setEditing({ ...editing, mensagem: next });
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + insert.length, start + insert.length); }, 0);
    } else {
      setEditing({ ...editing, mensagem: (editing.mensagem ?? "") + insert });
    }
  }
  async function save() {
    try {
      await upsert({ data: {
        id: editing.id ?? null, tipo: editing.tipo, dias_offset: Number(editing.dias_offset),
        mensagem: editing.mensagem, ativo: !!editing.ativo,
      }});
      toast.success("Modelo salvo");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["notification_templates"] });
    } catch (e: any) { toast.error(translateError(e)); }
  }
  async function remove(id: string) {
    if (!confirm("Remover este modelo?")) return;
    try { await del({ data: { id } }); toast.success("Modelo removido"); qc.invalidateQueries({ queryKey: ["notification_templates"] }); }
    catch (e: any) { toast.error(translateError(e)); }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">Modelos por academia. Use variáveis {`{...}`} — substituídas no envio.</p>
        <Button onClick={() => open()}><Plus className="h-4 w-4" /> Novo modelo</Button>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Deslocamento</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tplQuery.isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
            {!tplQuery.isLoading && (tplQuery.data?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum modelo cadastrado.</TableCell></TableRow>
            )}
            {(tplQuery.data ?? []).map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs uppercase font-semibold">{TIPO_LABEL[t.tipo] ?? t.tipo}</TableCell>
                <TableCell className="text-xs">{t.dias_offset === 0 ? "No dia" : t.dias_offset < 0 ? `${-t.dias_offset} dia(s) antes` : `${t.dias_offset} dia(s) depois`}</TableCell>
                <TableCell className="text-xs max-w-md truncate" title={t.mensagem}>{t.mensagem}</TableCell>
                <TableCell><StatusBadge status={t.ativo ? "ativo" : "vencida"} /></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => open(t)}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar modelo" : "Novo modelo"}</DialogTitle>
            <DialogDescription>O modelo é selecionado pelo tipo + deslocamento.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={editing.tipo} onValueChange={(v) => setEditing({ ...editing, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lembrete">Lembrete (antes do vencimento)</SelectItem>
                      <SelectItem value="vencimento">Vencimento (no dia)</SelectItem>
                      <SelectItem value="atraso">Atraso (após vencimento)</SelectItem>
                      <SelectItem value="boas_vindas">Boas-vindas</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Dias de deslocamento</Label>
                  <Input type="number" value={editing.dias_offset} onChange={(e) => setEditing({ ...editing, dias_offset: Number(e.target.value) })} />
                  <p className="text-[10px] text-muted-foreground mt-1">Negativo = antes, 0 = vencimento, positivo = depois.</p>
                </div>
              </div>
              <div>
                <Label className="text-xs">Mensagem</Label>
                <Textarea ref={textareaRef} rows={5} value={editing.mensagem ?? ""} onChange={(e) => setEditing({ ...editing, mensagem: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Variáveis (clique para inserir)</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {VARIAVEIS.map((v) => (
                    <button key={v} type="button" onClick={() => insertVar(v)}
                      className="px-2 py-1 rounded text-[10px] font-mono hover:opacity-80"
                      style={{ background: "rgba(181,0,0,0.1)", border: "1px solid rgba(181,0,0,0.3)" }}>
                      {`{${v}}`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={!!editing.ativo} onCheckedChange={(v) => setEditing({ ...editing, ativo: v })} />
                <Label className="text-xs">Ativo</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save}><Save className="h-4 w-4" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================ COMUNICADOS ============================
function TabComunicados() {
  const qc = useQueryClient();
  const enviar = useServerFn(enviarComunicado);
  const getConn = useServerFn(getWhatsappConnection);
  const connQuery = useQuery({ queryKey: ["whatsapp_connection"], queryFn: () => getConn() });
  const status = (connQuery.data as any)?.status ?? "desconectado";
  const [comunicado, setComunicado] = useState({ mensagem: "", categoria: "todos" as "todos"|"adulto"|"kids", apenas_ativos: true });
  const [sending, setSending] = useState(false);

  async function handleEnviar() {
    if (!comunicado.mensagem.trim()) return toast.error("Digite uma mensagem");
    if (!confirm(`Enviar comunicado para ${comunicado.categoria === "todos" ? "todos" : comunicado.categoria} alunos${comunicado.apenas_ativos ? " ativos" : ""}?`)) return;
    setSending(true);
    try {
      const r: any = await enviar({ data: comunicado });
      toast.success(`Comunicado enviado: ${r.sent} de ${r.total} (${r.failed} falhas, ${r.skipped} sem telefone)`);
      setComunicado({ ...comunicado, mensagem: "" });
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
    } catch (e: any) { toast.error(translateError(e)); } finally { setSending(false); }
  }

  return (
    <Card className="p-6 max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-primary"/>
        <h3 className="font-display uppercase tracking-wider text-metal-light">Enviar comunicado em massa</h3>
      </div>
      <p className="text-xs text-muted-foreground">Envia uma mensagem única via WhatsApp para um grupo de alunos.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Para</Label>
          <Select value={comunicado.categoria} onValueChange={(v: any) => setComunicado({...comunicado, categoria: v})}>
            <SelectTrigger className="mt-1.5"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os alunos</SelectItem>
              <SelectItem value="adulto">Apenas adulto</SelectItem>
              <SelectItem value="kids">Apenas kids</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={comunicado.apenas_ativos} onChange={(e) => setComunicado({...comunicado, apenas_ativos: e.target.checked})}/>
            Apenas alunos ativos
          </label>
        </div>
      </div>
      <div>
        <Label>Mensagem</Label>
        <Textarea rows={5} placeholder="Olá! Avisamos que..." value={comunicado.mensagem}
          onChange={(e) => setComunicado({...comunicado, mensagem: e.target.value})} className="mt-1.5" />
        <p className="text-[10px] text-muted-foreground mt-1">{comunicado.mensagem.length}/2000 caracteres</p>
      </div>
      <Button onClick={handleEnviar} disabled={sending || status !== "conectado" || !comunicado.mensagem.trim()}
        className="gradient-primary text-primary-foreground">
        <Send className="h-4 w-4 mr-2"/>{sending ? "Enviando…" : "Enviar comunicado"}
      </Button>
      {status !== "conectado" && <p className="text-xs text-destructive">Conecte o WhatsApp primeiro na aba "WhatsApp".</p>}
    </Card>
  );
}

// ============================ HISTORICO ============================
function TabHistorico({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const list = useServerFn(listNotifications);
  const resend = useServerFn(resendNotification);
  const retryAll = useServerFn(retryAllFailed);
  const [filters, setFilters] = useState<{ status: string; tipo: string }>({ status: "", tipo: "" });
  const [retrying, setRetrying] = useState(false);
  const notifQuery = useQuery({
    queryKey: ["notificacoes", filters],
    queryFn: () => list({ data: {
      status: (filters.status || null) as any,
      tipo: filters.tipo || null,
      limit: 200,
    }}),
  });
  const [preview, setPreview] = useState<any | null>(null);

  async function handleResend(id: string) {
    try {
      const r: any = await resend({ data: { notification_id: id } });
      if (r.ok) toast.success("Notificação reenviada"); else toast.error(r.error ?? "Falha ao reenviar");
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
      qc.invalidateQueries({ queryKey: ["notifications_health"] });
    } catch (e: any) { toast.error(translateError(e)); }
  }

  async function handleRetryAll() {
    setRetrying(true);
    try {
      const r: any = await retryAll();
      toast.success(`Reenvio executado: ${r?.summary?.sent ?? 0} enviada(s), ${r?.summary?.failed ?? 0} falha(s)`);
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
      qc.invalidateQueries({ queryKey: ["notifications_health"] });
    } catch (e: any) { toast.error(translateError(e)); }
    finally { setRetrying(false); }
  }

  const rows = useMemo(() => (notifQuery.data ?? []) as any[], [notifQuery.data]);

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filters.status || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? "" : v }))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="agendada">Agendada</SelectItem>
              <SelectItem value="enviada">Enviada</SelectItem>
              <SelectItem value="falhou">Falhou</SelectItem>
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
              <SelectItem value="lembrete">Lembrete</SelectItem>
              <SelectItem value="vencimento">Vencimento</SelectItem>
              <SelectItem value="atraso">Atraso</SelectItem>
              <SelectItem value="boas_vindas">Boas-vindas</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="COMUNICADO">Comunicado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["notificacoes"] })}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
        <Button variant="outline" onClick={handleRetryAll} disabled={retrying}>
          {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Reenviar falhas
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agendada</TableHead>
              <TableHead>Enviada</TableHead>
              <TableHead>Aluno</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detalhe</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notifQuery.isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
            {!notifQuery.isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma notificação encontrada.</TableCell></TableRow>
            )}
            {rows.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="text-xs">{n.agendada_para ? new Date(n.agendada_para).toLocaleString("pt-BR") : "—"}</TableCell>
                <TableCell className="text-xs">{n.enviada_em ? new Date(n.enviada_em).toLocaleString("pt-BR") : "—"}</TableCell>
                <TableCell className="font-medium">{n.aluno?.nome_completo ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{n.destinatario ?? "—"}</TableCell>
                <TableCell className="text-xs">{TIPO_LABEL[n.tipo] ?? n.tipo}</TableCell>
                <TableCell>
                  <StatusBadge status={
                    n.status === "enviada" ? "ativo" :
                    n.status === "falhou" ? "vencida" :
                    n.status === "cancelada" ? "inativo" : "pendente"
                  } />
                </TableCell>
                <TableCell className="text-xs max-w-xs text-muted-foreground"
                  title={n.erro || n.motivo_cancelamento || n.mensagem || ""}>
                  {n.status === "falhou" ? (
                    <div className="space-y-0.5">
                      <span className="text-destructive block truncate">{erroLabel(n.erro_codigo)}</span>
                      <span className="block truncate">{erroAcao(n.erro_codigo)}</span>
                      {n.proxima_tentativa && (
                        <span className="block">
                          Próxima tentativa: {new Date(n.proxima_tentativa).toLocaleString("pt-BR")}
                          {n.tentativas ? ` (${n.tentativas}ª)` : ""}
                        </span>
                      )}
                    </div>
                  ) : n.motivo_cancelamento ? <span className="text-amber-500 truncate block">{n.motivo_cancelamento}</span>
                    : <span className="truncate block">{n.mensagem ?? "—"}</span>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setPreview(n)}>Ver</Button>
                  {n.status === "falhou" && n.destinatario && (
                    <Button size="sm" variant="ghost" onClick={() => handleResend(n.id)} title="Reenviar"><Send className="h-4 w-4" /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalhes da notificação</DialogTitle></DialogHeader>
          {preview && (
            <div className="space-y-2 text-sm">
              <p><strong>Aluno:</strong> {preview.aluno?.nome_completo ?? "—"}</p>
              <p><strong>Telefone:</strong> {preview.destinatario ?? "—"}</p>
              <p><strong>Tipo:</strong> {TIPO_LABEL[preview.tipo] ?? preview.tipo}</p>
              <p><strong>Agendada para:</strong> {preview.agendada_para ? new Date(preview.agendada_para).toLocaleString("pt-BR") : "—"}</p>
              <p><strong>Enviada em:</strong> {preview.enviada_em ? new Date(preview.enviada_em).toLocaleString("pt-BR") : "—"}</p>
              <p><strong>Status:</strong> {preview.status}</p>
              {preview.erro && <p className="text-destructive"><strong>Erro:</strong> {preview.erro}</p>}
              {preview.motivo_cancelamento && <p className="text-amber-500"><strong>Motivo do cancelamento:</strong> {preview.motivo_cancelamento}</p>}
              <div className="border-t pt-2">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Mensagem</p>
                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 p-3 rounded">{preview.mensagem || "—"}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
