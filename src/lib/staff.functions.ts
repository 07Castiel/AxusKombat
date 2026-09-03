import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/subscription";
import { requireAdmin } from "@/lib/tenant-guard";
import { PERMISSION_MODULES, STAFF_ROLES } from "@/lib/permissoes";

// Constantes e presets vivem em @/lib/permissoes: sao usados tambem pela
// interface, e este arquivo carrega server functions. Reexportados aqui para
// nao quebrar quem ja importava daqui.
export {
  STAFF_ROLES,
  PERMISSION_MODULES,
  ROLE_LABELS,
  ROLE_PRESETS,
} from "@/lib/permissoes";
export type {
  StaffRole,
  PermissionModule,
  ModulePerms,
  PermissionsMap,
} from "@/lib/permissoes";

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
    // Caminho de erro: aqui NÃO se lança. Falhar na limpeza esconderia o motivo
    // original, que é o que o admin precisa ler. Fica registrado para quem for
    // investigar sobras no banco.
    const desfazer = async (motivo: string): Promise<never> => {
      const { error: eP } = await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
      const { error: ePr } = await supabaseAdmin.from("profiles").delete().eq("id", uid);
      if (eP || ePr) {
        console.error(
          `[staff] limpeza incompleta do usuário ${uid}: ${eP?.message ?? ""} ${ePr?.message ?? ""}`.trim(),
        );
      }
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => {});
      throw new Error(motivo);
    };

    // Guarda a academia que o trigger possa ter criado, antes de reapontar.
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("tenant_id").eq("id", uid).maybeSingle();
    const tenantOrfao =
      prof?.tenant_id && prof.tenant_id !== tenantId ? prof.tenant_id : null;

    const { error: eLimpaPapeis } = await supabaseAdmin
      .from("user_roles").delete().eq("user_id", uid);
    if (eLimpaPapeis) await desfazer(`Falha ao preparar os papéis: ${eLimpaPapeis.message}`);

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

    const { error: ePerfil } = await supabaseAdmin.from("profiles").update({
      nome_completo: data.nome_completo,
      telefone: data.telefone ?? null,
      permissions: data.permissions,
    }).eq("id", data.user_id);
    if (ePerfil) throw new Error(`Falha ao salvar os dados do usuário: ${ePerfil.message}`);

    // Insere ANTES de apagar, de propósito.
    //
    // Na ordem anterior (apaga tudo, depois insere) uma falha no insert deixava
    // o funcionário com ZERO papéis. Como toda policy de RLS depende de
    // is_admin()/is_professor_*(), ele perdia acesso a tudo — e a tela dizia
    // "salvo com sucesso", porque nenhum dos dois erros era verificado.
    //
    // Invertendo, o pior caso é ficar com dois papéis por um instante, e o erro
    // aparece para o admin tentar de novo. Nunca zero.
    const { error: eNovoPapel } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: data.user_id, tenant_id: tenantId, role: data.role },
        { onConflict: "user_id,tenant_id,role" },
      );
    if (eNovoPapel) throw new Error(`Falha ao definir o papel do usuário: ${eNovoPapel.message}`);

    const { error: ePapeisAntigos } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .neq("role", data.role);
    if (ePapeisAntigos) {
      throw new Error(
        `O papel novo foi aplicado, mas os antigos não puderam ser removidos: ${ePapeisAntigos.message}`,
      );
    }
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

    const { error: eAtivo } = await supabaseAdmin
      .from("profiles").update({ ativo: data.ativo }).eq("id", data.user_id);
    if (eAtivo) throw new Error(`Falha ao alterar o acesso do usuário: ${eAtivo.message}`);
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
