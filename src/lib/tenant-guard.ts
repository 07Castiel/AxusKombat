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
import {
  lerPermissoes,
  podeEditar,
  podeVer,
  MSG_SEM_PERMISSAO,
  type PermissionModule,
  type PermissionsMap,
} from "@/lib/permissoes";

export type AuthedContext = { supabase: SupabaseClient; userId: string };

export const STAFF_ROLE_VALUES = [
  "admin",
  "recepcao",
  "financeiro",
  "professor_adulto",
  "professor_kids",
] as const;

export type Role = (typeof STAFF_ROLE_VALUES)[number];

/** Tenant e permissões do usuário autenticado, em uma leitura só. */
export async function getPerfilAtual(
  ctx: AuthedContext,
): Promise<{ tenantId: string; permissoes: PermissionsMap }> {
  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("tenant_id, permissions")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const linha = data as { tenant_id?: string; permissions?: unknown } | null;
  if (!linha?.tenant_id) throw new Error("Perfil não encontrado");
  return { tenantId: linha.tenant_id, permissoes: lerPermissoes(linha.permissions) };
}

/** Tenant do usuário autenticado, lido do perfil. */
export async function getTenantId(ctx: AuthedContext): Promise<string> {
  return (await getPerfilAtual(ctx)).tenantId;
}

/**
 * Exige permissão de módulo além do papel (A7).
 *
 * Permissão só RESTRINGE: quem o RLS já barra nunca chega aqui, e módulo sem
 * marcação explícita conta como liberado — perfis nascem com `permissions` {}.
 * Aplicar isto nas server functions alcançáveis por recepção, financeiro e
 * professores é o que faz o ajuste da tela Equipe valer alguma coisa; até aqui
 * o campo era gravado e nunca lido.
 */
export async function requirePermissao(
  ctx: AuthedContext,
  modulo: PermissionModule,
  acao: "ver" | "editar" = "editar",
): Promise<string> {
  const { tenantId, permissoes } = await getPerfilAtual(ctx);
  const liberado = acao === "editar" ? podeEditar(permissoes, modulo) : podeVer(permissoes, modulo);
  if (!liberado) throw new Error(MSG_SEM_PERMISSAO[acao](modulo));
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
