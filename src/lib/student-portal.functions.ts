import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription";
import { requireAdmin, requirePermissao } from "@/lib/tenant-guard";
import {
  ESTADO_ACESSO_LABEL,
  estadoAcesso,
  generateEnrollment,
  isEnrollmentShaped,
  normalizeBirthDate,
  normalizeEnrollment,
} from "@/lib/student-portal.matricula";

/** Marca as notificações deste recado na fila, para não reenviar a quem já recebeu. */
const TIPO_ACESSO_PORTAL = "PORTAL_ACESSO";

// Tetos de tentativa de login. Ver o comentário em studentPortalLogin.
const JANELA_CURTA_MIN = 15;
const LIMITE_IP_CURTO = 15;
const LIMITE_MATRICULA_CURTO = 5;
const LIMITE_MATRICULA_DIA = 20;

const genericLoginError =
  "Matrícula ou data de nascimento não conferem. Verifique os dois campos e tente novamente.";

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
    const { data: credential, error } = await supabaseAdmin
      .from("aluno_credenciais")
      .upsert(
        {
          aluno_id: aluno.id,
          tenant_id: tenantId,
          matricula: enrollment,
          ativo: true,
          tentativas_falhas: 0,
          bloqueado_ate: null,
        },
        { onConflict: "aluno_id" },
      )
      .select("id")
      .single();
    if (error || !credential) throw new Error(error?.message ?? "Falha ao ativar o portal.");
    return { nome: aluno.nome_completo, matricula: enrollment };
  });

export const issueAllStudentPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .handler(async ({ context }) => {
    const tenantId = await requirePermissao(context as never, "alunos", "editar");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: alunos, error: alunosError }, { data: existing, error: existingError }] =
      await Promise.all([
        supabaseAdmin
          .from("alunos")
          .select("id, nome_completo, status, data_nascimento")
          .eq("tenant_id", tenantId)
          .order("nome_completo"),
        supabaseAdmin
          .from("aluno_credenciais")
          .select("aluno_id, matricula, ativo")
          .eq("tenant_id", tenantId),
      ]);
    if (alunosError || existingError)
      throw new Error(alunosError?.message ?? existingError?.message);
    const byAluno = new Map((existing ?? []).map((item) => [item.aluno_id, item]));
    const used = new Set((existing ?? []).map((item) => item.matricula));
    const inserts: Array<{
      aluno_id: string;
      tenant_id: string;
      matricula: string;
      ativo: boolean;
    }> = [];
    for (const aluno of alunos ?? []) {
      if (byAluno.has(aluno.id)) continue;
      let matricula = "";
      for (let attempt = 0; attempt < 10 && !matricula; attempt += 1) {
        const candidate = generateEnrollment();
        if (!used.has(candidate)) {
          const { count } = await supabaseAdmin
            .from("aluno_credenciais")
            .select("id", { count: "exact", head: true })
            .eq("matricula", candidate);
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
        acesso: ESTADO_ACESSO_LABEL[estadoAcesso(accessByAluno.get(aluno.id), aluno)],
      })),
    };
  });

export const setStudentPortalActive = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((input) =>
    z.object({ alunoId: z.string().uuid(), ativo: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await requirePermissao(context as never, "alunos", "editar");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: credential, error } = await supabaseAdmin
      .from("aluno_credenciais")
      .update({ ativo: data.ativo, tentativas_falhas: 0, bloqueado_ate: null })
      .eq("aluno_id", data.alunoId)
      .eq("tenant_id", tenantId)
      .select("id, matricula")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!credential) throw new Error("Acesso do aluno não encontrado.");
    if (!data.ativo) {
      await supabaseAdmin.from("aluno_sessoes").delete().eq("credencial_id", credential.id);
      return { ok: true };
    }
    // Liberar pela lista também apaga as falhas recentes desta matrícula.
    // Sem isso, o teto diário continuaria de pé depois de a academia liberar,
    // e o aluno ouviria "procure a academia" logo após a academia o atender.
    const { identifierHash } = await import("@/lib/student-portal.server");
    await supabaseAdmin
      .from("aluno_login_tentativas")
      .delete()
      .eq("matricula_hash", await identifierHash(credential.matricula))
      .eq("sucesso", false);
    return { ok: true };
  });

