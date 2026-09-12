import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription";
import { requirePermissao } from "@/lib/tenant-guard";
import {
  ESTADO_ACESSO_LABEL,
  MATRICULA_MAX,
  MATRICULA_MIN,
  estadoAcesso,
  generateEnrollment,
  normalizeEnrollment,
} from "@/lib/student-portal.matricula";

const genericLoginError = "Matrícula inválida ou acesso indisponível. Verifique o número e tente novamente.";

export const listStudentPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .handler(async ({ context }) => {
    const tenantId = await requirePermissao(context as never, "alunos", "ver");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("aluno_credenciais")
      .select("aluno_id, matricula, ativo")
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
    const { data: aluno } = await supabaseAdmin
      .from("alunos")
      .select("id, nome_completo")
      .eq("id", data.alunoId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!aluno) throw new Error("Aluno não encontrado nesta academia.");

    const { data: existing } = await supabaseAdmin
      .from("aluno_credenciais")
      .select("id, matricula, ativo")
      .eq("aluno_id", aluno.id)
      .maybeSingle();
    // Reexecutar a acao nao troca a matricula de quem ja tem: o numero
    // impresso na planilha continua valendo.
    if (existing?.matricula) {
      return { nome: aluno.nome_completo, matricula: existing.matricula };
    }
    let enrollment = "";
    for (let attempt = 0; attempt < 5 && !enrollment; attempt += 1) {
      const candidate = generateEnrollment();
      const { count } = await supabaseAdmin
        .from("aluno_credenciais")
        .select("id", { count: "exact", head: true })
        .eq("matricula", candidate);
      if (!count) enrollment = candidate;
    }
    if (!enrollment) throw new Error("Não foi possível gerar uma matrícula única.");
    const { data: credential, error } = await supabaseAdmin.from("aluno_credenciais").upsert({
      aluno_id: aluno.id,
      tenant_id: tenantId,
      matricula: enrollment,
      ativo: true,
      tentativas_falhas: 0,
      bloqueado_ate: null,
    }, { onConflict: "aluno_id" }).select("id").single();
    if (error || !credential) throw new Error(error?.message ?? "Falha ao ativar o portal.");
    return { nome: aluno.nome_completo, matricula: enrollment };
  });

export const issueAllStudentPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .handler(async ({ context }) => {
    const tenantId = await requirePermissao(context as never, "alunos", "editar");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: alunos, error: alunosError }, { data: existing, error: existingError }] = await Promise.all([
      supabaseAdmin.from("alunos").select("id, nome_completo, status").eq("tenant_id", tenantId).order("nome_completo"),
      supabaseAdmin.from("aluno_credenciais").select("aluno_id, matricula, ativo").eq("tenant_id", tenantId),
    ]);
    if (alunosError || existingError) throw new Error(alunosError?.message ?? existingError?.message);
    const byAluno = new Map((existing ?? []).map((item) => [item.aluno_id, item]));
    const used = new Set((existing ?? []).map((item) => item.matricula));
    const inserts: Array<{ aluno_id: string; tenant_id: string; matricula: string; ativo: boolean }> = [];
    for (const aluno of alunos ?? []) {
      if (byAluno.has(aluno.id)) continue;
      let matricula = "";
      for (let attempt = 0; attempt < 10 && !matricula; attempt += 1) {
        const candidate = generateEnrollment();
        if (!used.has(candidate)) {
          const { count } = await supabaseAdmin.from("aluno_credenciais").select("id", { count: "exact", head: true }).eq("matricula", candidate);
          if (!count) matricula = candidate;
        }
      }
      if (!matricula) throw new Error("Não foi possível gerar todas as matrículas.");
      used.add(matricula);
      inserts.push({ aluno_id: aluno.id, tenant_id: tenantId, matricula, ativo: true });
    }
    if (inserts.length) {
      const { error } = await supabaseAdmin.from("aluno_credenciais").insert(inserts);
      if (error) throw new Error(error.message);
    }
    const { data: access, error } = await supabaseAdmin
      .from("aluno_credenciais")
      .select("aluno_id, matricula, ativo")
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    const accessByAluno = new Map((access ?? []).map((item) => [item.aluno_id, item]));
    return {
      created: inserts.length,
      rows: (alunos ?? []).map((aluno) => ({
        nome: aluno.nome_completo,
        status: aluno.status,
        matricula: accessByAluno.get(aluno.id)?.matricula ?? "",
        acesso: ESTADO_ACESSO_LABEL[estadoAcesso(accessByAluno.get(aluno.id), aluno.status)],
      })),
    };
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
  .inputValidator((input) =>
    z.object({ matricula: z.string().min(MATRICULA_MIN).max(MATRICULA_MAX) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const portal = await import("@/lib/student-portal.server");
    const enrollment = normalizeEnrollment(data.matricula);
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
      .select("id, ativo, bloqueado_ate, aluno_id, tenant_id")
      .eq("matricula", enrollment)
      .maybeSingle();
    // getStudentSession() so devolve dados de aluno ativo em academia ativa.
    // Sem conferir isso aqui, o login "daria certo" e a tela voltaria sozinha
    // para o formulario, sem dizer nada a quem digitou.
    const [{ data: aluno }, { data: tenant }] = credential
      ? await Promise.all([
          supabaseAdmin.from("alunos").select("status").eq("id", credential.aluno_id).maybeSingle(),
          supabaseAdmin.from("tenants").select("ativo").eq("id", credential.tenant_id).maybeSingle(),
        ])
      : [{ data: null }, { data: null }];
    const locked = credential?.bloqueado_ate && new Date(credential.bloqueado_ate).getTime() > Date.now();
    const ok = Boolean(credential?.ativo && !locked && aluno?.status === "ativo" && tenant?.ativo);
    await supabaseAdmin.from("aluno_login_tentativas").insert({
      ip_hash: ipHash,
      matricula_hash: enrollmentHash,
      sucesso: ok,
    });
    if (!credential || !ok) {
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
  const [{ data: mensalidades }, { data: horarios }, { data: graduacoes }] = await Promise.all([
    supabaseAdmin.from("mensalidades").select("id, competencia, data_vencimento, valor, valor_final, status, data_pagamento").eq("aluno_id", session.alunoId).order("data_vencimento", { ascending: false }).limit(12),
    supabaseAdmin.from("horarios").select("id, dia, hora, hora_fim, professor, modalidades(nome)").eq("tenant_id", session.tenantId).eq("ativo", true).eq("categoria", session.categoria as "adulto" | "kids"),
    supabaseAdmin.from("historico_graduacoes").select("data, observacoes, graduacoes!historico_graduacoes_graduacao_nova_id_fkey(nome)").eq("aluno_id", session.alunoId).order("data", { ascending: false }),
  ]);
  return {
    authenticated: true as const,
    aluno: { nome_completo: session.nome, academia: session.academia, categoria: session.categoria },
    mensalidades: mensalidades ?? [],
    horarios: (horarios ?? []).map((item) => ({ ...item, modalidade: (item.modalidades as { nome?: string } | null)?.nome ?? "Modalidade" })),
    graduacoes: (graduacoes ?? []).map((item) => ({ ...item, graduacao_nova: (item.graduacoes as { nome?: string } | null)?.nome ?? null })),
  };
});

export const studentPortalLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { revokeCurrentStudentSession } = await import("@/lib/student-portal.server");
  await revokeCurrentStudentSession();
  return { ok: true };
});