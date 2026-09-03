import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/subscription";
import { requireAdmin } from "@/lib/tenant-guard";


function formatBrPhone(num: string | null): string | null {
  if (!num) return null;
  const d = num.replace(/\D+/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return `+${d}`;
}

export const getWhatsappConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem gerenciar o WhatsApp");
    const supabase = (context as any).supabase;
    const { data, error } = await supabase
      .from("whatsapp_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    let pendentes = 0;
    if (data?.connected) {
      const { count } = await supabase.from("notificacoes")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("status", "falhou")
        .eq("erro_codigo", "whatsapp_desconectado");
      pendentes = count ?? 0;
    }
    return {
      exists: !!data,
      status: (data?.status as string) ?? "desconectado",
      connected: !!data?.connected,
      phone_number: data?.phone_number ?? null,
      phone_display: formatBrPhone(data?.phone_number ?? null),
      last_connection: data?.last_connection ?? null,
      pendentes_reconexao: pendentes,
    };
  });

export const connectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .handler(async ({ context }) => {
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem gerenciar o WhatsApp");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const evo = await import("@/lib/evolution.server");

    const instanceName = evo.makeInstanceName(tenantId);

    // Ensure row exists
    const { error: eLinha } = await supabaseAdmin.from("whatsapp_connections").upsert(
      { tenant_id: tenantId, instance_name: instanceName, status: "conectando" },
      { onConflict: "tenant_id" },
    );
    if (eLinha) throw new Error(`Falha ao registrar a conexão: ${eLinha.message}`);

    // Check if instance exists on Evolution side
    let qr: string | null = null;
    let pairingCode: string | null = null;
    let lastErr: string | null = null;

    const info = await evo.fetchInstance(instanceName).catch((e) => {
      lastErr = `fetchInstance: ${e?.message ?? e}`;
      return { exists: false } as const;
    });

    if (!info.exists) {
      try {
        const created = await evo.createInstance(instanceName);
        qr = created.qrBase64;
      } catch (e: any) {
        lastErr = `createInstance: ${e?.message ?? e}`;
      }
    } else {
      try {
        const conn = await evo.connectInstance(instanceName);
        qr = conn.qrBase64;
        pairingCode = conn.pairingCode ?? null;
      } catch (e: any) {
        lastErr = `connectInstance: ${e?.message ?? e}`;
      }
    }

    // Fallback: if no QR, try delete + recreate
    if (!qr) {
      try {
        await evo.logoutInstance(instanceName);
        await evo.deleteInstance(instanceName);
        const created = await evo.createInstance(instanceName);
        qr = created.qrBase64;
      } catch (e: any) {
        lastErr = `recreate: ${e?.message ?? e}`;
      }
    }

    const { error: eQr } = await supabaseAdmin.from("whatsapp_connections").update({
      status: "conectando",
      connected: false,
      last_qr_at: new Date().toISOString(),
    }).eq("tenant_id", tenantId);
    if (eQr) throw new Error(`Falha ao registrar o estado da conexão: ${eQr.message}`);

    if (!qr) {
      console.error("[whatsapp.connect] no QR returned", { instanceName, lastErr, info });
      throw new Error(
        lastErr
          ? `Falha ao gerar QR Code: ${lastErr}`
          : "Não foi possível gerar o QR Code agora. Tente novamente em instantes.",
      );
    }
    const qrImage = qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
    return { qr: qrImage, pairingCode, instanceMasked: "•••••" };
  });

export const refreshWhatsappStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem gerenciar o WhatsApp");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const evo = await import("@/lib/evolution.server");

    const { data: row } = await supabaseAdmin
      .from("whatsapp_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (!row) {
      return { status: "desconectado", connected: false, phone_number: null, phone_display: null, last_connection: null };
    }

    const { state, ownerJid } = await evo.connectionState((row as any).instance_name);
    const mapped = evo.mapState(state);
    const phone = mapped === "conectado" ? evo.jidToPhone(ownerJid) : (row as any).phone_number;
    const update: any = { status: mapped, connected: mapped === "conectado" };
    if (mapped === "conectado") {
      update.phone_number = phone;
      update.last_connection = new Date().toISOString();
    }
    const { error: eStatus } = await supabaseAdmin
      .from("whatsapp_connections").update(update).eq("tenant_id", tenantId);
    if (eStatus) throw new Error(`Falha ao gravar o status da conexão: ${eStatus.message}`);

    // NÃO reenviamos automaticamente. Apenas contamos as mensagens que falharam
    // durante a desconexão para que o usuário decida no diálogo de reconexão.
    let pendentes = 0;
    if (mapped === "conectado") {
      const { count } = await supabaseAdmin.from("notificacoes")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("status", "falhou")
        .eq("erro_codigo", "whatsapp_desconectado");
      pendentes = count ?? 0;
    }

    return {
      status: mapped,
      connected: mapped === "conectado",
      phone_number: phone ?? null,
      phone_display: formatBrPhone(phone ?? null),
      last_connection: update.last_connection ?? (row as any).last_connection ?? null,
      pendentes_reconexao: pendentes,
    };
  });

export const disconnectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .handler(async ({ context }) => {
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem gerenciar o WhatsApp");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const evo = await import("@/lib/evolution.server");

    const { data: row } = await supabaseAdmin
      .from("whatsapp_connections").select("instance_name").eq("tenant_id", tenantId).maybeSingle();
    if (row) await evo.logoutInstance((row as any).instance_name);

    const { error: eLogout } = await supabaseAdmin.from("whatsapp_connections").update({
      status: "desconectado", connected: false,
    }).eq("tenant_id", tenantId);
    if (eLogout) throw new Error(`Desconectado, mas o status não foi gravado: ${eLogout.message}`);

    return { ok: true };
  });

export const sendWhatsappTest = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((input) => z.object({ to: z.string().trim().min(8).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem gerenciar o WhatsApp");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const evo = await import("@/lib/evolution.server");

    const { data: row } = await supabaseAdmin
      .from("whatsapp_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (!row || !(row as any).connected) {
      return { ok: false, error: "WhatsApp não está conectado." };
    }
    const message =
      "Olá!\n\nEsta é uma mensagem de teste enviada pelo sistema.\nA integração com o WhatsApp está funcionando corretamente.";
    const r = await evo.sendText((row as any).instance_name, data.to, message);
    return r;
  });
