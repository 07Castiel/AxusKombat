/**
 * Centralized WhatsApp messaging service.
 * Server-only. All providers (Evolution, Z-API, WhatsApp Cloud API) plug in here.
 *
 * Providers supported (set whatsapp_config.provider):
 *   - "evolution"   : Evolution API
 *   - "zapi"        : Z-API
 *   - "cloud"       : WhatsApp Cloud API (Meta)
 *   - "mock"        : logs only, no external call (for testing)
 */

export type WhatsappProvider = "evolution" | "zapi" | "cloud" | "mock";

export interface WhatsappConfig {
  provider: WhatsappProvider | string;
  instance_name: string | null;
  api_url: string | null;
  api_token: string | null;
  sender_number: string | null;
  enabled: boolean;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  rawResponse?: unknown;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 15000;

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 10) return null;
  // Add Brazil country code if missing (10 or 11 digits)
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

async function timedFetch(url: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export function renderTemplate(
  template: string,
  vars: { nome: string; academia: string; vencimento: string; valor: string },
): string {
  return template
    .replaceAll("{nome}", vars.nome)
    .replaceAll("{academia}", vars.academia)
    .replaceAll("{vencimento}", vars.vencimento)
    .replaceAll("{valor}", vars.valor);
}

export async function sendWhatsapp(
  cfg: WhatsappConfig,
  phone: string,
  message: string,
): Promise<SendResult> {
  if (!cfg.enabled) return { ok: false, error: "WhatsApp desativado na configuração da academia" };
  const to = normalizePhone(phone);
  if (!to) return { ok: false, error: "Número de telefone inválido" };

  const provider = (cfg.provider || "mock").toLowerCase();

  try {
    if (provider === "mock") {
      console.log(`[whatsapp:mock] -> ${to}: ${message}`);
      return { ok: true, providerMessageId: `mock-${Date.now()}` };
    }

    if (provider === "evolution") {
      if (!cfg.api_url || !cfg.api_token || !cfg.instance_name) {
        return { ok: false, error: "Configuração Evolution incompleta (api_url, api_token, instance_name)" };
      }
      const url = `${cfg.api_url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(cfg.instance_name)}`;
      const res = await timedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.api_token },
        body: JSON.stringify({ number: to, text: message }),
      });
      const body = await res.text();
      if (!res.ok) return { ok: false, error: `Evolution HTTP ${res.status}: ${body.slice(0, 300)}` };
      let parsed: any = null;
      try { parsed = JSON.parse(body); } catch { /* ignore */ }
      return { ok: true, providerMessageId: parsed?.key?.id, rawResponse: parsed ?? body };
    }

    if (provider === "zapi") {
      if (!cfg.api_url || !cfg.api_token) {
        return { ok: false, error: "Configuração Z-API incompleta (api_url, api_token)" };
      }
      const url = `${cfg.api_url.replace(/\/$/, "")}/send-text`;
      const res = await timedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": cfg.api_token },
        body: JSON.stringify({ phone: to, message }),
      });
      const body = await res.text();
      if (!res.ok) return { ok: false, error: `Z-API HTTP ${res.status}: ${body.slice(0, 300)}` };
      let parsed: any = null;
      try { parsed = JSON.parse(body); } catch { /* ignore */ }
      return { ok: true, providerMessageId: parsed?.id, rawResponse: parsed ?? body };
    }

    if (provider === "cloud") {
      if (!cfg.api_url || !cfg.api_token || !cfg.sender_number) {
        return { ok: false, error: "Configuração WhatsApp Cloud incompleta (api_url=phone-number-id, api_token, sender_number)" };
      }
      // api_url is expected to be the full Meta endpoint or just the phone number id
      const endpoint = cfg.api_url.startsWith("http")
        ? cfg.api_url
        : `https://graph.facebook.com/v20.0/${cfg.api_url}/messages`;
      const res = await timedFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.api_token}` },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        }),
      });
      const body = await res.text();
      if (!res.ok) return { ok: false, error: `WhatsApp Cloud HTTP ${res.status}: ${body.slice(0, 300)}` };
      let parsed: any = null;
      try { parsed = JSON.parse(body); } catch { /* ignore */ }
      return { ok: true, providerMessageId: parsed?.messages?.[0]?.id, rawResponse: parsed ?? body };
    }

    return { ok: false, error: `Provider não suportado: ${provider}` };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, error: "Timeout ao contatar a API de WhatsApp" };
    return { ok: false, error: e?.message || "Erro desconhecido ao enviar" };
  }
}

export const NOTIFICATION_TYPES = ["AVISO_7_DIAS", "AVISO_3_DIAS", "AVISO_VENCIMENTO"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function templateFor(
  cfg: { template_7_dias: string; template_3_dias: string; template_vencimento: string },
  type: NotificationType,
): string {
  if (type === "AVISO_7_DIAS") return cfg.template_7_dias;
  if (type === "AVISO_3_DIAS") return cfg.template_3_dias;
  return cfg.template_vencimento;
}
