/**
 * Evolution API client — server-only.
 * URL and key live exclusively in env vars; never expose to clients.
 */

const TIMEOUT_MS = 20000;

function baseUrl(): string {
  const u = process.env.EVOLUTION_API_URL;
  if (!u) throw new Error("EVOLUTION_API_URL não configurado no servidor");
  return u.replace(/\/$/, "");
}
function apiKey(): string {
  const k = process.env.EVOLUTION_API_KEY;
  if (!k) throw new Error("EVOLUTION_API_KEY não configurado no servidor");
  return k;
}

async function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", apikey: apiKey(), ...(init.headers || {}) },
      signal: c.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

export function makeInstanceName(tenantId: string): string {
  return `gym_${tenantId.replace(/-/g, "").slice(0, 8)}`;
}

export interface EvoInstanceFetch {
  exists: boolean;
  state?: string; // open | connecting | close
  ownerJid?: string | null;
}

export async function fetchInstance(instanceName: string): Promise<EvoInstanceFetch> {
  const res = await timedFetch(`${baseUrl()}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
  if (res.status === 404) return { exists: false };
  if (!res.ok) return { exists: false };
  const body = await res.json().catch(() => null);
  const arr = Array.isArray(body) ? body : body ? [body] : [];
  if (arr.length === 0) return { exists: false };
  const inst = arr[0];
  const state = inst?.instance?.state ?? inst?.connectionStatus ?? inst?.state;
  const ownerJid = inst?.instance?.owner ?? inst?.ownerJid ?? null;
  return { exists: true, state, ownerJid };
}

export interface EvoCreateOrConnect {
  qrBase64: string | null;
  pairingCode?: string | null;
  state?: string;
}

export async function createInstance(instanceName: string): Promise<EvoCreateOrConnect> {
  const res = await timedFetch(`${baseUrl()}/instance/create`, {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Evolution create HTTP ${res.status}: ${text.slice(0, 300)}`);
  const body = JSON.parse(text);
  const qr = body?.qrcode?.base64 ?? body?.qrcode ?? null;
  return { qrBase64: typeof qr === "string" ? qr : null, state: body?.instance?.status };
}

export async function connectInstance(instanceName: string): Promise<EvoCreateOrConnect> {
  const res = await timedFetch(`${baseUrl()}/instance/connect/${encodeURIComponent(instanceName)}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Evolution connect HTTP ${res.status}: ${text.slice(0, 300)}`);
  const body = text ? JSON.parse(text) : {};
  const qr = body?.base64 ?? body?.qrcode?.base64 ?? body?.qrcode ?? null;
  return { qrBase64: typeof qr === "string" ? qr : null, pairingCode: body?.pairingCode ?? null };
}

export async function connectionState(instanceName: string): Promise<{ state: string; ownerJid?: string | null }> {
  const res = await timedFetch(`${baseUrl()}/instance/connectionState/${encodeURIComponent(instanceName)}`);
  if (!res.ok) return { state: "close" };
  const body = await res.json().catch(() => ({}));
  return {
    state: body?.instance?.state ?? body?.state ?? "close",
    ownerJid: body?.instance?.owner ?? null,
  };
}

export async function logoutInstance(instanceName: string): Promise<void> {
  await timedFetch(`${baseUrl()}/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" }).catch(() => {});
}

export async function deleteInstance(instanceName: string): Promise<void> {
  await timedFetch(`${baseUrl()}/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" }).catch(() => {});
}

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export async function sendText(instanceName: string, phone: string, message: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const to = normalizePhone(phone);
  if (!to) return { ok: false, error: "Número de telefone inválido" };
  const res = await timedFetch(`${baseUrl()}/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: to, text: message }),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `Evolution HTTP ${res.status}: ${text.slice(0, 200)}` };
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  return { ok: true, id: parsed?.key?.id };
}

export function jidToPhone(jid?: string | null): string | null {
  if (!jid) return null;
  const num = jid.split("@")[0]?.split(":")[0];
  return num ?? null;
}

export function mapState(state?: string): "conectado" | "conectando" | "desconectado" {
  const s = (state || "").toLowerCase();
  if (s === "open" || s === "connected") return "conectado";
  if (s === "connecting" || s === "qrcode" || s === "pairing") return "conectando";
  return "desconectado";
}
