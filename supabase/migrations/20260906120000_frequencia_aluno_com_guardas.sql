-- Presença deixa de ser um dado que só entra.
--
-- A tabela `presencas` é escrita desde 20260622035946 e nunca lida: o painel,
-- os relatórios e o portal do aluno não a consultam, e a única função que
-- existia para isso (frequenciaAluno, em src/lib/presencas.functions.ts) não
-- tinha um único chamador. Esta migração cria a leitura agregada que faltava.
--
-- O problema que ela resolve não é somar presenças — é escolher o DENOMINADOR.
-- Contar "todos os horários ativos da categoria" transforma o aluno de
-- 2x/semana numa academia com 10 aulas semanais em 80% de falta. A meta aqui
-- sai de onde ela realmente vive: `planos.frequencia_semanal`, ou seja, os dias
-- por semana que o aluno efetivamente contratou.
--
-- Quatro guardas impedem que ruído operacional vire alarme:
--
--   1. Dia sem NENHUMA chamada não é falta de ninguém. Se o professor esquecer
--      a chamada, ou a academia fechar no feriado, o dia sai da conta em vez de
--      marcar a turma inteira como ausente.
--   2. Dias distintos, nunca COUNT(*). Duas modalidades na mesma terça são um
--      dia de treino, porque o plano é vendido em dias por semana.
--   3. A meta encolhe junto com a operação. Se a academia rodou metade dos dias
--      esperados no período, a expectativa cai na mesma proporção.
--   4. Aluno recém-matriculado sai marcado como em carência, para o consumidor
--      não pontuar quem ainda não teve tempo de criar rotina.
--
-- DECISÃO DE SEGURANÇA: frequencia_aluno() NÃO é SECURITY DEFINER.
--
-- Mesma decisão de dashboard_resumo() (HARDENING_7_APLICAR.sql): a função roda
-- com o papel de quem chama, então o RLS de `presencas`, `alunos`, `contratos`
-- e `horarios` continua valendo dentro dela. Um professor kids recebe números
-- calculados só sobre alunos kids — numerador e denominador saem do mesmo
-- recorte, então o resultado é internamente consistente para cada papel, ainda
-- que admin e professor vejam totais diferentes. Com SECURITY DEFINER a função
-- devolveria a academia inteira para qualquer papel.

BEGIN;


-- ============================================================================
-- Índices para varredura por período
--
-- Existiam (horario_id, data) — a chamada do dia — e (aluno_id). Nenhum serve a
-- uma varredura por tenant × janela, que é o acesso desta função.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_presencas_tenant_data
  ON public.presencas (tenant_id, data);

CREATE INDEX IF NOT EXISTS idx_presencas_aluno_data
  ON public.presencas (aluno_id, data) WHERE presente;


-- ============================================================================
-- fuso_do_tenant() — o fuso da academia, legível por qualquer papel
--
-- notification_settings só é selecionável por admin (notif_settings_admin_select
-- em 20260702121021). Sem isto, frequencia_aluno() calcularia "hoje" no fuso
-- configurado para o admin e em America/Sao_Paulo para recepção e professores:
-- a MESMA academia teria datas diferentes conforme quem abre a tela, e numa
-- academia em Manaus ou Rio Branco isso desloca "dias sem treinar" em um dia
-- inteiro para parte da equipe.
--
-- É SECURITY DEFINER de propósito e faz uma coisa só: devolver o nome do fuso.
-- Não expõe nenhuma outra coluna de notification_settings, e o parâmetro é
-- ignorado se não for o tenant de quem chama — não dá para ler o fuso de outra
-- academia.
--
-- O par em TypeScript é fusoDoTenant() em src/lib/data-tenant.ts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fuso_do_tenant(p_tenant uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ns.timezone
       FROM public.notification_settings ns
      WHERE ns.tenant_id = p_tenant
        AND p_tenant = public.get_current_tenant()
      LIMIT 1),
    'America/Sao_Paulo'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fuso_do_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fuso_do_tenant(uuid) TO authenticated, service_role;


