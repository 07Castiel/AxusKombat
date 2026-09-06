-- Diagnóstico de planos.frequencia_semanal como função, não como script.
--
-- POR QUE UMA FUNÇÃO
--
-- O relatório existia como um arquivo .sql para colar no editor. Não funciona:
-- o editor SQL da Lovable quebra scripts longos em pedaços e envia cada um
-- separado. Com a consulta em CTEs, ele mandou um fragmento começando em
-- `FROM public.contratos c` e o Postgres respondeu
-- `syntax error at or near "FROM" LINE 1`. Antes disso, na versão em sete
-- SELECTs, ele exibia o resultado de um só e escondia os outros seis.
--
-- Nenhuma reescrita de sintaxe resolve isso, porque o problema não é a SQL.
-- Como função, o usuário roda uma linha — `select * from
-- diagnostico_frequencia_semanal()` — e não há o que quebrar.
--
-- SOMENTE LEITURA. A função não escreve nada, e é STABLE.
--
-- POR QUE ISTO EXISTE
--
-- `frequencia_semanal` é a meta que frequencia_aluno() usa como denominador.
-- Se ela estiver errada no banco, a matemática correta produz números errados:
-- um plano gravado como 1x/semana faz um aluno de 3x aparecer com 300% de
-- aderência, e um plano gravado como 5x faz o mesmo aluno aparecer com 60%.
--
-- A coluna é `integer NULL` sem CHECK. Até a branch da frequência o
-- `planoSchema` também não a validava, e a tela de planos gravava
-- `Number("") = 0` quando o admin apagava o campo — 0 é plenamente alcançável
-- em bases existentes.
--
-- NÃO É SECURITY DEFINER. Rodando no editor SQL (postgres/service_role) o RLS
-- não se aplica e o relatório cobre todas as academias do banco; chamada por um
-- usuário autenticado, o RLS recorta para a academia dele. Os dois usos são
-- legítimos, e a coluna `detalhe` do veredito informa quantas academias
-- entraram na conta.

BEGIN;

