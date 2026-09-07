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
--      marcar a turma inteira como ausente. Medido POR CATEGORIA: férias
--      escolares param o kids e o adulto continua, e uma guarda medida na
--      academia inteira não enxerga isso.
--   2. Dias distintos, nunca COUNT(*). Duas modalidades na mesma terça são um
--      dia de treino, porque o plano é vendido em dias por semana.
--   3. A meta encolhe junto com a operação da categoria. Se ela rodou metade
--      dos dias esperados, a expectativa cai na mesma proporção.
--   4. Aluno recém-matriculado sai marcado como em carência, e não responde por
--      dias de aula anteriores à própria matrícula.
--
-- Duas leituras de sumiço, de propósito:
--
--   dias_sem_treinar          oportunidades perdidas — chamadas DA CATEGORIA
--                             dele desde o último treino.
--   dias_corridos_sem_treinar dias de calendário desde o último treino.
--
-- O par é o que denuncia dado velho. Zero oportunidade perdida com 14 dias
-- corridos não quer dizer que ele treinou: quer dizer que ninguém fez chamada.
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
--
-- ---------------------------------------------------------------------------
-- OPERAÇÃO
--
-- Idempotente: pode rodar quantas vezes for preciso (CREATE INDEX IF NOT
-- EXISTS, CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS + CREATE).
-- Verificado rodando três vezes seguidas: o estado final é o mesmo.
--
-- Não altera nenhuma linha de dado: zero INSERT/UPDATE/DELETE/TRUNCATE.
--
-- LOCK: os dois CREATE INDEX pegam SHARE em `presencas` e bloqueiam ESCRITA
-- (não leitura) enquanto constroem — a chamada do dia trava, a tela de
-- consulta não. Em 240 mil linhas isso é da ordem de um segundo. Numa base
-- muito maior, rode os dois índices fora desta transação com CREATE INDEX
-- CONCURRENTLY antes de aplicar o resto (CONCURRENTLY não roda dentro de
-- BEGIN/COMMIT). O DROP/CREATE POLICY pega ACCESS EXCLUSIVE por instantes.
--
-- ROLLBACK (não há arquivo separado; migrations/ não usa essa convenção):
--
--   DROP FUNCTION IF EXISTS public.frequencia_aluno(uuid, integer);
--   DROP FUNCTION IF EXISTS public.fuso_do_tenant(uuid);
--   DROP INDEX IF EXISTS public.idx_presencas_tenant_data;
--   DROP INDEX IF EXISTS public.idx_presencas_aluno_data;
--   -- e reaplicar presencas_select como está em 20260701033153
--
-- Derrubar só as funções é seguro a qualquer momento: nada no schema depende
-- delas, e o único chamador é uma server function. Reverter a policy devolve
-- o custo de RLS por linha descrito abaixo.
-- ---------------------------------------------------------------------------

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
-- presencas_select: as funções do RLS avaliadas UMA vez, não uma por linha
--
-- O predicado é o MESMO de 20260701033153 — mesmas funções, mesmos papéis,
-- mesmas categorias. A única mudança é envolver as chamadas sem argumento em
-- `(SELECT f())`. Isso não altera semântica: são funções STABLE sem parâmetro,
-- e o valor é idêntico. O que muda é o plano — o Postgres passa a avaliá-las
-- como InitPlan (uma vez por consulta) em vez de por linha varrida.
--
-- Isto não era visível até agora porque a tela de chamada lê um horário de um
-- dia — algumas dezenas de linhas. frequencia_aluno() é a primeira leitura que
-- varre a tabela inteira por período, e nessa escala o custo aparece inteiro.
--
-- Medido em Postgres 16 local, academia de 5.000 alunos e 240.000 presenças:
--
--   SELECT count(*) sobre presencas       23.942 ms  ->    245 ms
--   frequencia_aluno() lista completa     58.071 ms  ->  3.846 ms
--   frequencia_aluno() de um aluno         5.986 ms  ->     35 ms
--
-- O EXISTS do professor continua correlacionado (depende de presencas.aluno_id
-- e não pode ser içado); só as funções de papel saem do laço.
--
-- As outras 48 policies do schema têm o mesmo ganho disponível pela mesma
-- reescrita. Não foram tocadas aqui de propósito: esta migração mexe só na
-- tabela que a leitura nova passou a varrer.
-- ============================================================================

DROP POLICY IF EXISTS presencas_select ON public.presencas;

