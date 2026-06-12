import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: ReturnType<typeof Object>; userId: string }) {
  // requireSupabaseAuth provides ctx.supabase (RLS as user) — but we need admin check.
  const supabase = (ctx as unknown as { supabase: import("@supabase/supabase-js").SupabaseClient }).supabase;
  const { data, error } = await supabase.rpc("has_role", { _user_id: (ctx as unknown as { userId: string }).userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Acesso negado: somente administradores.");
}

type Filters = {
  from?: string | null;
  to?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
};

export const listVisitorLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Filters) => d ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(200, Math.max(10, data.pageSize ?? 50));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabaseAdmin
      .from("visitor_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(
        `ip_address.ilike.%${s}%,city.ilike.%${s}%,country.ilike.%${s}%,current_page.ilike.%${s}%,browser.ilike.%${s}%`,
      );
    }
    const { data: rows, count, error } = await q.range(from, to);
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, page, pageSize };
  });

export const visitorStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string | null; to?: string | null }) => d ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("visitor_logs")
      .select("created_at, country, region, city, browser, operating_system, device_type, session_id, is_logged_user");
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q.limit(20000);
    if (error) throw error;

    const list = rows ?? [];
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const total = list.length;
    const uniqueVisitors = new Set(list.map((r) => r.session_id ?? "")).size;
    const logged = list.filter((r) => r.is_logged_user).length;
    const notLogged = total - logged;
    const today = list.filter((r) => r.created_at >= startToday).length;
    const week = list.filter((r) => r.created_at >= startWeek).length;
    const month = list.filter((r) => r.created_at >= startMonth).length;

    const count = <T,>(arr: T[], key: (x: T) => string | null | undefined) => {
      const m = new Map<string, number>();
      for (const x of arr) {
        const k = (key(x) || "Desconhecido").toString();
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return Array.from(m.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };

    // Last 30 days series
    const byDay = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of list) {
      const k = r.created_at.slice(0, 10);
      if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + 1);
    }

    return {
      totals: { total, uniqueVisitors, logged, notLogged, today, week, month },
      perDay: Array.from(byDay.entries()).map(([label, value]) => ({ label, value })),
      perCountry: count(list, (r) => r.country).slice(0, 10),
      perRegion: count(list, (r) => r.region).slice(0, 10),
      perCity: count(list, (r) => r.city).slice(0, 10),
      perBrowser: count(list, (r) => r.browser).slice(0, 10),
      perOs: count(list, (r) => r.operating_system).slice(0, 10),
      perDevice: count(list, (r) => r.device_type).slice(0, 10),
    };
  });

export const exportVisitorLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Filters) => d ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("visitor_logs").select("*").order("created_at", { ascending: false }).limit(50000);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(
        `ip_address.ilike.%${s}%,city.ilike.%${s}%,country.ilike.%${s}%,current_page.ilike.%${s}%,browser.ilike.%${s}%`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return { rows: rows ?? [] };
  });

export const deleteVisitorLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("visitor_logs").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
