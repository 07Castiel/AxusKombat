import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { comTabelasPendentes } from "@/integrations/supabase/tabelas-pendentes";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/** Tentativas de login erradas toleradas por IP dentro da janela. */
const MAX_TENTATIVAS_LOGIN = 5;
const JANELA_LOGIN_MIN = 15;

/**
 * Chave de assinatura do token de sessão mestre (A6).
 *
 * Antes o HMAC era assinado com a própria MASTER_ADMIN_PASSWORD: a senha virava
 * chave criptográfica, então quem conseguisse um token podia atacá-lo offline
 * para recuperar a senha. Agora existe uma chave separada; enquanto ela não for
 * configurada, mantém o comportamento antigo e avisa no log.
 */
function getSecret() {
  const dedicada = process.env.MASTER_TOKEN_SECRET;
  if (dedicada) return dedicada;
  const s = process.env.MASTER_ADMIN_PASSWORD;
  if (!s) throw new Error("MASTER_ADMIN_PASSWORD não configurado");
  console.warn(
    "[admin-master] MASTER_TOKEN_SECRET não configurada: o token está sendo " +
      "assinado com a própria senha. Configure uma chave dedicada.",
  );
  return s;
}

/**
 * Compara segredos sem vazar o comprimento.
 *
 * A versão anterior fazia `a.length === b.length && timingSafeEqual(...)`, o que
 * responde na hora quando o tamanho difere e entrega o comprimento da senha.
 * Comparar os digests resolve: sempre 32 bytes, sempre o mesmo custo.
 */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recebido, "utf8").digest();
  const b = createHash("sha256").update(esperado, "utf8").digest();
  return timingSafeEqual(a, b);
}

function ipDaRequisicao(): string {
  const h = getRequest()?.headers;
  return (
    h?.get("cf-connecting-ip")?.trim() ||
    h?.get("x-real-ip")?.trim() ||
    h?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "desconhecido"
  );
}

/** Registra toda ação do painel mestre — antes nada ficava gravado. */
async function auditar(acao: string, detalhe: Record<string, unknown> = {}) {
  try {
    await supabaseAdmin.from("system_logs").insert({
      level: "info",
      source: "admin-master",
      message: acao,
      context: { ...detalhe, ip: ipDaRequisicao() },
    });
  } catch {
    /* auditoria nunca derruba a operação */
  }
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
