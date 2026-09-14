/**
 * Centralized WhatsApp messaging service.
 * Server-only. Sends via tenant-scoped Evolution connection.
 */

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export type TemplateVars = {
  nome?: string;
  primeiro_nome?: string;
  academia?: string;
  vencimento?: string;
  valor?: string;
  telefone?: string;
  modalidade?: string;
  plano?: string;
  pix?: string;
  dias_restantes?: string;
  professor?: string;
  link_pagamento?: string;
  assinatura?: string;
};

export function renderTemplate(template: string, vars: TemplateVars): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v ?? "");
  }
  // append assinatura if placeholder ausente e assinatura definida
  if (vars.assinatura && !template.includes("{assinatura}")) {
    out = `${out}\n\n${vars.assinatura}`;
  }
  return out;
}

/**
 * Tenant-scoped sender using Evolution API + whatsapp_connections row.
 *
 * NUNCA lança: o worker envia em laço e uma exceção aqui derrubava a rodada
 * inteira, deixando o resto da fila sem sequer ser tentado. Qualquer falha —
 * inclusive a leitura de whatsapp_connections — volta como `{ ok: false }`
 * para que a notificação seja marcada e a próxima da fila siga.
 */
export async function sendWhatsappByTenant(
  tenantId: string,
  phone: string,
  message: string,
): Promise<SendResult> {
  const to = normalizePhone(phone);
  if (!to) return { ok: false, error: "Número de telefone inválido" };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const evo = await import("@/lib/evolution.server");
    const { data: conn, error } = await supabaseAdmin
      .from("whatsapp_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (error) return { ok: false, error: `Falha ao ler a conexão do WhatsApp: ${error.message}` };
    if (!conn) return { ok: false, error: "WhatsApp não conectado para esta academia" };
    if (!(conn as any).connected) return { ok: false, error: "WhatsApp desconectado — reconecte pelo painel" };
    const r = await evo.sendText((conn as any).instance_name, to, message);
    return { ok: r.ok, providerMessageId: r.id, error: r.error };
  } catch (e) {
    const detalhe = (e as { message?: string })?.message || String(e);
    return { ok: false, error: `Falha inesperada no envio: ${detalhe}`.slice(0, 200) };
  }
}
