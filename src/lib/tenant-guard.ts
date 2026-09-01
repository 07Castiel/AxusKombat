/**
 * Resolução de tenant e checagem de papel para server functions.
 *
 * Antes, cinco arquivos repetiam a mesma função:
 *
 *     const admin = roles.find((r) => r.role === "admin");
 *     return admin.tenant_id;          // tenant vindo de user_roles
 *
 * O tenant saía de `user_roles` sem nunca ser conferido contra `profiles`.
 * Era o espelho, no servidor, do mesmo furo que has_role() tinha no banco:
 * uma linha de papel apontando para outra academia passava a valer como
 * permissão ali — e as server functions usam supabaseAdmin, que ignora RLS.
 *
 * Aqui o tenant vem sempre de `profiles` (fonte única de verdade, a mesma que
 * get_current_tenant() usa no Postgres) e o papel só conta se existir NAQUELE
 * tenant.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthedContext = { supabase: SupabaseClient; userId: string };

export const STAFF_ROLE_VALUES = [
  "admin",
  "recepcao",
  "financeiro",
  "professor_adulto",
  "professor_kids",
] as const;

export type Role = (typeof STAFF_ROLE_VALUES)[number];

/** Tenant do usuário autenticado, lido do perfil. */
export async function getTenantId(ctx: AuthedContext): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const tenantId = (data as { tenant_id?: string } | null)?.tenant_id;
  if (!tenantId) throw new Error("Perfil não encontrado");
  return tenantId;
}

/** Papéis que o usuário tem dentro do tenant do próprio perfil. */
export async function getRoles(ctx: AuthedContext, tenantId: string): Promise<Role[]> {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { role: Role }[]).map((r) => r.role);
}

/**
 * Exige um dos papéis informados e devolve o tenant do usuário.
 * Lança se o papel não existir dentro desse tenant.
 */
export async function requireRole(
  ctx: AuthedContext,
  permitidos: readonly Role[],
  mensagem = "Você não tem permissão para esta ação.",
): Promise<string> {
  const tenantId = await getTenantId(ctx);
  const roles = await getRoles(ctx, tenantId);
  if (!roles.some((r) => permitidos.includes(r))) throw new Error(mensagem);
  return tenantId;
}

/** Atalho para as áreas restritas a administradores. */
export function requireAdmin(
  ctx: AuthedContext,
  mensagem = "Apenas administradores podem acessar esta área",
): Promise<string> {
  return requireRole(ctx, ["admin"], mensagem);
}
