import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { comTabelasPendentes } from "@/integrations/supabase/tabelas-pendentes";

// Sessao, assinatura e auditoria vivem em master-token.server.ts, carregado com
// `await import()` dentro de cada handler. Import estatico traria `node:crypto`
// para o bundle do cliente — foi exatamente o que quebrou o build quando
// assertToken passou a ser exportado daqui.
export const masterLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ email: z.string().email(), password: z.string().min(1) }).parse(input)
  )
  .handler(async ({ data }) => {
    const {
      assertToken: _naoUsado, auditar, ipDaRequisicao, segredoConfere, signToken,
      MAX_TENTATIVAS_LOGIN, JANELA_LOGIN_MIN,
    } = await import("@/lib/master-token.server");
    void _naoUsado;
    const expectedEmail = process.env.MASTER_ADMIN_EMAIL;
    const expectedPassword = process.env.MASTER_ADMIN_PASSWORD;
    if (!expectedEmail || !expectedPassword) {
      throw new Error("Credenciais mestre não configuradas no servidor");
    }

    const ip = ipDaRequisicao();
    const desde = new Date(Date.now() - JANELA_LOGIN_MIN * 60_000).toISOString();

    // Teto de tentativas (A6). Este endpoint dá acesso a TODAS as academias e
    // até aqui aceitava força bruta sem qualquer freio.
    const { count: falhas } = await comTabelasPendentes(supabaseAdmin)
      .from("master_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("sucesso", false)
      .gte("criado_em", desde);

    if ((falhas ?? 0) >= MAX_TENTATIVAS_LOGIN) {
      await auditar("login mestre bloqueado por excesso de tentativas", { falhas });
      throw new Error(
        `Muitas tentativas. Aguarde ${JANELA_LOGIN_MIN} minutos e tente novamente.`,
      );
    }

    const emailOk = segredoConfere(data.email.trim().toLowerCase(),
                                   expectedEmail.trim().toLowerCase());
    const pwdOk = segredoConfere(data.password, expectedPassword);
    const ok = emailOk && pwdOk;

    await comTabelasPendentes(supabaseAdmin).from("master_login_attempts").insert({ ip, sucesso: ok });

    if (!ok) {
      await auditar("login mestre recusado", { tentativas_na_janela: (falhas ?? 0) + 1 });
      throw new Error("E-mail ou senha incorretos");
    }

    await auditar("login mestre autorizado");
    return { token: signToken() };
  });

export const masterListTenants = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { assertToken, auditar } = await import("@/lib/master-token.server");
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
    const { assertToken, auditar } = await import("@/lib/master-token.server");
    assertToken(data.token);
    const [tenant, alunos, contratos, mensalidades, horarios, graduacoes] = await Promise.all([
      supabaseAdmin.from("tenants").select("*").eq("id", data.tenantId).maybeSingle(),
      supabaseAdmin.from("alunos").select("*").eq("tenant_id", data.tenantId),
      supabaseAdmin.from("contratos").select("*, alunos(nome_completo), planos(nome)").eq("tenant_id", data.tenantId),
      supabaseAdmin.from("mensalidades").select("*, alunos(nome_completo)").eq("tenant_id", data.tenantId).order("data_vencimento", { ascending: false }).limit(200),
      supabaseAdmin.from("horarios").select("*, modalidades(nome)").eq("tenant_id", data.tenantId),
      supabaseAdmin.from("graduacoes").select("*").eq("tenant_id", data.tenantId),
    ]);
    return {
      tenant: tenant.data,
      alunos: alunos.data ?? [],
      contratos: contratos.data ?? [],
      mensalidades: mensalidades.data ?? [],
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
    const { assertToken, auditar } = await import("@/lib/master-token.server");
    assertToken(data.token);
    await auditar("academia criada", { nome: data.tenant.nome });
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
    const { assertToken, auditar } = await import("@/lib/master-token.server");
    assertToken(data.token);
    await auditar("academia alterada", { tenantId: data.tenantId });
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
    const { assertToken, auditar } = await import("@/lib/master-token.server");
    assertToken(data.token);
    await auditar(data.ativo ? "academia reativada" : "academia desativada", { tenantId: data.tenantId });
    const { error } = await supabaseAdmin.from("tenants").update({ ativo: data.ativo }).eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const masterDeleteTenant = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string(), tenantId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data }) => {
    const { assertToken, auditar } = await import("@/lib/master-token.server");
    assertToken(data.token);
    const tenantId = data.tenantId;
    // Registrado ANTES: se a exclusão falhar no meio, o rastro fica.
    await auditar("EXCLUSAO de academia iniciada", { tenantId });

    // Toda a exclusão no banco acontece dentro de master_excluir_tenant, que é
    // uma única transação (M12). A versão anterior apagava onze tabelas em
    // sequência com throw próprio em cada passo: uma falha no meio deixava a
    // academia pela metade, com usuários que ainda logavam e dados já removidos.
    //
    // A ordem das exclusões vive na função, não aqui, porque três FKs são
    // ON DELETE RESTRICT e ditam quem sai primeiro.
    const { data: resultado, error } = await comTabelasPendentes(supabaseAdmin)
      .rpc("master_excluir_tenant", { p_tenant_id: tenantId });
    if (error) throw new Error(`Falha ao excluir a academia: ${error.message}`);

    const userIds = resultado?.usuarios ?? [];

    // auth.users não está ao alcance da transação: só a API de admin remove.
    // Neste ponto os dados já foram apagados de forma atômica, então uma falha
    // aqui deixa no máximo um usuário órfão no Auth — que não consegue mais
    // usar o sistema, já que perfil e papel não existem mais. Registramos quais
    // ficaram, em vez de abortar e dar a impressão de que nada foi excluído.
    const naoRemovidos: string[] = [];
    for (const uid of userIds) {
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (delErr && !/not[_ ]?found/i.test(delErr.message)) {
        naoRemovidos.push(uid);
        console.error(`[masterDeleteTenant] usuário ${uid} não removido do Auth:`, delErr.message);
      }
    }

    await auditar("EXCLUSAO de academia concluida", {
      tenantId,
      nome: resultado?.nome ?? null,
      usuariosRemovidos: userIds.length - naoRemovidos.length,
      usuariosNaoRemovidos: naoRemovidos,
    });

    return {
      ok: true,
      removedUsers: userIds.length - naoRemovidos.length,
      usuariosNaoRemovidos: naoRemovidos,
    };
  });