-- ============================================================================
-- frequencia_aluno(p_aluno_id, p_dias)
--
-- p_aluno_id NULL devolve todos os alunos ativos visíveis ao papel; com um id,
-- devolve só aquele aluno — em ambos os casos dentro de `alunos`, sempre um
-- array. Um id por chamada seria N+1 contra a tabela que mais cresce, e o
-- PostgREST corta resposta em 1000 linhas sem erro (o painel já teve esse bug,
-- documentado em src/routes/_app/index.tsx). Por isso a mesma função serve à
-- ficha do aluno e à lista do painel.
--
-- Devolve MEDIDAS, não veredito. Não há score de risco aqui: quem consome
-- decide o que é alarme. Primeiro o professor precisa olhar estes números e
-- concordar que batem com a percepção dele.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.frequencia_aluno(
  p_aluno_id uuid DEFAULT NULL,
  p_dias     integer DEFAULT 28
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant      uuid := public.get_current_tenant();
  v_fuso        text;
  v_hoje        date;
  v_janela      integer := GREATEST(7, LEAST(COALESCE(p_dias, 28), 365));
  v_inicio      date;
  v_semanas     numeric;
  v_semanas_bl  numeric;   -- semanas da janela anterior (linha de base)
  v_dias_op     integer;   -- dias em que houve chamada na janela
  v_dias_semana integer;   -- dias por semana em que a academia abre
  v_esperados   numeric;   -- dias de operação esperados na janela
  v_fator       numeric;   -- o quanto a academia de fato operou (0..1)
  v_alunos      jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN NULL;
  END IF;

  v_fuso := public.fuso_do_tenant(v_tenant);

  -- Um fuso inválido gravado numa tela de configuração não pode derrubar a
  -- leitura. Mesma tolerância de hojeNoFuso() no TypeScript.
  BEGIN
    v_hoje := (now() AT TIME ZONE v_fuso)::date;
  EXCEPTION WHEN OTHERS THEN
    v_fuso := 'America/Sao_Paulo';
    v_hoje := (now() AT TIME ZONE v_fuso)::date;
  END;

  v_inicio     := v_hoje - (v_janela - 1);
  v_semanas    := v_janela / 7.0;
  v_semanas_bl := (v_janela * 3) / 7.0;

  -- GUARDA 1 — dias em que a academia registrou qualquer chamada.
  -- Uma linha basta, presente ou ausente: o que ela prova é que a chamada
  -- aconteceu. Dia sem nenhuma linha não existiu para efeito de cobrança.
  SELECT count(DISTINCT p.data) INTO v_dias_op
    FROM public.presencas p
   WHERE p.tenant_id = v_tenant
     AND p.data BETWEEN v_inicio AND v_hoje;

  -- Quantos dias por semana esta academia abre, segundo a grade ativa.
  SELECT count(DISTINCT h.dia) INTO v_dias_semana
    FROM public.horarios h
   WHERE h.tenant_id = v_tenant AND h.ativo;

  v_esperados := v_semanas * COALESCE(NULLIF(v_dias_semana, 0), 0);

  -- GUARDA 3 — a expectativa acompanha a operação real. Academia que rodou
  -- metade dos dias esperados no período cobra metade da meta.
  v_fator := CASE
               WHEN v_esperados > 0 THEN LEAST(v_dias_op / v_esperados, 1)
               ELSE NULL
             END;

  WITH
  -- Os dias de chamada, um a um: `dias_sem_treinar` conta quantos deles
  -- passaram desde o último treino do aluno, e não dias de calendário. É o que
  -- impede que duas semanas sem chamada virem duas semanas de sumiço.
  dias_operacao AS (
    SELECT DISTINCT p.data
      FROM public.presencas p
     WHERE p.tenant_id = v_tenant
       AND p.data BETWEEN v_inicio AND v_hoje
  ),
  base AS (
    SELECT a.id, a.nome_completo, a.categoria, a.data_entrada
      FROM public.alunos a
     WHERE a.tenant_id = v_tenant
       AND a.status = 'ativo'
       AND (p_aluno_id IS NULL OR a.id = p_aluno_id)
  ),
  -- A meta contratada: contrato ativo mais recente, e a frequência do plano
  -- que ele aponta.
  meta_plano AS (
    SELECT DISTINCT ON (c.aluno_id) c.aluno_id, pl.frequencia_semanal
      FROM public.contratos c
      JOIN public.planos pl ON pl.id = c.plano_id
     WHERE c.tenant_id = v_tenant
       AND c.status = 'ativo'
     ORDER BY c.aluno_id, c.data_inicio DESC, c.created_at DESC
  ),
  -- GUARDA 2 — dias distintos, nunca COUNT(*).
  janela AS (
    SELECT p.aluno_id, count(DISTINCT p.data) AS dias
      FROM public.presencas p
     WHERE p.tenant_id = v_tenant
       AND p.presente
       AND p.data BETWEEN v_inicio AND v_hoje
     GROUP BY p.aluno_id
  ),
  -- O hábito anterior do aluno, na janela imediatamente anterior (3x maior).
  -- Serve de meta quando não há plano, e de linha de base para o ritmo.
  linha_base AS (
    SELECT p.aluno_id, count(DISTINCT p.data) AS dias
      FROM public.presencas p
     WHERE p.tenant_id = v_tenant
       AND p.presente
       AND p.data >= v_inicio - (v_janela * 3)
       AND p.data <  v_inicio
     GROUP BY p.aluno_id
  ),
  -- Sem recorte de janela: quem sumiu há mais tempo que ela precisa de uma
  -- data, não de um NULL.
  ultima AS (
    SELECT p.aluno_id, max(p.data) AS data
      FROM public.presencas p
     WHERE p.tenant_id = v_tenant
       AND p.presente
       AND p.data <= v_hoje
     GROUP BY p.aluno_id
  ),
  calc AS (
    SELECT
      b.id,
      b.nome_completo,
      b.categoria,
      b.data_entrada,
      u.data AS ultima_presenca,
      COALESCE(j.dias, 0) AS dias_treinados,
      COALESCE(lb.dias, 0) AS dias_base,
      mp.frequencia_semanal AS meta_contratada,
      -- Média semanal do período anterior. Média e não mediana de propósito:
      -- a mediana sobre as semanas OBSERVADAS ignora as semanas em que o aluno
      -- não apareceu (elas não geram linha), e puxaria a meta para cima
      -- justamente para quem treina pouco.
      CASE
        WHEN COALESCE(lb.dias, 0) > 0
          THEN GREATEST(1, round(lb.dias / v_semanas_bl)::integer)
        ELSE NULL
      END AS meta_historica,
      -- Nunca antes da matrícula: ninguém falta a aula que aconteceu antes de
      -- ser aluno. Sem isto, quem entrou anteontem e ainda não treinou herda a
      -- janela inteira de dias de chamada como sumiço.
      (SELECT count(*)
         FROM dias_operacao d
        WHERE (u.data IS NULL OR d.data > u.data)
          AND d.data >= b.data_entrada) AS dias_sem_treinar
    FROM base b
    LEFT JOIN janela     j  ON j.aluno_id  = b.id
    LEFT JOIN linha_base lb ON lb.aluno_id = b.id
    LEFT JOIN ultima     u  ON u.aluno_id  = b.id
    LEFT JOIN meta_plano mp ON mp.aluno_id = b.id
  ),
  final AS (
    SELECT
      c.*,
      COALESCE(c.meta_contratada, c.meta_historica, 1) AS meta,
      CASE
        WHEN c.meta_contratada IS NOT NULL THEN 'plano'
        WHEN c.meta_historica  IS NOT NULL THEN 'historico'
        ELSE 'padrao'
      END AS meta_origem,
      -- Quem se matriculou dentro da janela só responde pelo tempo em que já
      -- era aluno. Cobrar as 4 semanas de quem entrou há 5 dias devolvia 25% de
      -- aderência para alguém em dia — número errado na tela, mesmo com a
      -- carência avisando para não pontuar.
      LEAST(v_janela, GREATEST(1, (v_hoje - c.data_entrada) + 1)) / 7.0
        AS semanas_aluno
    FROM calc c
  )
  SELECT COALESCE(jsonb_agg(linha ORDER BY (linha->>'dias_sem_treinar')::int DESC,
                                   linha->>'nome_completo'), '[]'::jsonb)
    INTO v_alunos
    FROM (
      SELECT jsonb_build_object(
        'aluno_id',           f.id,
        'nome_completo',      f.nome_completo,
        'categoria',          f.categoria,
        'meta_semanal',       f.meta,
        'meta_origem',        f.meta_origem,
        'dias_treinados',     f.dias_treinados,
        -- A meta traduzida para a janela, já encolhida pelo fator de operação
        -- e pelo tempo de casa do aluno.
        'dias_esperados',     CASE WHEN v_fator IS NOT NULL
                                   THEN round(f.meta * f.semanas_aluno * v_fator, 1)
                                   ELSE NULL END,
        -- NULL quando não há expectativa a cobrar: academia sem grade ativa,
        -- sem nenhuma chamada no período, ou expectativa menor que um dia
        -- inteiro de treino — abaixo disso a razão não tem resolução (treinar
        -- uma vez dá 100%, nenhuma dá 0%, e nem uma nem outra significa nada).
        -- Ausência de dado, não 100%.
        'aderencia',          CASE WHEN v_fator IS NOT NULL
                                    AND f.meta * f.semanas_aluno * v_fator >= 1
                                   THEN round(LEAST(f.dias_treinados /
                                        (f.meta * f.semanas_aluno * v_fator), 1), 3)
                                   ELSE NULL END,
        -- Sem teto: é o que deixa a queda de 4x para 2x aparecer, já que pela
        -- régua do contrato ela é invisível.
        'ritmo_semanal',      round(f.dias_treinados / f.semanas_aluno, 2),
        'ritmo_base_semanal', CASE WHEN f.dias_base > 0
                                   THEN round(f.dias_base / v_semanas_bl, 2)
                                   ELSE NULL END,
        'ultima_presenca',    f.ultima_presenca,
        'dias_sem_treinar',   f.dias_sem_treinar,
        'gap_esperado',       round(7.0 / f.meta, 2),
        -- GUARDA 4 — quem entrou há menos de uma janela ainda não teve tempo de
        -- formar rotina. Os números vão junto; o consumidor é que não pontua.
        'em_carencia',        f.data_entrada > v_hoje - v_janela,
        'dias_desde_entrada', (v_hoje - f.data_entrada)
      ) AS linha
      FROM final f
    ) linhas;

  RETURN jsonb_build_object(
    'janela', jsonb_build_object(
      'dias',  v_janela,
      'de',    v_inicio,
      'ate',   v_hoje,
      'fuso',  v_fuso
    ),
    'operacao', jsonb_build_object(
      'dias_com_chamada',   v_dias_op,
      'dias_por_semana',    v_dias_semana,
      'dias_esperados',     round(v_esperados, 1),
      'fator',              CASE WHEN v_fator IS NOT NULL
                                 THEN round(v_fator, 3) ELSE NULL END,
      -- Menos de metade dos dias esperados com chamada: os números saem, mas
      -- não sustentam conclusão sobre ninguém. Quem consome tem que dizer isso
      -- na tela em vez de mostrar uma lista de risco.
      'confiavel',          COALESCE(v_fator >= 0.5, false)
    ),
    'alunos', v_alunos
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.frequencia_aluno(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.frequencia_aluno(uuid, integer) TO authenticated, service_role;


COMMIT;
