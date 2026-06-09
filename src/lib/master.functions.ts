import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function getSecret() {
  const s = process.env.MASTER_ADMIN_PASSWORD;
  if (!s) throw new Error("MASTER_ADMIN_PASSWORD não configurado");
  return s;
}

function signToken(): string {
  const payload = { exp: Date.now() + TOKEN_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [data, sig] = token.split(".");
  if (!data || !sig) return false;
  try {
    const expected = createHmac("sha256", getSecret()).update(data).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function assertToken(token: string | undefined) {
  if (!verifyToken(token)) {
    throw new Error("Sessão de admin mestre inválida ou expirada");
  }
}

export const masterLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ email: z.string().email(), password: z.string().min(1) }).parse(input)
  )
  .handler(async ({ data }) => {
    const expectedEmail = process.env.MASTER_ADMIN_EMAIL;
    const expectedPassword = process.env.MASTER_ADMIN_PASSWORD;
    if (!expectedEmail || !expectedPassword) {
      throw new Error("Credenciais mestre não configuradas no servidor");
    }
    const emailOk =
      data.email.length === expectedEmail.length &&
      timingSafeEqual(Buffer.from(data.email), Buffer.from(expectedEmail));
    const pwdOk =
      data.password.length === expectedPassword.length &&
      timingSafeEqual(Buffer.from(data.password), Buffer.from(expectedPassword));
    if (!emailOk || !pwdOk) {
      throw new Error("E-mail ou senha incorretos");
    }
    return { token: signToken() };
  });

export const masterListTenants = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string() }).parse(input))
  .handler(async ({ data }) => {
    assertToken(data.token);
    const { data: tenants, error } = await supabaseAdmin
      .from("tenants")
      .select("id, nome, slug, responsavel_nome, responsavel_email, telefone, cnpj_cpf, ativo, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: alunos } = await supabaseAdmin.from("alunos").select("tenant_id, status");
    const counts: Record<string, number> = {};
    (alunos ?? []).forEach((a: any) => {
      counts[a.tenant_id] = (counts[a.tenant_id] ?? 0) + 1;
    });

    return {
      tenants: (tenants ?? []).map((t: any) => ({
        ...t,
        total_alunos: counts[t.id] ?? 0,
      })),
      total_academias: tenants?.length ?? 0,
      total_alunos: alunos?.length ?? 0,
    };
  });

export const masterGetTenant = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string(), tenantId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data }) => {
    assertToken(data.token);
    const [tenant, alunos, matriculas, pagamentos, horarios, graduacoes] = await Promise.all([
      supabaseAdmin.from("tenants").select("*").eq("id", data.tenantId).maybeSingle(),
      supabaseAdmin.from("alunos").select("*").eq("tenant_id", data.tenantId),
      supabaseAdmin.from("matriculas").select("*, alunos(nome_completo), planos(nome)").eq("tenant_id", data.tenantId),
      supabaseAdmin.from("pagamentos").select("*, alunos(nome_completo)").eq("tenant_id", data.tenantId),
      supabaseAdmin.from("horarios").select("*, modalidades(nome)").eq("tenant_id", data.tenantId),
      supabaseAdmin.from("graduacoes").select("*").eq("tenant_id", data.tenantId),
    ]);
    return {
      tenant: tenant.data,
      alunos: alunos.data ?? [],
      matriculas: matriculas.data ?? [],
      pagamentos: pagamentos.data ?? [],
      horarios: horarios.data ?? [],
      graduacoes: graduacoes.data ?? [],
    };
  });

const tenantInputSchema = z.object({
  nome: z.string().trim().min(2, "Nome obrigatório").max(120),
  cnpj_cpf: z.string().trim().max(32).optional().nullable(),
  responsavel_email: z.string().trim().email("E-mail inválido").max(160).optional().nullable().or(z.literal("")),
  responsavel_nome: z.string().trim().max(120).optional().nullable(),
  telefone: z.string().trim().max(40).optional().nullable(),
  endereco: z.string().trim().max(255).optional().nullable(),
  ativo: z.boolean().optional(),
});

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "academia";
}

function normalizeCnpj(v?: string | null) {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  return digits.length ? digits : null;
}

