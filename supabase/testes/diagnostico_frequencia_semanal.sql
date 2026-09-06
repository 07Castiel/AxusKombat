-- ============================================================================
-- DIAGNÓSTICO: planos.frequencia_semanal
--
-- SOMENTE LEITURA. Nenhum comando deste arquivo altera dado nenhum.
--
-- COMO RODAR
--
-- Cole o arquivo inteiro no SQL Editor do Supabase e execute. É UMA consulta
-- só, de propósito: o editor mostra o resultado de um único statement, então a
-- versão anterior (sete SELECTs separados) exibia apenas um deles e escondia o
-- resto. Aqui tudo sai numa tabela, ordenada por seção.
--
-- Toda seção SEMPRE devolve pelo menos uma linha. Quando não há problema, a
-- linha diz isso com todas as letras. Silêncio nunca significa "não rodou".
--
-- POR QUE ISTO EXISTE
--
-- `frequencia_semanal` é a meta que frequencia_aluno() usa como denominador.
-- Se ela estiver errada no banco, a matemática correta produz números errados:
-- um plano gravado como 1x/semana faz um aluno de 3x aparecer com 300% de
-- aderência, e um plano gravado como 5x faz o mesmo aluno aparecer com 60%.
--
-- A coluna é `integer NULL` sem CHECK. Até a branch da frequência, o
-- `planoSchema` também não a validava, e a tela de planos gravava
-- `Number("") = 0` quando o admin apagava o campo — 0 é um valor plenamente
-- alcançável em bases existentes.
--
-- COMO LER A COLUNA `situacao`
--
--   OK          nada a fazer
--   CONFERIR    pode estar certo, vale um olhar
--   CORRIGIR    a meta está inválida e a frequência do aluno sai errada
--
-- O rodapé explica o que fazer com cada caso.
-- ============================================================================

