-- ============================================================================
-- DIAGNÓSTICO: planos.frequencia_semanal
--
-- SOMENTE LEITURA. Nenhum comando deste arquivo altera dado nenhum.
-- Rode no SQL Editor do Supabase, como service_role, e leia as sete seções.
--
-- POR QUE ISTO EXISTE
--
-- `frequencia_semanal` é a meta que frequencia_aluno() usa como denominador.
-- Se ela estiver errada no banco, a matemática correta produz números errados:
-- um plano gravado como 1x/semana faz um aluno de 3x aparecer com 300% de
-- aderência, e um plano gravado como 5x faz o mesmo aluno aparecer com 60%.
--
-- A coluna é `integer NULL` sem CHECK. Até esta branch, `planoSchema` também
-- não a validava, e a tela de planos gravava `Number("") = 0` quando o admin
-- apagava o campo — 0 é um valor plenamente alcançável em bases existentes.
--
-- COMO LER O RESULTADO
--
-- Seções 1 a 4 são contagem: quantos planos estão em cada estado.
-- Seção 5 lista os planos problemáticos, um a um, para decisão caso a caso.
-- Seção 6 é a pergunta que interessa de verdade: a frequência cadastrada
--   corresponde ao que os alunos daquele plano realmente fazem?
-- Seção 7 mostra o impacto: quantos alunos dependem de cada meta suspeita.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Panorama
-- ---------------------------------------------------------------------------
SELECT
  '1. PANORAMA' AS secao,
  count(*)                                                        AS planos_total,
  count(*) FILTER (WHERE ativo)                                   AS ativos,
  count(*) FILTER (WHERE frequencia_semanal IS NOT NULL)          AS com_frequencia,
  count(*) FILTER (WHERE frequencia_semanal IS NULL)              AS nulos,
  count(*) FILTER (WHERE frequencia_semanal = 0)                  AS zeros,
  count(*) FILTER (WHERE frequencia_semanal < 0)                  AS negativos,
  count(*) FILTER (WHERE frequencia_semanal > 7)                  AS acima_de_7,
  count(*) FILTER (WHERE frequencia_semanal BETWEEN 1 AND 7)      AS validos
FROM public.planos;

-- ---------------------------------------------------------------------------
-- 2. Distribuição dos valores
--
-- Uma concentração em 1 é o sinal de que o campo nasceu com o default da tela
-- e nunca foi preenchido de verdade — o formulário abre com "1".
-- ---------------------------------------------------------------------------
SELECT
  '2. DISTRIBUICAO' AS secao,
  COALESCE(frequencia_semanal::text, '(null)') AS frequencia,
  count(*)                                     AS planos,
  count(*) FILTER (WHERE ativo)                AS ativos,
  round(100.0 * count(*) / NULLIF(sum(count(*)) OVER (), 0), 1) AS pct
FROM public.planos
GROUP BY frequencia_semanal
ORDER BY frequencia_semanal NULLS LAST;

-- ---------------------------------------------------------------------------
-- 3. Convenção por época de cadastro
--
-- Planos antigos podem seguir outra convenção (ou nenhuma). Se os mais velhos
-- forem todos NULL ou todos 1, a coluna entrou depois e nunca foi preenchida
-- retroativamente.
-- ---------------------------------------------------------------------------
SELECT
  '3. POR EPOCA' AS secao,
  date_trunc('month', created_at)::date         AS mes_cadastro,
  count(*)                                      AS planos,
  count(*) FILTER (WHERE frequencia_semanal IS NULL) AS nulos,
  count(*) FILTER (WHERE frequencia_semanal = 1)     AS iguais_a_1,
  count(*) FILTER (WHERE frequencia_semanal BETWEEN 2 AND 7) AS de_2_a_7,
  count(*) FILTER (WHERE COALESCE(frequencia_semanal, 0) <= 0) AS invalidos
FROM public.planos
GROUP BY 2
ORDER BY 2;

-- ---------------------------------------------------------------------------
-- 4. O nome do plano contradiz o número?
--
-- Quase todo plano de academia carrega a frequência no nome ("2x semana",
-- "3 vezes"). Quando o nome diz um número e a coluna diz outro, a coluna é
-- quase sempre a errada — o nome é o que foi vendido ao aluno.
-- ---------------------------------------------------------------------------
SELECT
  '4. NOME vs COLUNA' AS secao,
  p.id,
  p.nome,
  p.frequencia_semanal                       AS coluna,
  (regexp_match(p.nome, '(\d)\s*(?:x|vez)', 'i'))[1]::int AS sugerido_pelo_nome,
  p.ativo
FROM public.planos p
WHERE (regexp_match(p.nome, '(\d)\s*(?:x|vez)', 'i'))[1] IS NOT NULL
  AND (regexp_match(p.nome, '(\d)\s*(?:x|vez)', 'i'))[1]::int
      IS DISTINCT FROM p.frequencia_semanal
ORDER BY p.ativo DESC, p.nome;

-- ---------------------------------------------------------------------------
-- 5. Planos com valor inválido, um a um
--
-- Estes são os que frequencia_aluno() trata como "não informado": a meta cai
-- no histórico do próprio aluno, ou em 1 quando não há histórico. A função não
-- quebra — mas a meta deixa de ser a contratada.
-- ---------------------------------------------------------------------------
SELECT
  '5. INVALIDOS' AS secao,
  p.id,
  p.tenant_id,
  p.nome,
  p.frequencia_semanal,
  CASE
    WHEN p.frequencia_semanal IS NULL THEN 'nunca preenchido'
    WHEN p.frequencia_semanal = 0     THEN 'zero — campo apagado na tela'
    WHEN p.frequencia_semanal < 0     THEN 'negativo — origem desconhecida'
    WHEN p.frequencia_semanal > 7     THEN 'acima de 7 — nao existe 8o dia na semana'
  END AS diagnostico,
  p.ativo,
  p.created_at::date AS criado_em
