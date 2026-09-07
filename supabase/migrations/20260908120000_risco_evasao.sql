-- risco_evasao(p_aluno_id, p_dias) — leitura de risco por aluno.
--
-- O QUE ELA NÃO É
--
-- Não é uma previsão, não é um veredito, e não classifica ninguém como "vai
-- sair". É a soma de sinais nomeados, cada um com o fato que o disparou, de
-- forma que o gestor possa discordar de cada parcela olhando o mesmo dado.
-- Quem decide o que fazer com um aluno é quem conhece o aluno.
--
-- POR QUE NÃO COMEÇA PELA FREQUÊNCIA
--
-- Começaria, se houvesse chamada. Nesta academia há 21 presenças registradas
-- no total, em dois dias de um mês atrás, para 59 alunos e 37 horários. Um
-- score sobre frequência ali não seria impreciso: seria inventado.
--
-- Então a frequência entra como UM componente, e só quando a própria
-- frequencia_aluno() diz que o período é confiável. Enquanto não for, ela sai
-- da conta — não entra como zero. Quando a chamada virar rotina, ela passa a
-- pesar sozinha, sem mudar uma linha aqui.
--
-- A REGRA QUE ORGANIZA TUDO: NULL NÃO É ZERO
--
-- Cada componente devolve pontos ou NULL. NULL significa "não deu para medir",
-- e o peso dele sai do denominador em vez de contar como "sem problema".
--
-- Sem isso, o aluno de quem menos se sabe seria o que aparece mais seguro:
-- quem não tem contrato não tem mensalidade, não tem atraso, e fecharia com
-- risco baixo por ausência de dado. É o mesmo erro que "0 treinos" e "nenhuma
-- chamada" mostrados como o mesmo "0" na tela de frequência.
--
-- Por isso a função devolve `cobertura`: quanto do peso total pôde ser medido.
-- Um risco de 70 com cobertura 0,31 e um risco de 70 com cobertura 1,00 são
-- afirmações muito diferentes, e a tela precisa poder dizer qual é qual.
--
-- OS COMPONENTES E SEUS PESOS (130 no total)
--
--   atraso        40  dias de atraso da mensalidade em aberto mais antiga
--   reincidencia  20  quantas das últimas 6 competências foram pagas em atraso
--   contrato      25  contrato pausado, ou aluno ativo sem contrato ativo
--   tempo_casa    15  os primeiros 90 dias concentram a evasão
--   frequencia    30  só quando confiavel = true e o aluno não está em carência
--
-- `contrato` e `tempo_casa` nunca são NULL, então a cobertura nunca é zero e
-- não existe divisão por zero — mas o denominador é protegido assim mesmo,
-- porque a lição do frequencia_semanal = 0 foi que a coluna sem CHECK sempre
-- encontra um jeito.
--
-- NÃO É SECURITY DEFINER: o RLS de alunos, contratos e mensalidades continua
-- valendo dentro dela, e cada papel enxerga o recorte que já enxergava.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_mensalidades_aluno_venc
  ON public.mensalidades (aluno_id, data_vencimento DESC)
  WHERE status <> 'cancelado';

