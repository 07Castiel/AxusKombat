\echo '### ITEM 10 — risco_evasao'
\set ADM '''11111111-0000-0000-0000-000000000001'''

BEGIN;

-- Cenario de pagamento. O fixture nasceu para a frequencia e nao tinha
-- mensalidade nenhuma: sem isso o risco e NULL para todo mundo, que e o
-- comportamento certo mas nao exercita nada.
INSERT INTO mensalidades (tenant_id, contrato_id, aluno_id, competencia,
                          data_vencimento, valor, status, data_pagamento)
SELECT a.tenant_id, c.id, c.aluno_id,
       date_trunc('month', CURRENT_DATE - (k || ' month')::interval)::date,
       (CURRENT_DATE - (k * 30) - 5)::date,
       100, x.st::status_mensalidade, x.pg
  FROM contratos c
  JOIN alunos a ON a.id = c.aluno_id
  CROSS JOIN LATERAL (VALUES
    -- k, status, data_pagamento
    (0, CASE WHEN a.nome_completo LIKE '01 %' THEN 'pago'
             WHEN a.nome_completo LIKE '02 %' THEN 'vencido'   -- 5 dias
             WHEN a.nome_completo LIKE '03 %' THEN 'pendente'  -- 5 dias, job nao rodou
             WHEN a.nome_completo LIKE '06 %' THEN 'vencido'
             ELSE 'pago' END,
        CASE WHEN a.nome_completo LIKE '01 %' THEN (CURRENT_DATE - 5)::date ELSE NULL END),
    (1, CASE WHEN a.nome_completo LIKE '06 %' THEN 'vencido' ELSE 'pago' END,
        CASE WHEN a.nome_completo LIKE '06 %' THEN NULL
             WHEN a.nome_completo LIKE '07 %' THEN (CURRENT_DATE - 25)::date  -- atrasado
             ELSE (CURRENT_DATE - 35)::date END),
    (2, CASE WHEN a.nome_completo LIKE '06 %' THEN 'vencido' ELSE 'pago' END,
        CASE WHEN a.nome_completo LIKE '06 %' THEN NULL
             WHEN a.nome_completo LIKE '07 %' THEN (CURRENT_DATE - 55)::date  -- atrasado
             ELSE (CURRENT_DATE - 65)::date END),
    (3, 'pago', CASE WHEN a.nome_completo LIKE '07 %' THEN (CURRENT_DATE - 85)::date
                     ELSE (CURRENT_DATE - 95)::date END)
  ) x(k, st, pg)
 WHERE c.status IN ('ativo','pausado')
   AND a.nome_completo ~ '^(01|02|03|06|07) ';

\echo '-- seed conferido: mensalidades inseridas'
SELECT t_ok('10.0 o cenario de pagamento entrou',
  count(*) >= 20, count(*) || ' mensalidades') FROM mensalidades;

SET request.jwt.claim.sub = :ADM; SET ROLE authenticated;

\echo '-- 10.1 NULL nao e zero: sem sinal de comportamento nao ha nota'
SELECT t_ok('10.1 aluno matriculado hoje sem contrato NAO recebe nota',
  (e->>'risco') IS NULL,
  'risco=' || COALESCE(e->>'risco','NULL') || ' cob=' || (e->>'cobertura'))
  FROM jsonb_array_elements(risco_evasao()->'alunos') e
 WHERE e->>'nome_completo' LIKE '08 %';

SELECT t_ok('10.1 mas o fato aparece em motivos, sem virar nota',
  (SELECT count(*) FROM jsonb_array_elements_text(e->'motivos') m
    WHERE m LIKE '%sem contrato ativo%') = 1,
  (SELECT string_agg(m, ' | ') FROM jsonb_array_elements_text(e->'motivos') m))
  FROM jsonb_array_elements(risco_evasao()->'alunos') e
 WHERE e->>'nome_completo' LIKE '08 %';

\echo '-- 10.2 componentes sem dado saem do denominador, nao contam zero'
SELECT t_ok('10.2 frequencia nao confiavel fica fora e e declarada',
  (e->'componentes'->>'frequencia') IS NULL
  AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(e->'nao_medido') n
               WHERE n LIKE 'frequência%'),
  'cob=' || (e->>'cobertura'))
  FROM jsonb_array_elements(risco_evasao()->'alunos') e
 WHERE e->>'nome_completo' LIKE '01 %';

\echo '-- 10.3 atraso: em dia pontua 0, e a nota existe'
SELECT t_ok('10.3 quem pagou em dia pontua 0 no atraso (e nao NULL)',
  (e->'componentes'->>'atraso')::int = 0 AND (e->>'risco') IS NOT NULL,
  'atraso=' || (e->'componentes'->>'atraso') || ' risco=' || (e->>'risco'))
  FROM jsonb_array_elements(risco_evasao()->'alunos') e
 WHERE e->>'nome_completo' LIKE '01 %';

\echo '-- 10.4 pendente vencido conta igual a vencido (o job pode nao ter rodado)'
SELECT t_ok('10.4 status pendente com vencimento passado conta como atraso',
  (SELECT (e2->'componentes'->>'atraso')::int
     FROM jsonb_array_elements(risco_evasao()->'alunos') e2
    WHERE e2->>'nome_completo' LIKE '03 %')
  = (SELECT (e3->'componentes'->>'atraso')::int
       FROM jsonb_array_elements(risco_evasao()->'alunos') e3
      WHERE e3->>'nome_completo' LIKE '02 %'),
  'pendente=' || (SELECT (e2->'componentes'->>'atraso') FROM jsonb_array_elements(risco_evasao()->'alunos') e2 WHERE e2->>'nome_completo' LIKE '03 %')
  || ' vencido=' || (SELECT (e3->'componentes'->>'atraso') FROM jsonb_array_elements(risco_evasao()->'alunos') e3 WHERE e3->>'nome_completo' LIKE '02 %'));

