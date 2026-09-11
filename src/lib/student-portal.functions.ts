import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription";
import { requirePermissao } from "@/lib/tenant-guard";

const genericLoginError = "Matrícula ou senha inválida. Verifique os dados e tente novamente.";

export const listStudentPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .handler(async ({ context }) => {
    const tenantId = await requirePermissao(context as never, "alunos", "ver");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("aluno_credenciais")
      .select("aluno_id, matricula, ativo, troca_senha_obrigatoria")
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const issueStudentPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((input) => z.object({ alunoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await requirePermissao(context as never, "alunos", "editar");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashPassword, generateEnrollment, generateTemporaryPassword } = await import("@/lib/student-portal.server");
    const { data: aluno } = await supabaseAdmin
      .from("alunos")
      .select("id, nome_completo")
      .eq("id", data.alunoId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!aluno) throw new Error("Aluno não encontrado nesta academia.");

    const { data: existing } = await supabaseAdmin
      .from("aluno_credenciais")
      .select("id, matricula")
      .eq("aluno_id", aluno.id)
      .maybeSingle();
    let enrollment = existing?.matricula ?? "";
    if (!enrollment) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = generateEnrollment();
        const { count } = await supabaseAdmin
          .from("aluno_credenciais")
          .select("id", { count: "exact", head: true })
          .eq("matricula", candidate);
        if (!count) { enrollment = candidate; break; }
      }
    }
    if (!enrollment) throw new Error("Não foi possível gerar uma matrícula única.");
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const { data: credential, error } = await supabaseAdmin.from("aluno_credenciais").upsert({
      aluno_id: aluno.id,
      tenant_id: tenantId,
      matricula: enrollment,
      senha_hash: passwordHash,
      troca_senha_obrigatoria: true,
      ativo: true,
      tentativas_falhas: 0,
      bloqueado_ate: null,
      senha_alterada_em: null,
    }, { onConflict: "aluno_id" }).select("id").single();
    if (error || !credential) throw new Error(error?.message ?? "Falha ao ativar o portal.");
    await supabaseAdmin.from("aluno_sessoes").delete().eq("credencial_id", credential.id);
    return { nome: aluno.nome_completo, matricula: enrollment, senhaProvisoria: temporaryPassword };
  });

export const setStudentPortalActive = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((input) => z.object({ alunoId: z.string().uuid(), ativo: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await requirePermissao(context as never, "alunos", "editar");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: credential, error } = await supabaseAdmin
      .from("aluno_credenciais")
      .update({ ativo: data.ativo, tentativas_falhas: 0, bloqueado_ate: null })
      .eq("aluno_id", data.alunoId)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!credential) throw new Error("Acesso do aluno não encontrado.");
    if (!data.ativo) {
      await supabaseAdmin.from("aluno_sessoes").delete().eq("credencial_id", credential.id);
    }
    return { ok: true };
  });