CREATE OR REPLACE FUNCTION public.risco_evasao(
  p_aluno_id uuid    DEFAULT NULL,
  p_dias     integer DEFAULT 28
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  v_fuso  text;
  v_hoje  date;
  v_freq  jsonb;
  v_saida jsonb;
BEGIN
  v_fuso := public.fuso_do_tenant(public.get_current_tenant());
  BEGIN
    v_hoje := (now() AT TIME ZONE v_fuso)::date;
  EXCEPTION WHEN OTHERS THEN
    v_fuso := 'America/Sao_Paulo';
    v_hoje := (now() AT TIME ZONE v_fuso)::date;
  END;

  -- UMA chamada, não uma por aluno. A frequência não é recalculada aqui:
  -- vem pronta de quem já sabe medi-la, com as guardas dela.
  v_freq := public.frequencia_aluno(p_aluno_id, p_dias);

  WITH base AS (
    SELECT a.id, a.nome_completo, a.categoria, a.data_entrada
      FROM public.alunos a
     WHERE a.status = 'ativo'
       AND (p_aluno_id IS NULL OR a.id = p_aluno_id)
  ),
  contrato AS (
    SELECT DISTINCT ON (c.aluno_id)
           c.aluno_id, c.status::text AS status
      FROM public.contratos c
     WHERE c.status IN ('ativo', 'pausado')
     ORDER BY c.aluno_id, (c.status = 'ativo') DESC, c.data_inicio DESC
  ),
  -- Em aberto = pendente ou vencido com vencimento já passado. Os dois, e não
  -- só 'vencido', porque quem carimba 'vencido' é o processar_mensalidades_
  -- diario(): entre o vencimento e a próxima rodada dele a parcela fica
  -- 'pendente' e atrasada ao mesmo tempo.
  aberto AS (
    SELECT m.aluno_id,
           max(v_hoje - m.data_vencimento) AS dias_atraso,
           count(*)                        AS parcelas
      FROM public.mensalidades m
     WHERE m.status IN ('pendente', 'vencido')
       AND m.data_vencimento < v_hoje
     GROUP BY m.aluno_id
  ),
  -- Histórico: das últimas 6 competências já vencidas, quantas não foram
  -- pagas em dia. Menos de 3 não sustenta afirmação sobre padrão.
  ultimas AS (
    SELECT m.aluno_id, m.data_vencimento, m.data_pagamento, m.status,
           row_number() OVER (PARTITION BY m.aluno_id
                                  ORDER BY m.data_vencimento DESC) AS n
      FROM public.mensalidades m
     WHERE m.status <> 'cancelado'
       AND m.data_vencimento < v_hoje
  ),
  historico AS (
    SELECT u.aluno_id,
           count(*) AS consideradas,
           count(*) FILTER (
             WHERE u.status <> 'pago'
                OR (u.data_pagamento IS NOT NULL
                    AND u.data_pagamento > u.data_vencimento)
           ) AS atrasadas
      FROM ultimas u
     WHERE u.n <= 6
     GROUP BY u.aluno_id
  ),
  freq AS (
    SELECT (e->>'id')::uuid                 AS aluno_id,
           (e->>'confiavel')::boolean       AS confiavel,
           (e->>'em_carencia')::boolean     AS em_carencia,
           (e->>'aderencia')::numeric       AS aderencia,
           (e->>'ritmo_semanal')::numeric   AS ritmo,
           (e->>'ritmo_base_semanal')::numeric AS ritmo_base,
           (e->>'dias_sem_treinar')::int    AS oportunidades_perdidas
      FROM jsonb_array_elements(v_freq->'alunos') e
  ),
  medido AS (
    SELECT
      b.id, b.nome_completo, b.categoria, b.data_entrada,
      (v_hoje - b.data_entrada)                  AS dias_de_casa,
      ct.status                                  AS contrato_status,
      ab.dias_atraso, ab.parcelas,
      h.consideradas, h.atrasadas,
      f.confiavel, f.em_carencia, f.aderencia, f.ritmo, f.ritmo_base,
      f.oportunidades_perdidas,

      -- ATRASO (40). NULL quando o aluno não tem nenhuma parcela já vencida:
      -- pode ser contrato novo antes do primeiro vencimento, ou aluno sem
      -- contrato. Nos dois casos não há atraso a medir — e "não há atraso a
      -- medir" não é "está em dia".
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM public.mensalidades m
                          WHERE m.aluno_id = b.id
                            AND m.status <> 'cancelado'
                            AND m.data_vencimento < v_hoje) THEN NULL
        WHEN ab.dias_atraso IS NULL     THEN 0
        WHEN ab.dias_atraso <= 15       THEN 12
        WHEN ab.dias_atraso <= 30       THEN 24
        WHEN ab.dias_atraso <= 60       THEN 34
        ELSE 40
      END AS p_atraso,

      -- REINCIDENCIA (20). Proporcional, não degrau: 3 de 6 em atraso dá
      -- metade dos pontos.
      CASE
        WHEN COALESCE(h.consideradas, 0) < 3 THEN NULL
        ELSE round(20.0 * h.atrasadas / h.consideradas)::int
      END AS p_reincidencia,

      -- CONTRATO (25). Nunca NULL: a ausência de contrato é ela mesma o sinal.
      CASE
        WHEN ct.status IS NULL     THEN 25   -- ativo na ficha, sem contrato
        WHEN ct.status = 'pausado' THEN 25   -- pausar é dizer que vai parar
        ELSE 0
      END AS p_contrato,

      -- TEMPO DE CASA (15). Nunca NULL: data_entrada é NOT NULL.
      CASE
        WHEN (v_hoje - b.data_entrada) <  90 THEN 15
        WHEN (v_hoje - b.data_entrada) < 180 THEN 8
        ELSE 0
      END AS p_tempo_casa,

      -- FREQUENCIA (30). Só quando a própria frequencia_aluno() diz que o
      -- período sustenta conclusão. Aluno em carência fica de fora: ele ainda
      -- não teve tempo de formar rotina.
      CASE
        WHEN f.confiavel IS NOT TRUE      THEN NULL
        WHEN f.em_carencia               THEN NULL
        WHEN f.aderencia IS NULL         THEN NULL
        WHEN f.aderencia >= 0.8          THEN 0
        WHEN f.aderencia >= 0.6          THEN 10
        WHEN f.aderencia >= 0.4          THEN 20
        ELSE 30
      END AS p_frequencia
    FROM base b
    LEFT JOIN contrato  ct ON ct.aluno_id = b.id
    LEFT JOIN aberto    ab ON ab.aluno_id = b.id
    LEFT JOIN historico h  ON h.aluno_id  = b.id
    LEFT JOIN freq      f  ON f.aluno_id  = b.id
  ),
  somado AS (
    SELECT m.*,
           COALESCE(m.p_atraso,0) + COALESCE(m.p_reincidencia,0)
             + m.p_contrato + m.p_tempo_casa + COALESCE(m.p_frequencia,0) AS pontos,
           (CASE WHEN m.p_atraso       IS NULL THEN 0 ELSE 40 END)
             + (CASE WHEN m.p_reincidencia IS NULL THEN 0 ELSE 20 END)
             + 25 + 15
             + (CASE WHEN m.p_frequencia  IS NULL THEN 0 ELSE 30 END) AS peso,
           -- Exige pelo menos um sinal de COMPORTAMENTO: pagamento ou
           -- frequência. `contrato` e `tempo_casa` estão sempre disponíveis,
           -- então sozinhos eles davam nota cheia sobre 40 de peso: o aluno
           -- matriculado hoje, ainda sem contrato lançado, saía com risco 100 e
           -- cobertura 0,31 — no topo da lista, por ser novo.
           --
           -- Normalizar sobre um denominador minúsculo transforma ignorância em
           -- certeza. É o mesmo motivo pelo qual `aderencia` devolve NULL
           -- quando a expectativa do período é menor que um treino.
           --
           -- Sem sinal de comportamento o risco é NULL, e os fatos continuam
           -- em `motivos`: "sem contrato ativo" segue visível, só não vestido
           -- de nota.
           (m.p_atraso IS NOT NULL OR m.p_reincidencia IS NOT NULL
              OR m.p_frequencia IS NOT NULL) AS tem_comportamento
      FROM medido m
  )
  SELECT jsonb_build_object(
    'janela', jsonb_build_object('ate', v_hoje, 'dias', p_dias, 'fuso', v_fuso),
    'peso_total', 130,
    'alunos', COALESCE(jsonb_agg(l.linha ORDER BY l.ord DESC, l.nome), '[]'::jsonb)
  )
  INTO v_saida
  FROM (
    SELECT
      s.nome_completo AS nome,
      COALESCE(CASE WHEN s.tem_comportamento
                    THEN round(100.0 * s.pontos / NULLIF(s.peso,0)) END, -1) AS ord,
      jsonb_build_object(
        'id',                s.id,
        'nome_completo',     s.nome_completo,
        'categoria',         s.categoria,
        -- 0 a 100 sobre o peso do que DEU para medir, não sobre 130.
        'risco',             CASE WHEN s.tem_comportamento
                                  THEN round(100.0 * s.pontos / NULLIF(s.peso,0)) END,
        'cobertura',         round(s.peso / 130.0, 2),
        'componentes', jsonb_build_object(
          'atraso',       s.p_atraso,       'reincidencia', s.p_reincidencia,
          'contrato',     s.p_contrato,     'tempo_casa',   s.p_tempo_casa,
          'frequencia',   s.p_frequencia
        ),
        -- O porquê, em fatos conferíveis. A tela mostra isto, não só o número.
        'motivos', (
          SELECT COALESCE(jsonb_agg(t ORDER BY o), '[]'::jsonb)
          FROM (
            SELECT 1 AS o, 'Mensalidade em aberto há ' || s.dias_atraso || ' dias'
                   || CASE WHEN s.parcelas > 1
                           THEN ' (' || s.parcelas || ' parcelas)' ELSE '' END AS t
             WHERE s.dias_atraso IS NOT NULL
            UNION ALL
            SELECT 2, s.atrasadas || ' das últimas ' || s.consideradas
                      || ' mensalidades foram pagas em atraso'
             WHERE COALESCE(s.atrasadas,0) > 0 AND s.consideradas >= 3
            UNION ALL
            SELECT 3, 'Contrato pausado'          WHERE s.contrato_status = 'pausado'
            UNION ALL
            SELECT 3, 'Ativo na ficha, mas sem contrato ativo'
             WHERE s.contrato_status IS NULL
            UNION ALL
            SELECT 4, 'Matriculado há ' || s.dias_de_casa || ' dias'
             WHERE s.dias_de_casa < 90
            UNION ALL
            SELECT 5, 'Aderência de ' || round(100*s.aderencia) || '% no período'
             WHERE s.p_frequencia IS NOT NULL AND s.p_frequencia > 0
          ) m2(o, t)
        ),
        -- O que NÃO pôde ser medido. Some ao lado do número, para o gestor
        -- saber sobre quanta ignorância ele está decidindo.
        'nao_medido', (
          SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
            SELECT 'histórico de pagamento (menos de 3 competências vencidas)' AS t
             WHERE s.p_reincidencia IS NULL
            UNION ALL
            SELECT 'atraso (nenhuma mensalidade vencida ainda)'
             WHERE s.p_atraso IS NULL
            UNION ALL
            SELECT 'frequência (chamada insuficiente no período)'
             WHERE s.p_frequencia IS NULL AND COALESCE(s.em_carencia,false) = false
            UNION ALL
            SELECT 'frequência (aluno em carência)'
             WHERE s.p_frequencia IS NULL AND s.em_carencia
          ) n(t)
        )
      ) AS linha
    FROM somado s
  ) l;

  RETURN v_saida;
END;
$fn$;

COMMENT ON FUNCTION public.risco_evasao(uuid, integer) IS
  'Leitura de risco de evasao por aluno: soma de sinais nomeados (atraso, '
  'reincidencia, contrato, tempo de casa, frequencia), cada um com o fato que '
  'o disparou. Componente sem dado devolve NULL e sai do denominador — o campo '
  'cobertura diz quanto do peso total foi medido. Nao e previsao nem veredito.';

REVOKE EXECUTE ON FUNCTION public.risco_evasao(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.risco_evasao(uuid, integer) TO authenticated, service_role;

COMMIT;