async function assertCnpjUnique(cnpj: string | null, ignoreId?: string) {
  if (!cnpj) return;
  let q = supabaseAdmin.from("tenants").select("id").eq("cnpj_cpf", cnpj);
  if (ignoreId) q = q.neq("id", ignoreId);
  const { data, error } = await q.limit(1);
  if (error) throw new Error(error.message);
  if (data && data.length > 0) throw new Error("Já existe uma academia com este CNPJ");
}

export const masterCreateTenant = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string(), tenant: tenantInputSchema }).parse(input)
  )
  .handler(async ({ data }) => {
    assertToken(data.token);
    const t = data.tenant;
    const cnpj = normalizeCnpj(t.cnpj_cpf);
    await assertCnpjUnique(cnpj);
    const slug = `${slugify(t.nome)}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: row, error } = await supabaseAdmin
      .from("tenants")
      .insert({
        nome: t.nome,
        slug,
        cnpj_cpf: cnpj,
        responsavel_nome: t.responsavel_nome || null,
        responsavel_email: t.responsavel_email || null,
        telefone: t.telefone || null,
        endereco: t.endereco || null,
        ativo: t.ativo ?? true,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { tenant: row };
  });

export const masterUpdateTenant = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string(), tenantId: z.string().uuid(), tenant: tenantInputSchema }).parse(input)
  )
  .handler(async ({ data }) => {
    assertToken(data.token);
    const t = data.tenant;
    const cnpj = normalizeCnpj(t.cnpj_cpf);
    await assertCnpjUnique(cnpj, data.tenantId);
    const { data: row, error } = await supabaseAdmin
      .from("tenants")
      .update({
        nome: t.nome,
        cnpj_cpf: cnpj,
        responsavel_nome: t.responsavel_nome || null,
        responsavel_email: t.responsavel_email || null,
        telefone: t.telefone || null,
        endereco: t.endereco || null,
        ...(typeof t.ativo === "boolean" ? { ativo: t.ativo } : {}),
      })
      .eq("id", data.tenantId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { tenant: row };
  });

export const masterToggleTenant = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string(), tenantId: z.string().uuid(), ativo: z.boolean() }).parse(input)
  )
  .handler(async ({ data }) => {
    assertToken(data.token);
    const { error } = await supabaseAdmin.from("tenants").update({ ativo: data.ativo }).eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const masterDeleteTenant = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string(), tenantId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data }) => {
    assertToken(data.token);
    const tenantId = data.tenantId;

    // Tables to wipe BEFORE profiles/user_roles/tenants, ordered by dependency.
    // historico_graduacoes & notificacoes may reference alunos; delete first.
    const dependentTables = [
      "historico_graduacoes",
      "notificacoes",
      "pagamentos",
      "matriculas",
      "despesas",
      "graduacoes",
      "horarios",
      "alunos",
      "modalidades",
      "planos",
    ] as const;

    for (const tbl of dependentTables) {
      const { error } = await supabaseAdmin.from(tbl).delete().eq("tenant_id", tenantId);
      if (error) throw new Error(`Falha ao remover ${tbl}: ${error.message}`);
    }

    // Collect users of this tenant before removing profiles/roles.
    const { data: profs, error: pErr } = await supabaseAdmin
      .from("profiles").select("id").eq("tenant_id", tenantId);
    if (pErr) throw new Error(pErr.message);
    const userIds = (profs ?? []).map((p) => p.id);

    const { error: urErr } = await supabaseAdmin
      .from("user_roles").delete().eq("tenant_id", tenantId);
    if (urErr) throw new Error(urErr.message);

    const { error: profDelErr } = await supabaseAdmin
      .from("profiles").delete().eq("tenant_id", tenantId);
    if (profDelErr) throw new Error(profDelErr.message);

    // Remove auth users so they can no longer log in.
    for (const uid of userIds) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (error && !/not[_ ]?found/i.test(error.message)) {
        throw new Error(`Falha ao remover usuário ${uid}: ${error.message}`);
      }
    }

    const { error: tErr } = await supabaseAdmin.from("tenants").delete().eq("id", tenantId);
    if (tErr) throw new Error(tErr.message);
    return { ok: true, removedUsers: userIds.length };
  });