WITH plano_status AS (
  SELECT
    p.id,
    p.tenant_id,
    p.nome,
    p.ativo,
    p.created_at,
    p.frequencia_semanal AS freq,
    CASE
      WHEN p.frequencia_semanal IS NULL      THEN 'nulo'
      WHEN p.frequencia_semanal = 0          THEN 'zero'
      WHEN p.frequencia_semanal < 0          THEN 'negativo'
      WHEN p.frequencia_semanal > 7          THEN 'acima_de_7'
      ELSE 'ok'
    END AS estado,
    -- "2x semana", "3 vezes por semana", "Plano 4X" -> 2, 3, 4
    (regexp_match(p.nome, '(\d+)\s*(?:x|vez)', 'i'))[1]::int AS nome_sugere
  FROM public.planos p
),
uso AS (
  SELECT
    c.plano_id,
    count(*) FILTER (WHERE a.status = 'ativo') AS alunos_ativos,
    count(*)                                   AS contratos_ativos
  FROM public.contratos c
  JOIN public.alunos a ON a.id = c.aluno_id
  WHERE c.status = 'ativo'
  GROUP BY 1
),
-- Dias distintos por aluno por semana, nas ultimas 12 semanas. Mesma medida
-- que frequencia_aluno() usa: duas aulas no mesmo dia sao um dia de treino.
semanal AS (
  SELECT
    c.plano_id,
    pr.aluno_id,
    date_trunc('week', pr.data) AS semana,
    count(DISTINCT pr.data)     AS dias
  FROM public.presencas pr
  JOIN public.contratos c ON c.aluno_id = pr.aluno_id AND c.status = 'ativo'
  WHERE pr.presente
    AND pr.data >= CURRENT_DATE - 84
  GROUP BY 1, 2, 3
),
observado AS (
  SELECT
    plano_id,
    count(DISTINCT aluno_id)                                   AS alunos_com_presenca,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY dias)::numeric AS mediana
  FROM semanal
  GROUP BY 1
),
tot AS (
  SELECT
    count(*)                                        AS planos,
    count(*) FILTER (WHERE ativo)                   AS ativos,
    count(*) FILTER (WHERE estado <> 'ok')          AS invalidos,
    count(*) FILTER (WHERE estado = 'nulo')         AS nulos,
    count(*) FILTER (WHERE estado = 'zero')         AS zeros,
    count(*) FILTER (WHERE estado = 'negativo')     AS negativos,
    count(*) FILTER (WHERE estado = 'acima_de_7')   AS acima,
    count(DISTINCT tenant_id)                       AS academias
  FROM plano_status
),
linhas AS (

  -- 0 ─ VEREDITO ────────────────────────────────────────────────────────────
  SELECT 0 AS ord, '0. VEREDITO' AS secao,
    CASE WHEN t.invalidos = 0
         THEN 'Nenhum plano com frequencia invalida'
         ELSE t.invalidos || ' plano(s) com frequencia invalida' END AS item,
    t.planos || ' planos'  AS valor,
    t.ativos || ' ativos, em ' || t.academias || ' academia(s)' AS detalhe,
    CASE WHEN t.invalidos = 0 THEN 'OK' ELSE 'CORRIGIR' END AS situacao
  FROM tot t

  -- 1 ─ PANORAMA ────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 1, '1. PANORAMA', x.item, x.valor::text, x.detalhe,
         CASE WHEN x.valor > 0 AND x.ruim THEN 'CORRIGIR' ELSE 'OK' END
  FROM tot t
  CROSS JOIN LATERAL (VALUES
    ('Com frequencia valida (1 a 7)', t.planos - t.invalidos, 'usam a meta contratada',              false),
    ('Sem frequencia (NULL)',         t.nulos,                'meta cai no historico do aluno',      true),
    ('Frequencia zero',               t.zeros,                'campo apagado na tela de planos',     true),
    ('Frequencia negativa',           t.negativos,            'origem desconhecida',                 true),
    ('Frequencia acima de 7',         t.acima,                'nao existe 8o dia na semana',         true)
  ) AS x(item, valor, detalhe, ruim)

  -- 2 ─ DISTRIBUICAO ────────────────────────────────────────────────────────
  UNION ALL
  SELECT 2, '2. DISTRIBUICAO',
    'Frequencia = ' || COALESCE(ps.freq::text, 'NULL'),
    count(*)::text || ' plano(s)',
    count(*) FILTER (WHERE ps.ativo) || ' ativo(s)'
      || CASE WHEN ps.freq = 1
              THEN ' — atencao: 1 e o valor inicial do formulario'
              ELSE '' END,
    CASE WHEN ps.freq IS NULL OR ps.freq NOT BETWEEN 1 AND 7 THEN 'CORRIGIR'
         WHEN ps.freq = 1 THEN 'CONFERIR'
         ELSE 'OK' END
  FROM plano_status ps
  GROUP BY ps.freq

  -- 3 ─ NOME DO PLANO vs COLUNA ─────────────────────────────────────────────
  -- O nome e o que foi vendido ao aluno. Quando ele diz um numero e a coluna
  -- diz outro, a coluna costuma ser a errada.
  UNION ALL
  SELECT 3, '3. NOME vs COLUNA', ps.nome,
    'nome diz ' || ps.nome_sugere || ', coluna diz ' || COALESCE(ps.freq::text, 'NULL'),
    CASE WHEN ps.ativo THEN 'plano ativo' ELSE 'plano inativo' END,
    'CONFERIR'
  FROM plano_status ps
  WHERE ps.nome_sugere IS NOT NULL
    AND ps.nome_sugere IS DISTINCT FROM ps.freq
  UNION ALL
  SELECT 3, '3. NOME vs COLUNA', '— nenhuma divergencia —',
    'nomes e colunas batem',
    'ou os nomes nao trazem numero (ex.: "Mensal", "Plus")',
    'OK'
  WHERE NOT EXISTS (
    SELECT 1 FROM plano_status ps
     WHERE ps.nome_sugere IS NOT NULL AND ps.nome_sugere IS DISTINCT FROM ps.freq
  )

  -- 4 ─ PLANOS INVALIDOS, UM A UM ───────────────────────────────────────────
  UNION ALL
  SELECT 4, '4. PLANOS INVALIDOS', ps.nome,
    COALESCE(ps.freq::text, 'NULL') || ' — ' ||
      CASE ps.estado
        WHEN 'nulo'       THEN 'nunca preenchido'
        WHEN 'zero'       THEN 'campo apagado na tela'
        WHEN 'negativo'   THEN 'valor negativo'
        WHEN 'acima_de_7' THEN 'acima de 7'
      END,
    COALESCE(u.alunos_ativos, 0) || ' aluno(s) ativo(s) dependem desta meta'
      || CASE WHEN ps.ativo THEN '' ELSE ' (plano inativo)' END,
    'CORRIGIR'
  FROM plano_status ps
  LEFT JOIN uso u ON u.plano_id = ps.id
  WHERE ps.estado <> 'ok'
  UNION ALL
  SELECT 4, '4. PLANOS INVALIDOS', '— nenhum —',
    'todos os planos tem frequencia entre 1 e 7',
    'nada a corrigir aqui',
    'OK'
  WHERE NOT EXISTS (SELECT 1 FROM plano_status WHERE estado <> 'ok')

  -- 5 ─ CADASTRADO vs OBSERVADO ─────────────────────────────────────────────
  -- A pergunta que mais importa: a meta cadastrada corresponde ao que os
  -- alunos daquele plano realmente fazem? Mostra TODO plano com pelo menos um
  -- aluno com presenca, e diz o tamanho da amostra — academia pequena nunca
  -- teria 3 alunos por plano, e a versao anterior escondia tudo por isso.
  UNION ALL
  SELECT 5, '5. CADASTRADO vs OBSERVADO', ps.nome,
    'cadastrado ' || COALESCE(ps.freq::text, 'NULL')
      || ' / observado ' || round(o.mediana, 1),
    o.alunos_com_presenca || ' aluno(s) na amostra'
      || CASE WHEN o.alunos_com_presenca < 3 THEN ' — amostra pequena, leia com cautela' ELSE '' END,
    CASE
      WHEN ps.estado <> 'ok'                            THEN 'CORRIGIR'
      WHEN o.alunos_com_presenca < 3                    THEN 'CONFERIR'
      WHEN abs(ps.freq - o.mediana) >= 2                THEN 'CONFERIR'
      ELSE 'OK'
    END
  FROM observado o
  JOIN plano_status ps ON ps.id = o.plano_id
  UNION ALL
  SELECT 5, '5. CADASTRADO vs OBSERVADO', '— sem base de comparacao —',
    'nenhum plano tem aluno com presenca nas ultimas 12 semanas',
    'sem chamada registrada nao da para comparar meta com realidade',
    'CONFERIR'
  WHERE NOT EXISTS (SELECT 1 FROM observado)

  -- 6 ─ PLANOS EM USO SEM NENHUMA PRESENCA ──────────────────────────────────
  -- Plano com aluno ativo e zero presenca em 12 semanas: ou a turma parou, ou
  -- ninguem faz a chamada dela. Nos dois casos a frequencia daqueles alunos
  -- vai sair inconclusiva na tela.
  UNION ALL
  SELECT 6, '6. PLANO SEM CHAMADA', ps.nome,
    u.alunos_ativos || ' aluno(s) ativo(s)',
    'nenhuma presenca registrada nas ultimas 12 semanas',
    'CONFERIR'
  FROM plano_status ps
  JOIN uso u ON u.plano_id = ps.id
  LEFT JOIN observado o ON o.plano_id = ps.id
  WHERE o.plano_id IS NULL AND u.alunos_ativos > 0
  UNION ALL
  SELECT 6, '6. PLANO SEM CHAMADA', '— nenhum —',
    'todo plano com aluno ativo tem presenca registrada',
    'a chamada esta sendo feita',
    'OK'
  WHERE NOT EXISTS (
    SELECT 1 FROM plano_status ps
    JOIN uso u ON u.plano_id = ps.id
    LEFT JOIN observado o ON o.plano_id = ps.id
    WHERE o.plano_id IS NULL AND u.alunos_ativos > 0
  )

  -- 7 ─ IMPACTO ─────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 7, '7. IMPACTO', 'Alunos ativos sob meta invalida',
    COALESCE(sum(u.alunos_ativos), 0)::text || ' aluno(s)',
    CASE WHEN COALESCE(sum(u.alunos_ativos), 0) > 0
         THEN 'veriam aderencia calculada sobre uma meta errada'
         ELSE 'nenhum aluno afetado' END,
    CASE WHEN COALESCE(sum(u.alunos_ativos), 0) > 0 THEN 'CORRIGIR' ELSE 'OK' END
  -- Sem fallback NOT EXISTS aqui de proposito: agregado sem GROUP BY sempre
  -- devolve uma linha, mesmo com zero linhas de entrada. O fallback duplicava.
  FROM plano_status ps
  LEFT JOIN uso u ON u.plano_id = ps.id
  WHERE ps.estado <> 'ok'

  -- 8 ─ PLANOS SEM CONTRATO ATIVO ───────────────────────────────────────────
  -- Nao e problema: so contexto. Plano sem ninguem pode ter frequencia
  -- errada sem afetar tela nenhuma, e nao vale a pena corrigir com pressa.
  UNION ALL
  SELECT 8, '8. CONTEXTO', 'Planos sem contrato ativo',
    count(*)::text || ' de ' || (SELECT planos FROM tot),
    'frequencia errada neles nao afeta nenhum aluno hoje',
    'OK'
  FROM plano_status ps
  LEFT JOIN uso u ON u.plano_id = ps.id
  WHERE COALESCE(u.contratos_ativos, 0) = 0
)
SELECT
  secao      AS "Seção",
  item       AS "Item",
  valor      AS "Valor",
  detalhe    AS "Detalhe",
  situacao   AS "Situação"
