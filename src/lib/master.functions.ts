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