FROM public.planos p
WHERE p.frequencia_semanal IS NULL OR p.frequencia_semanal NOT BETWEEN 1 AND 7
ORDER BY p.ativo DESC, p.created_at;

-- ---------------------------------------------------------------------------
-- 6. A meta cadastrada bate com o comportamento observado?
--
-- Para cada plano, compara a frequência contratada com a mediana de dias
-- distintos por semana que os alunos daquele plano realmente treinaram nas
-- últimas 12 semanas. Só considera planos com pelo menos 3 alunos e alunos com
-- alguma presença, para a mediana significar algo.
--
-- Divergência de 1 é normal (ninguém cumpre o plano exatamente). Divergência
-- de 2 ou mais, com vários alunos, indica que a coluna está errada.
-- ---------------------------------------------------------------------------
WITH semanal AS (
  SELECT
    c.plano_id,
    p.aluno_id,
    date_trunc('week', p.data) AS semana,
    count(DISTINCT p.data)     AS dias
  FROM public.presencas p
  JOIN public.contratos c ON c.aluno_id = p.aluno_id AND c.status = 'ativo'
  WHERE p.presente
    AND p.data >= CURRENT_DATE - 84
  GROUP BY 1, 2, 3
),
por_plano AS (
  SELECT
    plano_id,
    count(DISTINCT aluno_id) AS alunos_com_presenca,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY dias)::numeric AS mediana_observada
  FROM semanal
  GROUP BY 1
)
SELECT
  '6. CADASTRADO vs OBSERVADO' AS secao,
  pl.nome,
  pl.frequencia_semanal                     AS cadastrado,
  round(pp.mediana_observada, 1)            AS observado_mediana,
  pp.alunos_com_presenca,
  CASE
    WHEN pl.frequencia_semanal IS NULL OR pl.frequencia_semanal NOT BETWEEN 1 AND 7
      THEN 'coluna invalida — corrigir primeiro'
    WHEN abs(pl.frequencia_semanal - pp.mediana_observada) >= 2
      THEN 'DIVERGE — conferir o que foi vendido'
    WHEN abs(pl.frequencia_semanal - pp.mediana_observada) >= 1
      THEN 'diferenca de 1 — dentro do esperado'
    ELSE 'coerente'
  END AS leitura
FROM por_plano pp
JOIN public.planos pl ON pl.id = pp.plano_id
WHERE pp.alunos_com_presenca >= 3
ORDER BY
  CASE WHEN pl.frequencia_semanal IS NULL OR pl.frequencia_semanal NOT BETWEEN 1 AND 7 THEN 0
       ELSE 1 END,
  abs(COALESCE(pl.frequencia_semanal, 0) - pp.mediana_observada) DESC;

-- ---------------------------------------------------------------------------
-- 7. Impacto: quantos alunos dependem de cada meta suspeita
--
-- Prioriza a correção. Um plano inválido com 40 alunos ativos importa muito
-- mais que um inválido e desativado sem ninguém.
-- ---------------------------------------------------------------------------
SELECT
  '7. IMPACTO' AS secao,
  pl.nome,
  pl.frequencia_semanal,
  pl.ativo                                          AS plano_ativo,
  count(*) FILTER (WHERE c.status = 'ativo')        AS contratos_ativos,
  count(*) FILTER (WHERE a.status = 'ativo')        AS alunos_ativos
FROM public.planos pl
LEFT JOIN public.contratos c ON c.plano_id = pl.id
LEFT JOIN public.alunos a    ON a.id = c.aluno_id
WHERE pl.frequencia_semanal IS NULL OR pl.frequencia_semanal NOT BETWEEN 1 AND 7
GROUP BY pl.id, pl.nome, pl.frequencia_semanal, pl.ativo
ORDER BY count(*) FILTER (WHERE a.status = 'ativo') DESC;

-- ============================================================================
-- O QUE FAZER COM O RESULTADO — nenhuma destas linhas roda sozinha
--
-- NULL, plano ativo com alunos
--   Preencher pela tela de Planos, um a um. O nome do plano (seção 4) e a
--   mediana observada (seção 6) dizem qual é o número certo. Não chutar: a
--   meta errada é pior que meta ausente, porque frequencia_aluno() sabe cair
--   no histórico do aluno quando a coluna é nula, e não sabe desconfiar de um
--   número plausível e errado.
--
-- NULL, plano inativo e sem contrato ativo
--   Deixar como está. Não afeta nenhuma leitura.
--
-- 0 ou negativo
--   Era o bug da tela (Number("") = 0), corrigido nesta branch em
--   src/lib/validators.ts e src/routes/_app/planos.tsx. Tratar como NULL:
--   preencher pela tela com o valor correto.
--
-- Acima de 7
--   Provavelmente confusão com dias do mês ou com o total de aulas. Conferir o
--   nome do plano e corrigir pela tela.
--
-- Se, e somente se, a seção 5 vier VAZIA depois das correções, vale travar a
-- coluna para o problema não voltar:
--
--   ALTER TABLE public.planos
--     ADD CONSTRAINT planos_frequencia_semanal_valida
--     CHECK (frequencia_semanal IS NULL OR frequencia_semanal BETWEEN 1 AND 7);
--
-- Não aplique essa constraint com a seção 5 ainda populada: ela passaria a
-- barrar QUALQUER edição dos planos legados, inclusive mudar só o preço.
-- ============================================================================
