import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/subscription";
import { requireAdmin } from "@/lib/tenant-guard";

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


export const listStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem gerenciar a equipe");
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
  .middleware([requireActiveSubscription])
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
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem gerenciar a equipe");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: ce } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha_provisoria,
      email_confirm: true,
      user_metadata: {
        nome_completo: data.nome_completo,
        telefone: data.telefone ?? null,
        // Marca de convite: o trigger handle_new_user, depois da ETAPA 3, honra
        // isto e não cria academia nenhuma. Enquanto essa migration não rodar,
        // ele ainda cria um tenant temporário e o bloco de limpeza remove.
        skip_tenant: true,
      },
    });
    if (ce || !created.user) throw new Error(ce?.message || "Falha ao criar usuário");
    const uid = created.user.id;

    // Desfaz o cadastro pela metade. Sem isto, uma falha no meio deixa um
    // usuário no Auth que consegue logar e não tem perfil nem academia.
    const desfazer = async (motivo: string): Promise<never> => {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
      await supabaseAdmin.from("profiles").delete().eq("id", uid);
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => {});
      throw new Error(motivo);
    };

    // Guarda a academia que o trigger possa ter criado, antes de reapontar.
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("tenant_id").eq("id", uid).maybeSingle();
    const tenantOrfao =
      prof?.tenant_id && prof.tenant_id !== tenantId ? prof.tenant_id : null;

    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);

    // upsert cobre os dois mundos: com o trigger novo o perfil ainda não
    // existe; com o antigo, existe e precisa ser reapontado.
    const { error: pe } = await supabaseAdmin.from("profiles").upsert(
      {
        id: uid,
        tenant_id: tenantId,
        nome_completo: data.nome_completo,
        email: data.email,
        telefone: data.telefone ?? null,
        ativo: true,
        permissions: data.permissions,
      },
      { onConflict: "id" },
    );
    if (pe) await desfazer(`Falha ao criar o perfil: ${pe.message}`);

    const { error: re } = await supabaseAdmin.from("user_roles").insert({
      user_id: uid, tenant_id: tenantId, role: data.role,
    });
    if (re) await desfazer(`Falha ao definir o papel: ${re.message}`);

    if (tenantOrfao) {
      const { error: te } = await supabaseAdmin
        .from("tenants").delete().eq("id", tenantOrfao);
      // A academia fantasma não vale derrubar um cadastro que já deu certo,
      // mas precisa deixar rastro: era exatamente assim que sobravam tenants
      // órfãos no painel mestre e nas contagens.
      if (te) {
        console.error(
          `[createStaff] academia temporária ${tenantOrfao} não pôde ser removida:`,
          te.message,
        );
      }
    }

    return { id: uid };
  });

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
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
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem gerenciar a equipe");
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
  .middleware([requireActiveSubscription])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), ativo: z.boolean() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem gerenciar a equipe");
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
  .middleware([requireActiveSubscription])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), nova_senha: z.string().min(6).max(72) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem gerenciar a equipe");
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
  .middleware([requireActiveSubscription])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const tenantId = await requireAdmin(context as any, "Apenas administradores podem gerenciar a equipe");
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