\echo '-- 10.5 tres parcelas em aberto pontuam mais que uma'
SELECT t_ok('10.5 atraso longo (3 parcelas) > atraso curto (1 parcela)',
  (SELECT (a->'componentes'->>'atraso')::int FROM jsonb_array_elements(risco_evasao()->'alunos') a WHERE a->>'nome_completo' LIKE '06 %')
  > (SELECT (b->'componentes'->>'atraso')::int FROM jsonb_array_elements(risco_evasao()->'alunos') b WHERE b->>'nome_completo' LIKE '02 %'),
  '06=' || (SELECT (a->'componentes'->>'atraso') FROM jsonb_array_elements(risco_evasao()->'alunos') a WHERE a->>'nome_completo' LIKE '06 %')
  || ' 02=' || (SELECT (b->'componentes'->>'atraso') FROM jsonb_array_elements(risco_evasao()->'alunos') b WHERE b->>'nome_completo' LIKE '02 %'));

\echo '-- 10.6 reincidencia: pagar sempre atrasado pontua mesmo estando em dia hoje'
SELECT t_ok('10.6 quem paga atrasado mas esta quite hoje ainda pontua',
  (e->'componentes'->>'reincidencia')::int > 0
  AND (e->'componentes'->>'atraso')::int = 0,
  'reinc=' || (e->'componentes'->>'reincidencia') || ' atraso=' || (e->'componentes'->>'atraso'))
  FROM jsonb_array_elements(risco_evasao()->'alunos') e
 WHERE e->>'nome_completo' LIKE '07 %';

\echo '-- 10.7 invariantes sobre TODAS as linhas'
WITH t AS (SELECT e FROM jsonb_array_elements(risco_evasao()->'alunos') e)
SELECT t_ok('10.7 risco sempre em [0,100] ou NULL',
  bool_and((e->>'risco') IS NULL OR (e->>'risco')::numeric BETWEEN 0 AND 100),
  'n=' || count(*)) FROM t
UNION ALL
SELECT t_ok('10.7 cobertura sempre em (0,1]',
  bool_and((e->>'cobertura')::numeric > 0 AND (e->>'cobertura')::numeric <= 1), 'n='||count(*)) FROM t
UNION ALL
SELECT t_ok('10.7 nota existe se e so se ha sinal de comportamento',
  bool_and(((e->>'risco') IS NOT NULL) = (
     (e->'componentes'->>'atraso') IS NOT NULL
     OR (e->'componentes'->>'reincidencia') IS NOT NULL
     OR (e->'componentes'->>'frequencia') IS NOT NULL)), 'n='||count(*)) FROM t
UNION ALL
SELECT t_ok('10.7 quem tem nota tem pelo menos um motivo ou risco 0',
  bool_and((e->>'risco') IS NULL OR (e->>'risco')::int = 0
           OR jsonb_array_length(e->'motivos') > 0), 'n='||count(*)) FROM t
UNION ALL
SELECT t_ok('10.7 lista ordenada por risco desc, NULL por ultimo',
  (SELECT bool_and(x >= y) FROM (
     SELECT (e->>'risco')::numeric AS x,
            lead((e->>'risco')::numeric) OVER () AS y
       FROM jsonb_array_elements(risco_evasao()->'alunos') e) s
    WHERE y IS NOT NULL), 'ordem');

\echo '-- 10.8 isolamento: a academia B nao aparece para o admin da A'
SELECT t_ok('10.8 nenhuma linha de outra academia',
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(risco_evasao()->'alunos') e
               WHERE e->>'nome_completo' LIKE 'B%' OR e->>'nome_completo' LIKE 'C%'),
  'n=' || (SELECT jsonb_array_length(risco_evasao()->'alunos')));

\echo '-- 10.9 um aluno so devolve um aluno so'
SELECT t_ok('10.9 filtro por aluno_id devolve exatamente ele',
  jsonb_array_length(r->'alunos') = 1
  AND (r->'alunos'->0->>'nome_completo') LIKE '06 %',
  'n=' || jsonb_array_length(r->'alunos'))
  FROM (SELECT risco_evasao((SELECT id FROM alunos WHERE nome_completo LIKE '06 %')) AS r) q;

\echo '-- 10.10 degradacao por papel: quem nao le mensalidade recebe NULL, nao nota baixa'
RESET ROLE;
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000002';  -- professor adulto
SET ROLE authenticated;
SELECT t_ok('10.10 professor nao le mensalidade -> atraso NULL, nao 0',
  (e->'componentes'->>'atraso') IS NULL AND (e->>'risco') IS NULL,
  'atraso=' || COALESCE(e->'componentes'->>'atraso','NULL')
   || ' risco=' || COALESCE(e->>'risco','NULL') || ' cob=' || (e->>'cobertura'))
  FROM jsonb_array_elements(risco_evasao()->'alunos') e
 WHERE e->>'nome_completo' LIKE '06 %';

RESET ROLE;
SET request.jwt.claim.sub = :ADM; SET ROLE authenticated;
SELECT t_ok('10.10 o mesmo aluno, para o admin, TEM atraso medido',
  (e->'componentes'->>'atraso')::int > 0 AND (e->>'risco') IS NOT NULL,
  'atraso=' || (e->'componentes'->>'atraso') || ' risco=' || (e->>'risco'))
  FROM jsonb_array_elements(risco_evasao()->'alunos') e
 WHERE e->>'nome_completo' LIKE '06 %';

RESET ROLE; ROLLBACK;