CREATE POLICY presencas_select ON public.presencas FOR SELECT TO authenticated
USING (
  tenant_id = (SELECT public.get_current_tenant()) AND (
    (SELECT public.is_admin())
    OR (SELECT public.is_recepcao())
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = presencas.aluno_id
      AND (
        ((SELECT public.is_professor_kids())   AND a.categoria = 'kids')
        OR ((SELECT public.is_professor_adulto()) AND a.categoria = 'adulto')
      )
    )
  )
);


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
  v_operacao    jsonb;
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

  WITH
  -- Todas as categorias do enum: a operação é medida POR CATEGORIA, e uma
  -- categoria sem grade nenhuma ainda precisa aparecer para o aluno dela
  -- receber "não avaliável" em vez de um numero inventado.
  -- Pedindo um aluno só, mede-se só a categoria dele. Restringir aqui (e não
  -- em cada CTE) mantém dias_operacao, grade e operacao coerentes entre si:
  -- antes o envelope reportava "adulto: 0 chamadas, não confiável" numa
  -- consulta de aluno kids — a categoria não tinha sido medida, e o envelope
  -- afirmava que ela não operou.
  categorias AS (
    SELECT v FROM unnest(enum_range(NULL::categoria_aluno)) v
     WHERE p_aluno_id IS NULL
        OR v = (SELECT a.categoria FROM public.alunos a WHERE a.id = p_aluno_id)
  ),
  -- GUARDA 1 — dias em que a academia registrou chamada, POR CATEGORIA.
  --
  -- Uma linha basta, presente ou ausente: o que ela prova e que a chamada
  -- aconteceu. Dia sem nenhuma linha nao existiu para efeito de cobranca.
  --
  -- Por categoria, e nao por academia inteira, porque a interrupcao quase
  -- nunca e da academia toda: ferias escolares param o kids e o adulto
  -- continua. Medindo o tenant inteiro, o fator ficava em 1.00 e a turma de
  -- kids inteira aparecia com metade da aderencia e dias de sumico que nunca
  -- tiveram aula para perder.
  --
  -- O ramo `categoria IS NULL` é defensivo: hoje horarios.categoria é NOT NULL
  -- com default 'adulto', então ele não dispara. Fica pela mesma convenção que
  -- portal_aluno_dados() já adota (horário sem categoria serve a todas), para
  -- o dia em que a coluna virar opcional — e para não silenciar uma categoria
  -- inteira se isso acontecer.
  dias_operacao AS (
    SELECT c.v AS categoria, p.data
      FROM public.presencas p
      JOIN public.horarios h ON h.id = p.horario_id
      JOIN categorias c ON h.categoria IS NULL OR h.categoria = c.v
     WHERE p.tenant_id = v_tenant
       AND p.data BETWEEN v_inicio AND v_hoje
     GROUP BY 1, 2
  ),
  grade AS (
    SELECT c.v AS categoria, count(DISTINCT h.dia) AS dias_semana
      FROM public.horarios h
      JOIN categorias c ON h.categoria IS NULL OR h.categoria = c.v
     WHERE h.tenant_id = v_tenant AND h.ativo
     GROUP BY 1
  ),
  -- GUARDA 3 — a expectativa acompanha a operacao real da categoria.
  operacao AS (
    SELECT c.v AS categoria,
           COALESCE(g.dias_semana, 0)              AS dias_por_semana,
           COALESCE(o.dias, 0)                     AS dias_com_chamada,
           v_semanas * COALESCE(g.dias_semana, 0)  AS dias_esperados,
           CASE WHEN COALESCE(g.dias_semana, 0) > 0
                THEN LEAST(COALESCE(o.dias, 0) / (v_semanas * g.dias_semana), 1)
                ELSE NULL
           END AS fator
      FROM categorias c
      LEFT JOIN grade g ON g.categoria = c.v
      LEFT JOIN (SELECT categoria, count(*) AS dias FROM dias_operacao GROUP BY 1) o
             ON o.categoria = c.v
     WHERE COALESCE(g.dias_semana, 0) > 0 OR COALESCE(o.dias, 0) > 0
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
    SELECT p.aluno_id, count(DISTINCT p.data) AS dias, min(p.data) AS primeira
      FROM public.presencas p
     WHERE p.tenant_id = v_tenant
       AND p.presente
       AND p.data BETWEEN v_inicio AND v_hoje
       AND (p_aluno_id IS NULL OR p.aluno_id = p_aluno_id)
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
       AND (p_aluno_id IS NULL OR p.aluno_id = p_aluno_id)
     GROUP BY p.aluno_id
  ),
  -- Última presença dentro do histórico analisado (janela + linha de base).
  --
  -- O limite inferior importa: sem ele este agregado varria TODA a história de
  -- presenças da academia a cada chamada, e ficava mais lento a cada mês de
  -- operação. Quem não treina há mais que o histórico analisado sai com
  -- ultima_presenca NULL — que para efeito de frequência já é o pior caso
  -- possível, e o consumidor distingue "nunca apareceu" por dias_desde_entrada.
  ultima AS (
    SELECT p.aluno_id, max(p.data) AS data
      FROM public.presencas p
     WHERE p.tenant_id = v_tenant
       AND p.presente
       AND p.data BETWEEN v_inicio - (v_janela * 3) AND v_hoje
       AND (p_aluno_id IS NULL OR p.aluno_id = p_aluno_id)
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
      j.primeira AS primeira_presenca,
      COALESCE(lb.dias, 0) AS dias_base,
      mp.frequencia_semanal AS meta_contratada,
      op.fator,
      -- Média semanal do período anterior. Média e não mediana de propósito:
      -- a mediana sobre as semanas OBSERVADAS ignora as semanas em que o aluno
      -- não apareceu (elas não geram linha), e puxaria a meta para cima
      -- justamente para quem treina pouco.
      CASE
        WHEN COALESCE(lb.dias, 0) > 0
          THEN GREATEST(1, round(lb.dias / v_semanas_bl)::integer)
        ELSE NULL
      END AS meta_historica,
      -- Dias de chamada DA CATEGORIA DELE desde o último treino. Nunca antes
      -- da matrícula: ninguém falta a aula que aconteceu antes de ser aluno.
      (SELECT count(*)
         FROM dias_operacao d
        WHERE d.categoria = b.categoria
          AND (u.data IS NULL OR d.data > u.data)
          AND d.data >= b.data_entrada) AS dias_sem_treinar
    FROM base b
    LEFT JOIN janela     j  ON j.aluno_id  = b.id
    LEFT JOIN linha_base lb ON lb.aluno_id = b.id
    LEFT JOIN ultima     u  ON u.aluno_id  = b.id
    LEFT JOIN meta_plano mp ON mp.aluno_id = b.id
    LEFT JOIN operacao   op ON op.categoria = b.categoria
  ),
  final AS (
    SELECT
      c.*,
      -- NULLIF + GREATEST + LEAST porque `planos.frequencia_semanal` é um
      -- integer solto: sem CHECK no banco e sem validação no planoSchema, e a
      -- tela de planos grava Number("") = 0 quando o admin apaga o campo.
      -- Meta 0 dividia por zero em gap_esperado e derrubava a leitura da
      -- academia inteira; negativo produzia expectativa negativa. Zero ou menos
      -- conta como "não informado" e cai no histórico. Teto de 7 porque não
      -- existe treinar 8 dias numa semana.
      LEAST(7, GREATEST(1, COALESCE(
        NULLIF(GREATEST(c.meta_contratada, 0), 0),
        c.meta_historica,
        1))) AS meta,
      CASE
        WHEN COALESCE(c.meta_contratada, 0) > 0 THEN 'plano'
        WHEN c.meta_historica IS NOT NULL       THEN 'historico'
        ELSE 'padrao'
      END AS meta_origem,
      -- Quem se matriculou dentro da janela só responde pelo tempo em que já
      -- era aluno. Cobrar as 4 semanas de quem entrou há 5 dias devolvia 25% de
      -- aderência para alguém em dia — número errado na tela, mesmo com a
      -- carência avisando para não pontuar.
      --
      -- O início efetivo é o MENOR entre a matrícula e a primeira presença do
      -- período, recortado pela janela. Sem isso, uma data_entrada digitada no
      -- futuro (erro de cadastro comum) encolhia o tempo de casa para 1 dia e
      -- devolvia ritmo de 56 treinos por semana — número plausível na conta e
      -- absurdo na realidade. Presença é prova de que o aluno já existia: onde
      -- a matrícula contradiz o registro, vale o registro.
      (v_hoje - GREATEST(
                  v_inicio,
                  LEAST(c.data_entrada, COALESCE(c.primeira_presenca, v_hoje))
                ) + 1) / 7.0 AS semanas_aluno
    FROM calc c
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'categoria',        o.categoria,
       'dias_com_chamada', o.dias_com_chamada,
       'dias_por_semana',  o.dias_por_semana,
       'dias_esperados',   round(o.dias_esperados, 1),
       'fator',            CASE WHEN o.fator IS NOT NULL THEN round(o.fator, 3) END,
       -- Metade ou menos dos dias esperados com chamada: os números saem, mas
       -- não sustentam conclusão sobre ninguém, e a tela tem que dizer isso em
       -- vez de mostrar uma lista de risco. Uma semana esquecida em quatro dá
       -- 0,75 e segue utilizável; duas semanas dá 0,50 e não segue.
       'confiavel',        COALESCE(o.fator > 0.5, false)
     ) ORDER BY o.categoria), '[]'::jsonb) FROM operacao o),
    (SELECT COALESCE(jsonb_agg(l.linha ORDER BY l.ord_gap DESC, l.ord_nome), '[]'::jsonb)
       FROM (
         SELECT
           f.dias_sem_treinar AS ord_gap,
           f.nome_completo    AS ord_nome,
           jsonb_build_object(
             'aluno_id',           f.id,
             'nome_completo',      f.nome_completo,
             'categoria',          f.categoria,
             'meta_semanal',       f.meta,
             'meta_origem',        f.meta_origem,
             'dias_treinados',     f.dias_treinados,
             -- A meta traduzida para a janela, já encolhida pelo fator de
             -- operação da categoria e pelo tempo de casa do aluno.
             'dias_esperados',     CASE WHEN f.fator IS NOT NULL
                                        THEN round(f.meta * f.semanas_aluno * f.fator, 1)
                                        ELSE NULL END,
             -- NULL quando não há expectativa a cobrar: categoria sem grade
             -- ativa, sem chamada no período, ou expectativa menor que um dia
             -- inteiro de treino — abaixo disso a razão não tem resolução
             -- (treinar uma vez dá 100%, nenhuma dá 0%, e nem uma nem outra
             -- significa nada). Ausência de dado, não 100%.
             'aderencia',          CASE WHEN f.fator IS NOT NULL
                                         AND f.meta * f.semanas_aluno * f.fator >= 1
                                        THEN round(LEAST(f.dias_treinados /
                                             (f.meta * f.semanas_aluno * f.fator), 1), 3)
                                        ELSE NULL END,
             -- Sem teto: é o que deixa a queda de 4x para 2x aparecer, já que
             -- pela régua do contrato ela é invisível.
             'ritmo_semanal',      round(f.dias_treinados / f.semanas_aluno, 2),
             'ritmo_base_semanal', CASE WHEN f.dias_base > 0
                                        THEN round(f.dias_base / v_semanas_bl, 2)
                                        ELSE NULL END,
             'ultima_presenca',    f.ultima_presenca,
             -- Oportunidades perdidas: chamadas da categoria dele desde o
             -- último treino. Zero quando a academia não registrou nada.
             'dias_sem_treinar',   f.dias_sem_treinar,
             -- Dias de calendário desde o último treino. O par com o de cima é
             -- o que denuncia dado velho: 0 oportunidade perdida com 14 dias
             -- corridos significa que ninguém fez chamada, não que ele treinou.
             'dias_corridos_sem_treinar', (v_hoje - f.ultima_presenca),
             'gap_esperado',       round(7.0 / f.meta, 2),
             -- GUARDA 4 — quem entrou há menos de uma janela ainda não teve
             -- tempo de formar rotina. Os números vão junto; o consumidor é
             -- que não pontua.
             'em_carencia',        f.data_entrada > v_hoje - v_janela,
             -- GREATEST(0): matrícula futura é erro de cadastro da tela de
             -- alunos, não um número negativo para a tela de frequência
             -- renderizar. em_carencia já marca a linha como não pontuável.
             'dias_desde_entrada', GREATEST(0, (v_hoje - f.data_entrada)),
             -- A categoria dele teve chamada suficiente para sustentar
             -- conclusão? Repetido por linha porque é por categoria.
             'confiavel',          COALESCE(f.fator > 0.5, false)
           ) AS linha
         FROM final f
       ) l)
  INTO v_operacao, v_alunos;

  RETURN jsonb_build_object(
    'janela', jsonb_build_object(
      'dias',  v_janela,
      'de',    v_inicio,
      'ate',   v_hoje,
      'fuso',  v_fuso
    ),
    'operacao', v_operacao,
    'alunos',   v_alunos
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.frequencia_aluno(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.frequencia_aluno(uuid, integer) TO authenticated, service_role;


COMMIT;
