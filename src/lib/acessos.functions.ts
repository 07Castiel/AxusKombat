/**
 * Logs de acesso da plataforma — painel do SaaS (C5).
 *
 * Estas funções liam `visitor_logs` com a chave de serviço e SEM nenhum filtro
 * de tenant, protegidas apenas por `has_role(uid, 'admin')` — que também não
 * olhava tenant. Resultado: todo dono de academia listava, exportava (até
 * 50.000 linhas) e apagava os logs de acesso de TODAS as outras, com IP,
 * cidade, páginas visitadas e user_id.
 *
 * A tabela é da plataforma, não do cliente: não tem tenant_id e nunca teve.
 * Escopá-la por academia exigiria inventar um dono para cada visita, inclusive
 * as anônimas na página de preços. Então a tela muda de lado — sai da área do
 * cliente e passa a viver no /admin-master, com a mesma autenticação de token
 * do resto do painel.
 *
 * A ETAPA 1 já fechou o caminho direto pelo navegador (as policies de
 * visitor_logs e system_logs foram removidas). Isto fecha o caminho pelas
 * server functions, que usam service_role e ignoram RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// Carregado dentro de cada handler, nao no topo: import estatico traria
// `node:crypto` para o bundle do navegador — esta tela e uma rota de cliente.

type Filters = {
  token: string;
  from?: string | null;
  to?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
};

const filtrosSchema = z.object({
  token: z.string().min(1),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  search: z.string().max(120).nullable().optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  pageSize: z.number().int().min(10).max(200).optional(),
});

export const listVisitorLogs = createServerFn({ method: "POST" })
  .inputValidator((d) => filtrosSchema.parse(d))
  .handler(async ({ data }) => {
    const { assertToken } = await import("@/lib/master-token.server");
    assertToken(data.token);
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
  .inputValidator((d) => filtrosSchema.pick({ token: true, from: true, to: true }).parse(d))
  .handler(async ({ data }) => {
    const { assertToken } = await import("@/lib/master-token.server");
    assertToken(data.token);
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
  .inputValidator((d) => filtrosSchema.parse(d))
  .handler(async ({ data }) => {
    const { assertToken } = await import("@/lib/master-token.server");
    assertToken(data.token);
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
  .inputValidator((d) => z.object({ token: z.string().min(1), id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { assertToken } = await import("@/lib/master-token.server");
    assertToken(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("visitor_logs").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
