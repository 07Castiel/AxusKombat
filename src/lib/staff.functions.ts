import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const STAFF_ROLES = [
  "admin",
  "recepcao",
  "financeiro",
  "professor_adulto",
  "professor_kids",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSION_MODULES = [
  "alunos",
  "pagamentos",
  "planos",
  "modalidades",
  "horarios",
  "graduacoes",
  "relatorios",
  "configuracoes",
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export type ModulePerms = { ver: boolean; editar: boolean };
export type PermissionsMap = Record<PermissionModule, ModulePerms>;

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Administrador",
  recepcao: "Recepção",
  financeiro: "Financeiro",
  professor_adulto: "Professor Adulto",
  professor_kids: "Professor Kids",
};

const all: ModulePerms = { ver: true, editar: true };
const ver: ModulePerms = { ver: true, editar: false };
const none: ModulePerms = { ver: false, editar: false };

export const ROLE_PRESETS: Record<StaffRole, PermissionsMap> = {
  admin: {
    alunos: all, pagamentos: all, planos: all, modalidades: all,
    horarios: all, graduacoes: all, relatorios: all, configuracoes: all,
  },
  recepcao: {
    alunos: all, pagamentos: ver, planos: ver, modalidades: ver,
    horarios: all, graduacoes: ver, relatorios: none, configuracoes: none,
  },
  financeiro: {
    alunos: ver, pagamentos: all, planos: all, modalidades: ver,
    horarios: ver, graduacoes: none, relatorios: all, configuracoes: none,
  },
  professor_adulto: {
    alunos: ver, pagamentos: none, planos: none, modalidades: ver,
    horarios: all, graduacoes: all, relatorios: none, configuracoes: none,
  },
  professor_kids: {
    alunos: ver, pagamentos: none, planos: none, modalidades: ver,
    horarios: all, graduacoes: all, relatorios: none, configuracoes: none,
  },
};

const permissionsSchema = z.record(
  z.enum(PERMISSION_MODULES),
  z.object({ ver: z.boolean(), editar: z.boolean() })
);

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles, error } = await ctx.supabase
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const adminRow = (roles ?? []).find((r: any) => r.role === "admin");
  if (!adminRow) throw new Error("Apenas administradores podem gerenciar a equipe");
  return adminRow.tenant_id as string;
}

export const listStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await assertAdmin(context as any);
    const supabase = (context as any).supabase;

    const { data: profiles, error: pe } = await supabase
      .from("profiles")
      .select("id, nome_completo, email, telefone, ativo, permissions, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (pe) throw new Error(pe.message);

    const ids = (profiles ?? []).map((p: any) => p.id);
    let rolesByUser: Record<string, string[]> = {};
    if (ids.length) {
      const { data: rls, error: re } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      if (re) throw new Error(re.message);
      for (const r of rls ?? []) {
        (rolesByUser[r.user_id] ||= []).push(r.role);
      }
    }
    return (profiles ?? []).map((p: any) => ({
      ...p,
      roles: rolesByUser[p.id] ?? [],
    }));
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      nome_completo: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(255),
      telefone: z.string().trim().max(40).optional().nullable(),
      senha_provisoria: z.string().min(6).max(72),
      role: z.enum(STAFF_ROLES),
      permissions: permissionsSchema,
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const tenantId = await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: ce } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha_provisoria,
      email_confirm: true,
      user_metadata: {
        nome_completo: data.nome_completo,
        telefone: data.telefone ?? null,
        tenant_nome: "__skip__",
      },
    });
    if (ce || !created.user) throw new Error(ce?.message || "Falha ao criar usuário");
    const uid = created.user.id;

    // handle_new_user trigger created a tenant/profile/role. We must overwrite to point to this tenant.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    // Find the auto-created tenant and remove it
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("tenant_id").eq("id", uid).maybeSingle();
    const autoTenant = prof?.tenant_id;

    await supabaseAdmin.from("profiles").update({
      tenant_id: tenantId,
      nome_completo: data.nome_completo,
      telefone: data.telefone ?? null,
      ativo: true,
      permissions: data.permissions,
    }).eq("id", uid);

    await supabaseAdmin.from("user_roles").insert({
      user_id: uid, tenant_id: tenantId, role: data.role,
    });

    if (autoTenant && autoTenant !== tenantId) {
      await supabaseAdmin.from("tenants").delete().eq("id", autoTenant);
    }

    return { id: uid };
  });

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      nome_completo: z.string().trim().min(2).max(120),
      telefone: z.string().trim().max(40).optional().nullable(),
      role: z.enum(STAFF_ROLES),
      permissions: permissionsSchema,
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const tenantId = await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prof } = await supabaseAdmin
      .from("profiles").select("tenant_id").eq("id", data.user_id).maybeSingle();
    if (!prof || prof.tenant_id !== tenantId) throw new Error("Usuário não pertence à sua academia");

    await supabaseAdmin.from("profiles").update({
      nome_completo: data.nome_completo,
      telefone: data.telefone ?? null,
      permissions: data.permissions,
    }).eq("id", data.user_id);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").insert({
      user_id: data.user_id, tenant_id: tenantId, role: data.role,
    });
    return { ok: true };
  });

export const toggleStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), ativo: z.boolean() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const tenantId = await assertAdmin(context as any);
    if (data.user_id === (context as any).userId) {
      throw new Error("Você não pode desativar sua própria conta");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("tenant_id").eq("id", data.user_id).maybeSingle();
    if (!prof || prof.tenant_id !== tenantId) throw new Error("Usuário não pertence à sua academia");

    await supabaseAdmin.from("profiles").update({ ativo: data.ativo }).eq("id", data.user_id);
    // Block access at auth level too
    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.ativo ? "none" : "876000h",
    });
    return { ok: true };
  });

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), nova_senha: z.string().min(6).max(72) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const tenantId = await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("tenant_id").eq("id", data.user_id).maybeSingle();
    if (!prof || prof.tenant_id !== tenantId) throw new Error("Usuário não pertence à sua academia");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.nova_senha,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const tenantId = await assertAdmin(context as any);
    if (data.user_id === (context as any).userId) {
      throw new Error("Você não pode excluir sua própria conta");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("tenant_id").eq("id", data.user_id).maybeSingle();
    if (!prof || prof.tenant_id !== tenantId) throw new Error("Usuário não pertence à sua academia");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
