-- ============================================================================
-- DIAGNOSTICO: planos.frequencia_semanal
--
-- SOMENTE LEITURA. Nenhum comando deste arquivo altera dado nenhum.
--
-- COMO RODAR
--
-- Cole o arquivo inteiro no SQL Editor do Supabase e execute. E UMA consulta
-- so: o editor mostra o resultado de um unico statement, entao varios SELECTs
-- separados exibiriam apenas um deles.
--
-- Toda secao SEMPRE comeca por uma linha de resumo, calculada por agregado.
-- Agregado sem GROUP BY devolve uma linha mesmo sobre zero linhas de entrada,
-- entao nenhuma secao pode sumir. Quando nao ha problema, a linha diz isso com
-- todas as letras: silencio nunca significa "nao rodou".
--
-- POR QUE ISTO EXISTE
--
-- `frequencia_semanal` e a meta que frequencia_aluno() usa como denominador.
-- Se ela estiver errada no banco, a matematica correta produz numeros errados:
-- um plano gravado como 1x/semana faz um aluno de 3x aparecer com 300% de
-- aderencia, e um plano gravado como 5x faz o mesmo aluno aparecer com 60%.
--
-- A coluna e `integer NULL` sem CHECK. Ate a branch da frequencia o
-- `planoSchema` tambem nao a validava, e a tela de planos gravava
-- `Number("") = 0` quando o admin apagava o campo — 0 e um valor plenamente
-- alcancavel em bases existentes.
--
-- COMO LER A COLUNA `Situacao`
--
--   OK          nada a fazer
--   CONFERIR    pode estar certo, vale um olhar
--   CORRIGIR    a meta esta invalida e a frequencia do aluno sai errada
--
-- O guia abaixo explica o que fazer com cada caso.
--
-- O QUE FAZER COM O RESULTADO
--
-- Tudo OK
--   A meta dos planos e confiavel. A frequencia na tela do aluno esta sendo
--   calculada sobre o numero que a academia realmente vendeu. Nada a fazer.
--
-- CORRIGIR - frequencia NULL, zero, negativa ou acima de 7
--   Corrija pela tela de Planos, um a um. A secao 3 (nome do plano) e a secao
--   5 (o que os alunos realmente fazem) dizem qual e o numero certo. Nao
--   chute: meta errada e pior que meta ausente, porque frequencia_aluno() sabe
--   cair no historico do aluno quando a coluna e nula, e nao sabe desconfiar
--   de um numero plausivel e errado.
--
-- CONFERIR - frequencia igual a 1
--   Pode ser um plano 1x/semana legitimo, ou o campo que ninguem preencheu: 1
--   e o valor com que o formulario abre. As secoes 3 e 5 resolvem a duvida.
--
-- CONFERIR - nome do plano diverge da coluna
--   O nome e o que foi vendido. Se "Plano 3x" tem coluna 2, quase sempre a
--   coluna esta errada.
--
-- CONFERIR - cadastrado diverge do observado em 2 ou mais
--   Ou a meta esta errada, ou a turma daquele plano mudou de habito. Amostra
--   pequena (menos de 3 alunos) nao sustenta conclusao sozinha.
--
-- CONFERIR - plano com aluno ativo e sem nenhuma presenca
--   A frequencia desses alunos aparece como "dados insuficientes" na tela, que
--   e o comportamento correto: sem chamada registrada nao da para afirmar que
--   alguem faltou. Vale checar se a chamada daquela turma parou.
--
-- DEPOIS DE CORRIGIR TUDO
--   Se, e somente se, a secao 4 vier "Nenhum plano invalido", vale travar a
--   coluna com um CHECK constraint em planos.frequencia_semanal aceitando NULL
--   ou valores de 1 a 7. O comando esta em supabase/testes/LEIA-ME.md, fora
--   deste arquivo de proposito: script de diagnostico nao carrega DDL nem
--   ponto e virgula solto, para nenhum editor conseguir executar por engano o
--   que deveria ser so uma sugestao.
--
--   Nao aplique esse CHECK com a secao 4 ainda listando planos: ele passaria a
--   barrar QUALQUER edicao dos planos legados, inclusive mudar so o preco.
-- ============================================================================

