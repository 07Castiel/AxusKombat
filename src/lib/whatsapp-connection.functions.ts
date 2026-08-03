import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getTenantAdmin(ctx: { supabase: any; userId: string }): Promise<string> {
  const { data: roles, error } = await ctx.supabase
    .from("user_roles").select("role, tenant_id").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const admin = (roles ?? []).find((r: any) => r.role === "admin");
  if (!admin) throw new Error("Apenas administradores podem acessar esta área");
  return admin.tenant_id as string;
}

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
    const tenantId = await getTenantAdmin(context as any);
    const supabase = (context as any).supabase;
    const { data, error } = await supabase
      .from("whatsapp_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    return {
      exists: !!data,
      status: (data?.status as string) ?? "desconectado",
      connected: !!data?.connected,
      phone_number: data?.phone_number ?? null,
      phone_display: formatBrPhone(data?.phone_number ?? null),
      last_connection: data?.last_connection ?? null,
    };
  });

export const connectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const evo = await import("@/lib/evolution.server");

    const instanceName = evo.makeInstanceName(tenantId);

    // Ensure row exists
    await supabaseAdmin.from("whatsapp_connections").upsert(
      { tenant_id: tenantId, instance_name: instanceName, status: "conectando" },
      { onConflict: "tenant_id" },
    );

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

    await supabaseAdmin.from("whatsapp_connections").update({
      status: "conectando",
      connected: false,
      last_qr_at: new Date().toISOString(),
    }).eq("tenant_id", tenantId);

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
    const tenantId = await getTenantAdmin(context as any);
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
    await supabaseAdmin.from("whatsapp_connections").update(update).eq("tenant_id", tenantId);

    // Ao reconectar, reprograma imediatamente as mensagens que falharam por desconexão
    // e dispara o worker para reenviá-las.
    if (mapped === "conectado" && !(row as any).connected) {
      const { data: pendentes } = await supabaseAdmin.from("notificacoes")
        .update({ tentativas: 0, proxima_tentativa: new Date().toISOString() })
        .eq("tenant_id", tenantId).eq("status", "falhou")
        .in("erro_codigo", ["whatsapp_desconectado", "servico_indisponivel", "desconhecido"])
        .select("id");
      if ((pendentes?.length ?? 0) > 0) {
        const { runDispatch } = await import("@/lib/notifications-dispatch.server");
        await runDispatch().catch(() => null);
      }
    }

    return {
      status: mapped,
      connected: mapped === "conectado",
      phone_number: phone ?? null,
      phone_display: formatBrPhone(phone ?? null),
      last_connection: update.last_connection ?? (row as any).last_connection ?? null,
    };
  });

export const disconnectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const evo = await import("@/lib/evolution.server");

    const { data: row } = await supabaseAdmin
      .from("whatsapp_connections").select("instance_name").eq("tenant_id", tenantId).maybeSingle();
    if (row) await evo.logoutInstance((row as any).instance_name);

    await supabaseAdmin.from("whatsapp_connections").update({
      status: "desconectado", connected: false,
    }).eq("tenant_id", tenantId);

    return { ok: true };
  });

export const sendWhatsappTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ to: z.string().trim().min(8).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantAdmin(context as any);
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