export const studentPortalLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        matricula: z.string().min(1).max(40),
        nascimento: z.string().min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const portal = await import("@/lib/student-portal.server");
    const enrollment = normalizeEnrollment(data.matricula);
    const birthDate = normalizeBirthDate(data.nascimento);
    const ipHash = await portal.identifierHash(portal.requestIp());
    const enrollmentHash = await portal.identifierHash(enrollment);
    const since = new Date(Date.now() - JANELA_CURTA_MIN * 60_000).toISOString();
    const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const falhas = (coluna: "ip_hash" | "matricula_hash", valor: string, desde: string) =>
      supabaseAdmin
        .from("aluno_login_tentativas")
        .select("id", { count: "exact", head: true })
        .eq(coluna, valor)
        .eq("sucesso", false)
        .gte("created_at", desde);
    const [{ count: ipFailures }, { count: enrollmentFailures }, { count: enrollmentDay }] =
      await Promise.all([
        falhas("ip_hash", ipHash, since),
        falhas("matricula_hash", enrollmentHash, since),
        falhas("matricula_hash", enrollmentHash, since24h),
      ]);
    if (
      (ipFailures ?? 0) >= LIMITE_IP_CURTO ||
      (enrollmentFailures ?? 0) >= LIMITE_MATRICULA_CURTO
    ) {
      throw new Error(`Muitas tentativas. Aguarde ${JANELA_CURTA_MIN} minutos e tente novamente.`);
    }
    // Teto diário por matrícula, além do teto por janela.
    //
    // A matrícula é curta e viaja por WhatsApp, então quem vir o número de
    // alguém pode tentar adivinhar a data de nascimento. Só com a janela de
    // 15 minutos cabem quase 500 tentativas por dia, e as 365 datas de um ano
    // conhecido cairiam antes do fim de semana. Com o teto diário são 20, o
    // que põe a varredura em semanas.
    //
    // O limite é derivado do histórico, não de um contador guardado na
    // credencial: assim ele decai sozinho: um erro de digitação de hoje não
    // soma com outro de três meses atrás. Quem precisar entrar antes das 24
    // horas é liberado pela lista de alunos, que apaga as falhas recentes.
    if ((enrollmentDay ?? 0) >= LIMITE_MATRICULA_DIA) {
      throw new Error(
        "Muitas tentativas com esta matrícula hoje. Procure a academia para liberar o acesso.",
      );
    }
    // Matricula fora do formato nao vai ao banco, mas conta como tentativa:
    // sem isso, o formato viraria um jeito barato de sondar sem gastar cota.
    const { data: credential } = isEnrollmentShaped(enrollment)
      ? await supabaseAdmin
          .from("aluno_credenciais")
          .select("id, ativo, bloqueado_ate, aluno_id, tenant_id")
          .eq("matricula", enrollment)
          .maybeSingle()
      : { data: null };
    // getStudentSession() so devolve dados de aluno ativo em academia ativa.
    // Sem conferir isso aqui, o login "daria certo" e a tela voltaria sozinha
    // para o formulario, sem dizer nada a quem digitou.
    const [{ data: aluno }, { data: tenant }] = credential
      ? await Promise.all([
          supabaseAdmin
            .from("alunos")
            .select("status, data_nascimento")
            .eq("id", credential.aluno_id)
            .maybeSingle(),
          supabaseAdmin
            .from("tenants")
            .select("ativo")
            .eq("id", credential.tenant_id)
            .maybeSingle(),
        ])
      : [{ data: null }, { data: null }];
    // bloqueado_ate não tem mais quem escreva automaticamente: o teto por
    // tentativa passou a ser derivado do histórico, logo acima. A coluna fica
    // como trava manual, para a academia parar uma matrícula por um prazo
    // direto no banco, e continua sendo limpa ao liberar o acesso pela lista.
    const locked =
      credential?.bloqueado_ate && new Date(credential.bloqueado_ate).getTime() > Date.now();
    // A data de nascimento e o segundo fator. A matricula e curta de proposito
    // para caber num recado; e esta conferencia que impede varrer numeros ate
    // cair numa conta. Aluno sem data no cadastro nao entra: nao ha o que
    // conferir, e um segredo vazio nao e segredo.
    const nascimentoConfere = Boolean(
      birthDate && aluno?.data_nascimento && aluno.data_nascimento.slice(0, 10) === birthDate,
    );
    const ok = Boolean(
      credential?.ativo &&
      !locked &&
      aluno?.status === "ativo" &&
      tenant?.ativo &&
      nascimentoConfere,
    );
    await supabaseAdmin.from("aluno_login_tentativas").insert({
      ip_hash: ipHash,
      matricula_hash: enrollmentHash,
      sucesso: ok,
    });
    if (!credential || !ok) {
      throw new Error(genericLoginError);
    }
    await supabaseAdmin
      .from("aluno_credenciais")
      .update({ tentativas_falhas: 0, bloqueado_ate: null })
      .eq("id", credential.id);
    await portal.createStudentSession(credential.id);
    return { ok: true };
  });

export const getStudentPortalData = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getStudentSession } = await import("@/lib/student-portal.server");
  const session = await getStudentSession();
  if (!session) return { authenticated: false as const };
  const [{ data: mensalidades }, { data: horarios }, { data: graduacoes }] = await Promise.all([
    supabaseAdmin
      .from("mensalidades")
      .select("id, competencia, data_vencimento, valor, valor_final, status, data_pagamento")
      .eq("aluno_id", session.alunoId)
      .order("data_vencimento", { ascending: false })
      .limit(12),
    supabaseAdmin
      .from("horarios")
      .select("id, dia, hora, hora_fim, professor, modalidades(nome)")
      .eq("tenant_id", session.tenantId)
      .eq("ativo", true)
      .eq("categoria", session.categoria as "adulto" | "kids"),
    supabaseAdmin
      .from("historico_graduacoes")
      .select("data, observacoes, graduacoes!historico_graduacoes_graduacao_nova_id_fkey(nome)")
      .eq("aluno_id", session.alunoId)
      .order("data", { ascending: false }),
  ]);
  return {
    authenticated: true as const,
    aluno: {
      nome_completo: session.nome,
      academia: session.academia,
      categoria: session.categoria,
    },
    mensalidades: mensalidades ?? [],
    horarios: (horarios ?? []).map((item) => ({
      ...item,
      modalidade: (item.modalidades as { nome?: string } | null)?.nome ?? "Modalidade",
    })),
    graduacoes: (graduacoes ?? []).map((item) => ({
      ...item,
      graduacao_nova: (item.graduacoes as { nome?: string } | null)?.nome ?? null,
    })),
  };
});