WITH plano_status AS (
  SELECT
    p.id,
    p.tenant_id,
    p.nome,
    p.ativo,
    p.frequencia_semanal AS freq,
    CASE
      WHEN p.frequencia_semanal IS NULL THEN 'nulo'
      WHEN p.frequencia_semanal = 0     THEN 'zero'
      WHEN p.frequencia_semanal < 0     THEN 'negativo'
      WHEN p.frequencia_semanal > 7     THEN 'acima_de_7'
      ELSE 'ok'
    END AS estado,
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
  GROUP BY c.plano_id
),
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
  GROUP BY c.plano_id, pr.aluno_id, date_trunc('week', pr.data)
),
observado AS (
  SELECT
    plano_id,
    count(DISTINCT aluno_id)                                   AS alunos_com_presenca,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY dias)::numeric AS mediana
  FROM semanal
  GROUP BY plano_id
),
linhas AS (

  -- 0. VEREDITO
  SELECT
    0 AS ord,
    '0. VEREDITO' AS secao,
    CASE WHEN count(*) FILTER (WHERE estado <> 'ok') = 0
         THEN 'Nenhum plano com frequencia invalida'
         ELSE count(*) FILTER (WHERE estado <> 'ok') || ' plano(s) com frequencia invalida'
    END AS item,
    count(*) || ' planos' AS valor,
    count(*) FILTER (WHERE ativo) || ' ativos, em '
      || count(DISTINCT tenant_id) || ' academia(s)' AS detalhe,
    CASE WHEN count(*) FILTER (WHERE estado <> 'ok') = 0 THEN 'OK' ELSE 'CORRIGIR' END AS situacao
  FROM plano_status

  -- 1. PANORAMA — uma linha por estado, todas por agregado
  UNION ALL
  SELECT 1, '1. PANORAMA', 'Com frequencia valida (1 a 7)',
    count(*) FILTER (WHERE estado = 'ok') || ' plano(s)',
    'usam a meta contratada', 'OK'
  FROM plano_status

  UNION ALL
  SELECT 1, '1. PANORAMA', 'Sem frequencia (NULL)',
    count(*) FILTER (WHERE estado = 'nulo') || ' plano(s)',
    'meta cai no historico do proprio aluno',
    CASE WHEN count(*) FILTER (WHERE estado = 'nulo') > 0 THEN 'CORRIGIR' ELSE 'OK' END
  FROM plano_status

  UNION ALL
  SELECT 1, '1. PANORAMA', 'Frequencia zero',
    count(*) FILTER (WHERE estado = 'zero') || ' plano(s)',
    'campo apagado na tela de planos',
    CASE WHEN count(*) FILTER (WHERE estado = 'zero') > 0 THEN 'CORRIGIR' ELSE 'OK' END
  FROM plano_status

  UNION ALL
  SELECT 1, '1. PANORAMA', 'Frequencia negativa',
    count(*) FILTER (WHERE estado = 'negativo') || ' plano(s)',
    'origem desconhecida',
    CASE WHEN count(*) FILTER (WHERE estado = 'negativo') > 0 THEN 'CORRIGIR' ELSE 'OK' END
  FROM plano_status

  UNION ALL
  SELECT 1, '1. PANORAMA', 'Frequencia acima de 7',
    count(*) FILTER (WHERE estado = 'acima_de_7') || ' plano(s)',
    'nao existe 8o dia na semana',
    CASE WHEN count(*) FILTER (WHERE estado = 'acima_de_7') > 0 THEN 'CORRIGIR' ELSE 'OK' END
  FROM plano_status

  -- 2. DISTRIBUICAO — uma linha por valor distinto
  UNION ALL
  SELECT 2, '2. DISTRIBUICAO',
    'Frequencia = ' || COALESCE(freq::text, 'NULL'),
    count(*) || ' plano(s)',
    count(*) FILTER (WHERE ativo) || ' ativo(s)'
      || CASE WHEN freq = 1 THEN ' - atencao: 1 e o valor inicial do formulario' ELSE '' END,
    CASE
      WHEN freq IS NULL OR freq NOT BETWEEN 1 AND 7 THEN 'CORRIGIR'
      WHEN freq = 1 THEN 'CONFERIR'
      ELSE 'OK'
    END
  FROM plano_status
  GROUP BY freq

  -- 3. NOME vs COLUNA — resumo (sempre presente) + detalhe
  UNION ALL
  SELECT 3, '3. NOME vs COLUNA',
    CASE WHEN count(*) = 0
         THEN 'Nenhuma divergencia entre nome e coluna'
         ELSE count(*) || ' plano(s) com nome divergente'
    END,
    count(*) || ' de ' || (SELECT count(*) FROM plano_status) || ' planos',
    'o nome e o que foi vendido ao aluno',
    CASE WHEN count(*) = 0 THEN 'OK' ELSE 'CONFERIR' END
  FROM plano_status
  WHERE nome_sugere IS NOT NULL AND nome_sugere IS DISTINCT FROM freq

  UNION ALL
  SELECT 3, '3. NOME vs COLUNA', nome,
    'nome diz ' || nome_sugere || ', coluna diz ' || COALESCE(freq::text, 'NULL'),
    CASE WHEN ativo THEN 'plano ativo' ELSE 'plano inativo' END,
    'CONFERIR'
  FROM plano_status
  WHERE nome_sugere IS NOT NULL AND nome_sugere IS DISTINCT FROM freq

  -- 4. PLANOS INVALIDOS — resumo (sempre presente) + detalhe
  UNION ALL
  SELECT 4, '4. PLANOS INVALIDOS',
    CASE WHEN count(*) = 0
         THEN 'Nenhum plano invalido'
         ELSE count(*) || ' plano(s) precisam de correcao'
    END,
    count(*) || ' plano(s)',
    'frequencia fora de 1 a 7, ou nao preenchida',
    CASE WHEN count(*) = 0 THEN 'OK' ELSE 'CORRIGIR' END
  FROM plano_status
  WHERE estado <> 'ok'

  UNION ALL
  SELECT 4, '4. PLANOS INVALIDOS', ps.nome,
    COALESCE(ps.freq::text, 'NULL') || ' - ' ||
      CASE ps.estado
        WHEN 'nulo'       THEN 'nunca preenchido'
        WHEN 'zero'       THEN 'campo apagado na tela'
        WHEN 'negativo'   THEN 'valor negativo'
        WHEN 'acima_de_7' THEN 'acima de 7'
        ELSE ps.estado
      END,
    COALESCE(u.alunos_ativos, 0) || ' aluno(s) ativo(s) dependem desta meta'
      || CASE WHEN ps.ativo THEN '' ELSE ' (plano inativo)' END,
    'CORRIGIR'
  FROM plano_status ps
  LEFT JOIN uso u ON u.plano_id = ps.id
  WHERE ps.estado <> 'ok'

  -- 5. CADASTRADO vs OBSERVADO — resumo (sempre presente) + detalhe
  --
  -- Compara a meta contratada com a mediana de dias distintos por semana que
  -- os alunos daquele plano realmente treinaram nas ultimas 12 semanas.
  UNION ALL
  SELECT 5, '5. CADASTRADO vs OBSERVADO',
    CASE WHEN count(*) = 0
         THEN 'Sem base de comparacao'
         ELSE count(*) || ' plano(s) com alunos treinando'
    END,
    count(*) || ' plano(s) na comparacao',
    CASE WHEN count(*) = 0
         THEN 'nenhuma presenca registrada nas ultimas 12 semanas'
         ELSE 'meta contratada x mediana observada'
    END,
    CASE WHEN count(*) = 0 THEN 'CONFERIR' ELSE 'OK' END
  FROM observado

  UNION ALL
  SELECT 5, '5. CADASTRADO vs OBSERVADO', ps.nome,
    'cadastrado ' || COALESCE(ps.freq::text, 'NULL')
      || ' / observado ' || round(o.mediana, 1),
    o.alunos_com_presenca || ' aluno(s) na amostra'
      || CASE WHEN o.alunos_com_presenca < 3 THEN ' - amostra pequena, leia com cautela' ELSE '' END,
    CASE
      WHEN ps.estado <> 'ok'                 THEN 'CORRIGIR'
      WHEN o.alunos_com_presenca < 3         THEN 'CONFERIR'
      WHEN abs(ps.freq - o.mediana) >= 2     THEN 'CONFERIR'
      ELSE 'OK'
    END
  FROM observado o
  JOIN plano_status ps ON ps.id = o.plano_id

  -- 6. PLANO SEM CHAMADA — resumo (sempre presente) + detalhe
  --
  -- Plano com aluno ativo e zero presenca em 12 semanas: ou a turma parou, ou
  -- ninguem faz a chamada dela. Nos dois casos a frequencia daqueles alunos
  -- sai inconclusiva na tela, que e o comportamento correto.
  UNION ALL
  SELECT 6, '6. PLANO SEM CHAMADA',
    CASE WHEN count(*) = 0
         THEN 'Todo plano com aluno ativo tem presenca'
         ELSE count(*) || ' plano(s) sem nenhuma presenca'
    END,
    count(*) || ' plano(s)',
    'com aluno ativo e zero chamada em 12 semanas',
    CASE WHEN count(*) = 0 THEN 'OK' ELSE 'CONFERIR' END
  FROM plano_status ps
  JOIN uso u ON u.plano_id = ps.id
  LEFT JOIN observado o ON o.plano_id = ps.id
  WHERE o.plano_id IS NULL AND u.alunos_ativos > 0

  UNION ALL
  SELECT 6, '6. PLANO SEM CHAMADA', ps.nome,
    u.alunos_ativos || ' aluno(s) ativo(s)',
    'nenhuma presenca registrada nas ultimas 12 semanas',
    'CONFERIR'
  FROM plano_status ps
  JOIN uso u ON u.plano_id = ps.id
  LEFT JOIN observado o ON o.plano_id = ps.id
  WHERE o.plano_id IS NULL AND u.alunos_ativos > 0

  -- 7. IMPACTO
  UNION ALL
  SELECT 7, '7. IMPACTO', 'Alunos ativos sob meta invalida',
    COALESCE(sum(u.alunos_ativos), 0) || ' aluno(s)',
    CASE WHEN COALESCE(sum(u.alunos_ativos), 0) > 0
         THEN 'veriam aderencia calculada sobre uma meta errada'
         ELSE 'nenhum aluno afetado'
    END,
    CASE WHEN COALESCE(sum(u.alunos_ativos), 0) > 0 THEN 'CORRIGIR' ELSE 'OK' END
  FROM plano_status ps
  LEFT JOIN uso u ON u.plano_id = ps.id
  WHERE ps.estado <> 'ok'

  -- 8. CONTEXTO
  UNION ALL
  SELECT 8, '8. CONTEXTO', 'Planos sem contrato ativo',
    count(*) || ' de ' || (SELECT count(*) FROM plano_status) || ' planos',
    'frequencia errada neles nao afeta nenhum aluno hoje',
    'OK'
  FROM plano_status ps
  LEFT JOIN uso u ON u.plano_id = ps.id
  WHERE COALESCE(u.contratos_ativos, 0) = 0
)
SELECT
  secao    AS "Secao",
  item     AS "Item",
  valor    AS "Valor",
  detalhe  AS "Detalhe",
  situacao AS "Situacao"
FROM linhas
ORDER BY ord, (situacao = 'OK'), item;