FROM linhas
ORDER BY ord, (situacao = 'OK'), item;

-- ============================================================================
-- O QUE FAZER COM O RESULTADO — nenhuma linha deste arquivo altera dados
--
-- Tudo OK
--   A meta dos planos e confiavel. A frequencia na tela do aluno esta sendo
--   calculada sobre o numero que a academia realmente vendeu. Nada a fazer.
--
-- CORRIGIR — frequencia NULL, zero, negativa ou acima de 7
--   Corrija pela tela de Planos, um a um. A seção 3 (nome do plano) e a seção
--   5 (o que os alunos realmente fazem) dizem qual e o numero certo. Nao
--   chute: meta errada e pior que meta ausente, porque frequencia_aluno() sabe
--   cair no historico do aluno quando a coluna e nula, e nao sabe desconfiar de
--   um numero plausivel e errado.
--
-- CONFERIR — nome do plano diverge da coluna
--   O nome e o que foi vendido. Se "Plano 3x" tem coluna 2, quase sempre a
--   coluna esta errada.
--
-- CONFERIR — cadastrado diverge do observado em 2 ou mais
--   Ou a meta esta errada, ou a turma inteira daquele plano mudou de habito.
--   Amostra pequena (menos de 3 alunos) nao sustenta conclusao sozinha.
--
-- CONFERIR — plano com aluno ativo e sem nenhuma presenca
--   A frequencia desses alunos vai aparecer como "dados inconclusivos" na
--   tela, que e o comportamento correto: sem chamada registrada nao da para
--   afirmar que alguem faltou. Vale checar se a chamada daquela turma parou.
--
-- Se, e somente se, a seção 4 vier "— nenhum —", vale travar a coluna para o
-- problema nao voltar:
--
--   ALTER TABLE public.planos
--     ADD CONSTRAINT planos_frequencia_semanal_valida
--     CHECK (frequencia_semanal IS NULL OR frequencia_semanal BETWEEN 1 AND 7);
--
-- Nao aplique essa constraint com a seção 4 ainda listando planos: ela passaria
-- a barrar QUALQUER edicao dos planos legados, inclusive mudar so o preco.
-- ============================================================================