CREATE OR REPLACE FUNCTION public.diagnostico_frequencia_semanal()
RETURNS TABLE (
  secao    text,
  item     text,
  valor    text,
  detalhe  text,
  situacao text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
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
    GROUP BY c.plano_id
  ),
  -- Dias distintos por aluno por semana nas últimas 12 semanas: a mesma medida
  -- que frequencia_aluno() usa, em que duas aulas no mesmo dia são um dia.
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
      s.plano_id,
      count(DISTINCT s.aluno_id)                                   AS alunos_com_presenca,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.dias)::numeric AS mediana
    FROM semanal s
    GROUP BY s.plano_id
  ),
  linhas AS (

    -- 0. VEREDITO
    SELECT
      0 AS ord,
      '0. VEREDITO' AS secao,
      CASE WHEN count(*) FILTER (WHERE ps.estado <> 'ok') = 0
           THEN 'Nenhum plano com frequencia invalida'
           ELSE count(*) FILTER (WHERE ps.estado <> 'ok') || ' plano(s) com frequencia invalida'
      END AS item,
      count(*) || ' planos' AS valor,
      count(*) FILTER (WHERE ps.ativo) || ' ativos, em '
        || count(DISTINCT ps.tenant_id) || ' academia(s)' AS detalhe,
      CASE WHEN count(*) FILTER (WHERE ps.estado <> 'ok') = 0
           THEN 'OK' ELSE 'CORRIGIR' END AS situacao
    FROM plano_status ps

    -- 1. PANORAMA — uma linha por estado, todas por agregado, então nenhuma some
    UNION ALL
    SELECT 1, '1. PANORAMA', 'Com frequencia valida (1 a 7)',
      count(*) FILTER (WHERE ps.estado = 'ok') || ' plano(s)',
      'usam a meta contratada', 'OK'
    FROM plano_status ps

    UNION ALL
    SELECT 1, '1. PANORAMA', 'Sem frequencia (NULL)',
      count(*) FILTER (WHERE ps.estado = 'nulo') || ' plano(s)',
      'meta cai no historico do proprio aluno',
      CASE WHEN count(*) FILTER (WHERE ps.estado = 'nulo') > 0 THEN 'CORRIGIR' ELSE 'OK' END
    FROM plano_status ps

    UNION ALL
    SELECT 1, '1. PANORAMA', 'Frequencia zero',
      count(*) FILTER (WHERE ps.estado = 'zero') || ' plano(s)',
      'campo apagado na tela de planos',
      CASE WHEN count(*) FILTER (WHERE ps.estado = 'zero') > 0 THEN 'CORRIGIR' ELSE 'OK' END
    FROM plano_status ps

    UNION ALL
    SELECT 1, '1. PANORAMA', 'Frequencia negativa',
      count(*) FILTER (WHERE ps.estado = 'negativo') || ' plano(s)',
      'origem desconhecida',
      CASE WHEN count(*) FILTER (WHERE ps.estado = 'negativo') > 0 THEN 'CORRIGIR' ELSE 'OK' END
    FROM plano_status ps

    UNION ALL
    SELECT 1, '1. PANORAMA', 'Frequencia acima de 7',
      count(*) FILTER (WHERE ps.estado = 'acima_de_7') || ' plano(s)',
      'nao existe 8o dia na semana',
      CASE WHEN count(*) FILTER (WHERE ps.estado = 'acima_de_7') > 0 THEN 'CORRIGIR' ELSE 'OK' END
    FROM plano_status ps

    -- 2. DISTRIBUICAO
    UNION ALL
    SELECT 2, '2. DISTRIBUICAO',
      'Frequencia = ' || COALESCE(ps.freq::text, 'NULL'),
      count(*) || ' plano(s)',
      count(*) FILTER (WHERE ps.ativo) || ' ativo(s)'
        || CASE WHEN ps.freq = 1
                THEN ' - atencao: 1 e o valor inicial do formulario' ELSE '' END,
      CASE
        WHEN ps.freq IS NULL OR ps.freq NOT BETWEEN 1 AND 7 THEN 'CORRIGIR'
        WHEN ps.freq = 1 THEN 'CONFERIR'
        ELSE 'OK'
      END
    FROM plano_status ps
    GROUP BY ps.freq

    -- 3. NOME DO PLANO vs COLUNA — resumo por agregado (sempre presente) + detalhe
    UNION ALL
    SELECT 3, '3. NOME vs COLUNA',
      CASE WHEN count(*) = 0
           THEN 'Nenhuma divergencia entre nome e coluna'
           ELSE count(*) || ' plano(s) com nome divergente'
      END,
      count(*) || ' plano(s)',
      'o nome do plano e o que foi vendido ao aluno',
      CASE WHEN count(*) = 0 THEN 'OK' ELSE 'CONFERIR' END
    FROM plano_status ps
    WHERE ps.nome_sugere IS NOT NULL AND ps.nome_sugere IS DISTINCT FROM ps.freq

    UNION ALL
    SELECT 3, '3. NOME vs COLUNA', ps.nome,
      'nome diz ' || ps.nome_sugere || ', coluna diz ' || COALESCE(ps.freq::text, 'NULL'),
      CASE WHEN ps.ativo THEN 'plano ativo' ELSE 'plano inativo' END,
      'CONFERIR'
    FROM plano_status ps
    WHERE ps.nome_sugere IS NOT NULL AND ps.nome_sugere IS DISTINCT FROM ps.freq

    -- 4. PLANOS INVALIDOS
    UNION ALL
    SELECT 4, '4. PLANOS INVALIDOS',
      CASE WHEN count(*) = 0
           THEN 'Nenhum plano invalido'
           ELSE count(*) || ' plano(s) precisam de correcao'
      END,
      count(*) || ' plano(s)',
      'frequencia fora de 1 a 7, ou nao preenchida',
      CASE WHEN count(*) = 0 THEN 'OK' ELSE 'CORRIGIR' END
    FROM plano_status ps
    WHERE ps.estado <> 'ok'

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

    -- 5. CADASTRADO vs OBSERVADO
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
    FROM observado o

    UNION ALL
    SELECT 5, '5. CADASTRADO vs OBSERVADO', ps.nome,
      'cadastrado ' || COALESCE(ps.freq::text, 'NULL')
        || ' / observado ' || round(o.mediana, 1),
      o.alunos_com_presenca || ' aluno(s) na amostra'
        || CASE WHEN o.alunos_com_presenca < 3
                THEN ' - amostra pequena, leia com cautela' ELSE '' END,
      CASE
        WHEN ps.estado <> 'ok'             THEN 'CORRIGIR'
        WHEN o.alunos_com_presenca < 3     THEN 'CONFERIR'
        WHEN abs(ps.freq - o.mediana) >= 2 THEN 'CONFERIR'
        ELSE 'OK'
      END
    FROM observado o
    JOIN plano_status ps ON ps.id = o.plano_id

    -- 6. PLANO COM ALUNO ATIVO E SEM NENHUMA CHAMADA
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
      count(*) || ' plano(s)',
      'frequencia errada neles nao afeta nenhum aluno hoje',
      'OK'
    FROM plano_status ps
    LEFT JOIN uso u ON u.plano_id = ps.id
    WHERE COALESCE(u.contratos_ativos, 0) = 0
  )
  SELECT l.secao, l.item, l.valor, l.detalhe, l.situacao
  FROM linhas l
  ORDER BY l.ord, (l.situacao = 'OK'), l.item;
$$;

COMMENT ON FUNCTION public.diagnostico_frequencia_semanal() IS
  'Diagnostico somente-leitura de planos.frequencia_semanal, a meta que '
  'frequencia_aluno() usa como denominador. Rode com '
  'select * from diagnostico_frequencia_semanal()';

REVOKE EXECUTE ON FUNCTION public.diagnostico_frequencia_semanal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.diagnostico_frequencia_semanal() TO authenticated, service_role;

COMMIT;