export const studentPortalLogin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ matricula: z.string().min(4).max(40), senha: z.string().min(1).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const portal = await import("@/lib/student-portal.server");
    const enrollment = portal.normalizeEnrollment(data.matricula);
    const ipHash = await portal.identifierHash(portal.requestIp());
    const enrollmentHash = await portal.identifierHash(enrollment);
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const [{ count: ipFailures }, { count: enrollmentFailures }] = await Promise.all([
      supabaseAdmin.from("aluno_login_tentativas").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).eq("sucesso", false).gte("created_at", since),
      supabaseAdmin.from("aluno_login_tentativas").select("id", { count: "exact", head: true }).eq("matricula_hash", enrollmentHash).eq("sucesso", false).gte("created_at", since),
    ]);
    if ((ipFailures ?? 0) >= 15 || (enrollmentFailures ?? 0) >= 5) {
      throw new Error("Muitas tentativas. Aguarde 15 minutos e tente novamente.");
    }
    const { data: credential } = await supabaseAdmin
      .from("aluno_credenciais")
      .select("id, senha_hash, ativo, bloqueado_ate, tentativas_falhas")
      .eq("matricula", enrollment)
      .maybeSingle();
    const locked = credential?.bloqueado_ate && new Date(credential.bloqueado_ate).getTime() > Date.now();
    const passwordOk = credential ? await portal.verifyPassword(data.senha, credential.senha_hash) : false;
    const ok = Boolean(credential?.ativo && !locked && passwordOk);
    await supabaseAdmin.from("aluno_login_tentativas").insert({
      ip_hash: ipHash,
      matricula_hash: enrollmentHash,
      sucesso: ok,
    });
    if (!credential || !ok) {
      if (credential && !locked) {
        const failures = credential.tentativas_falhas + 1;
        await supabaseAdmin.from("aluno_credenciais").update({
          tentativas_falhas: failures,
          bloqueado_ate: failures >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
        }).eq("id", credential.id);
      }
      throw new Error(genericLoginError);
    }
    await supabaseAdmin.from("aluno_credenciais").update({ tentativas_falhas: 0, bloqueado_ate: null }).eq("id", credential.id);
    await portal.createStudentSession(credential.id);
    return { ok: true };
  });

export const getStudentPortalData = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getStudentSession } = await import("@/lib/student-portal.server");
  const session = await getStudentSession();
  if (!session) return { authenticated: false as const };
  if (session.mustChangePassword) {
    return { authenticated: true as const, mustChangePassword: true as const, aluno: { nome_completo: session.nome, academia: session.academia, categoria: session.categoria } };
  }
  const [{ data: mensalidades }, { data: horarios }, { data: graduacoes }] = await Promise.all([
    supabaseAdmin.from("mensalidades").select("id, competencia, data_vencimento, valor, valor_final, status, data_pagamento").eq("aluno_id", session.alunoId).order("data_vencimento", { ascending: false }).limit(12),
    supabaseAdmin.from("horarios").select("id, dia, hora, hora_fim, professor, modalidades(nome)").eq("tenant_id", session.tenantId).eq("ativo", true).eq("categoria", session.categoria),
    supabaseAdmin.from("historico_graduacoes").select("data, observacoes, graduacoes!historico_graduacoes_graduacao_nova_id_fkey(nome)").eq("aluno_id", session.alunoId).order("data", { ascending: false }),
  ]);
  return {
    authenticated: true as const,
    mustChangePassword: false as const,
    aluno: { nome_completo: session.nome, academia: session.academia, categoria: session.categoria },
    mensalidades: mensalidades ?? [],
    horarios: (horarios ?? []).map((item) => ({ ...item, modalidade: (item.modalidades as { nome?: string } | null)?.nome ?? "Modalidade" })),
    graduacoes: (graduacoes ?? []).map((item) => ({ ...item, graduacao_nova: (item.graduacoes as { nome?: string } | null)?.nome ?? null })),
  };
});

export const changeStudentTemporaryPassword = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ novaSenha: z.string().min(8, "Use pelo menos 8 caracteres.").max(72) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const portal = await import("@/lib/student-portal.server");
    const session = await portal.getStudentSession();
    if (!session || !session.mustChangePassword) throw new Error("Sessão inválida ou senha já definida.");
    const passwordHash = await portal.hashPassword(data.novaSenha);
    const { error } = await supabaseAdmin.from("aluno_credenciais").update({
      senha_hash: passwordHash,
      troca_senha_obrigatoria: false,
      senha_alterada_em: new Date().toISOString(),
      tentativas_falhas: 0,
      bloqueado_ate: null,
    }).eq("id", session.credentialId);
    if (error) throw new Error("Não foi possível salvar a nova senha.");
    return { ok: true };
  });

export const studentPortalLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { revokeCurrentStudentSession } = await import("@/lib/student-portal.server");
  await revokeCurrentStudentSession();
  return { ok: true };
});