export const studentPortalLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { revokeCurrentStudentSession } = await import("@/lib/student-portal.server");
  await revokeCurrentStudentSession();
  return { ok: true };
});

/**
 * Enfileira o recado com a matrícula para os alunos que ainda não receberam.
 *
 * Não envia nada aqui. Grava em `notificacoes` e devolve na hora, igual ao
 * comunicado geral: quem entrega é o worker, que já aplica o aquecimento do
 * número, o intervalo aleatório entre envios, o teto diário, a variação de
 * texto e a janela de horário da academia. É de lá que vem o "gradualmente" —
 * com o número em aquecimento, 59 alunos se espalham sozinhos por vários dias.
 *
 * Reexecutar é seguro: quem já tem um recado na fila ou entregue não recebe de
 * novo, a menos que `reenviar` seja pedido explicitamente.
 */
export const enviarAcessoPortal = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((input) => z.object({ reenviar: z.boolean().default(false) }).parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await requireAdmin(
      context as never,
      "Apenas administradores podem enviar o acesso ao portal.",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { origemPublica } = await import("@/lib/student-portal.server");
    const { mensagemAcessoPortal } = await import("@/lib/student-portal.mensagem");

    const [{ data: tenant }, { data: alunos }, { data: credenciais }, { data: jaEnviados }] =
      await Promise.all([
        supabaseAdmin.from("tenants").select("nome").eq("id", tenantId).maybeSingle(),
        supabaseAdmin
          .from("alunos")
          .select(
            "id, nome_completo, categoria, status, data_nascimento, telefone, responsavel_telefone",
          )
          .eq("tenant_id", tenantId)
          .order("nome_completo"),
        supabaseAdmin
          .from("aluno_credenciais")
          .select("aluno_id, matricula, ativo")
          .eq("tenant_id", tenantId),
        supabaseAdmin
          .from("notificacoes")
          .select("aluno_id")
          .eq("tenant_id", tenantId)
          .eq("tipo", TIPO_ACESSO_PORTAL)
          .in("status", ["agendada", "enviada"]),
      ]);

    const url = `${origemPublica()}/portal`;
    const academia = tenant?.nome ?? "sua academia";
    const credencialPor = new Map((credenciais ?? []).map((c) => [c.aluno_id, c]));
    const recebidos = new Set((jaEnviados ?? []).map((n) => n.aluno_id));
    const agora = new Date().toISOString();

    const linhas: Record<string, unknown>[] = [];
    const pulados = {
      ja_enviados: 0,
      sem_telefone: 0,
      sem_matricula: 0,
      sem_nascimento: 0,
      bloqueados: 0,
      inativos: 0,
    };

    for (const aluno of alunos ?? []) {
      const estado = estadoAcesso(credencialPor.get(aluno.id), aluno);
      if (estado === "nao_gerado") {
        pulados.sem_matricula += 1;
        continue;
      }
      if (estado === "bloqueado") {
        pulados.bloqueados += 1;
        continue;
      }
      if (estado === "indisponivel") {
        pulados.inativos += 1;
        continue;
      }
      if (estado === "sem_nascimento") {
        pulados.sem_nascimento += 1;
        continue;
      }
      if (!data.reenviar && recebidos.has(aluno.id)) {
        pulados.ja_enviados += 1;
        continue;
      }

      // Aluno kids fala pelo responsável. Adulto recebe só no próprio número:
      // cair no telefone do responsável entregaria a credencial dele a um
      // terceiro, e a matrícula é o que abre o portal.
      const destino =
        aluno.categoria === "kids" ? aluno.responsavel_telefone || aluno.telefone : aluno.telefone;
      if (!destino) {
        pulados.sem_telefone += 1;
        continue;
      }

      linhas.push({
        tenant_id: tenantId,
        aluno_id: aluno.id,
        tipo: TIPO_ACESSO_PORTAL,
        canal: "whatsapp",
        destinatario: destino,
        mensagem: mensagemAcessoPortal({
          nome: aluno.nome_completo,
          academia,
          matricula: credencialPor.get(aluno.id)!.matricula,
          url,
        }),
        status: "agendada",
        agendada_para: agora,
      });
    }

    if (linhas.length) {
      const { error } = await supabaseAdmin.from("notificacoes").insert(linhas as never);
      if (error) throw new Error(error.message);
    }
    return { enfileirados: linhas.length, total: (alunos ?? []).length, ...pulados };
  });
