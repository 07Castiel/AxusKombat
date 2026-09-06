\echo '### ITEM 2 — auditoria matematica'
\echo '-- 2.1 metas degeneradas no banco (0, negativa, absurda, NULL)'
BEGIN;
UPDATE planos SET frequencia_semanal=0    WHERE id='02000000-0000-0000-0000-000000000002';
UPDATE planos SET frequencia_semanal=-3   WHERE id='03000000-0000-0000-0000-000000000003';
UPDATE planos SET frequencia_semanal=1000 WHERE id='04000000-0000-0000-0000-000000000004';
UPDATE planos SET frequencia_semanal=NULL WHERE id='01000000-0000-0000-0000-000000000001';
SET request.jwt.claim.sub='11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('2.1 meta 0 nao derruba (division by zero) e cai no historico',
  (a->>'meta_semanal')::int >= 1 AND (a->>'gap_esperado')::numeric > 0,
  'meta='||(a->>'meta_semanal')||' origem='||(a->>'meta_origem')||' gap='||(a->>'gap_esperado'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '02 %';
SELECT t_ok('2.1 meta NEGATIVA nao gera expectativa negativa',
  (a->>'meta_semanal')::int >= 1 AND (a->>'dias_esperados')::numeric > 0,
  'meta='||(a->>'meta_semanal')||' esp='||(a->>'dias_esperados'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '06 %';
SELECT t_ok('2.1 meta 1000 e limitada a 7 (nao existe 8o dia na semana)',
  (a->>'meta_semanal')::int = 7, 'meta='||(a->>'meta_semanal')||' gap='||(a->>'gap_esperado'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '07 %';
SELECT t_ok('2.1 meta NULL no plano -> cai no historico',
  (a->>'meta_origem')='historico', 'meta='||(a->>'meta_semanal')||' origem='||(a->>'meta_origem'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '05 %';
RESET ROLE; ROLLBACK;

\echo '-- 2.2 invariantes sobre TODAS as linhas, em 3 academias e 4 janelas'
SET request.jwt.claim.sub='11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
WITH todas AS (
  SELECT a FROM unnest(ARRAY[1,7,28,365]) j, jsonb_array_elements(frequencia_aluno(NULL, j)->'alunos') a
)
SELECT t_ok('2.2 aderencia sempre em [0,1] ou NULL',
  bool_and(a->>'aderencia' IS NULL OR ((a->>'aderencia')::numeric BETWEEN 0 AND 1)), 'n='||count(*)) FROM todas
UNION ALL SELECT t_ok('2.2 dias_sem_treinar nunca negativo',
  bool_and((a->>'dias_sem_treinar')::int >= 0)) FROM todas
UNION ALL SELECT t_ok('2.2 dias_corridos_sem_treinar nunca negativo',
  bool_and(a->>'dias_corridos_sem_treinar' IS NULL OR (a->>'dias_corridos_sem_treinar')::int >= 0)) FROM todas
UNION ALL SELECT t_ok('2.2 ritmo_semanal nunca negativo',
  bool_and((a->>'ritmo_semanal')::numeric >= 0)) FROM todas
UNION ALL SELECT t_ok('2.2 gap_esperado sempre > 0',
  bool_and((a->>'gap_esperado')::numeric > 0)) FROM todas
UNION ALL SELECT t_ok('2.2 meta_semanal sempre entre 1 e 7',
  bool_and((a->>'meta_semanal')::int BETWEEN 1 AND 7)) FROM todas
UNION ALL SELECT t_ok('2.2 dias_esperados nunca negativo',
  bool_and(a->>'dias_esperados' IS NULL OR (a->>'dias_esperados')::numeric >= 0)) FROM todas
UNION ALL SELECT t_ok('2.2 dias_treinados nunca negativo',
  bool_and((a->>'dias_treinados')::int >= 0)) FROM todas
UNION ALL SELECT t_ok('2.2 nenhum NaN / Infinity no JSON inteiro',
  NOT bool_or(a::text ~* '(nan|infinity)')) FROM todas
UNION ALL SELECT t_ok('2.2 dias_treinados <= dias da janela (nunca conta linha 2x)',
  bool_and((a->>'dias_treinados')::int <= 365)) FROM todas;
RESET ROLE;

\echo '-- 2.3 janela: minimo, maximo e valores invalidos'
SET request.jwt.claim.sub='11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('2.3 p_dias=1 -> minimo 7', (frequencia_aluno(NULL,1)->'janela'->>'dias')='7');
SELECT t_ok('2.3 p_dias=0 -> minimo 7', (frequencia_aluno(NULL,0)->'janela'->>'dias')='7');
SELECT t_ok('2.3 p_dias=-99 -> minimo 7', (frequencia_aluno(NULL,-99)->'janela'->>'dias')='7');
SELECT t_ok('2.3 p_dias=365 -> maximo 365', (frequencia_aluno(NULL,365)->'janela'->>'dias')='365');
SELECT t_ok('2.3 p_dias=99999 -> teto 365', (frequencia_aluno(NULL,99999)->'janela'->>'dias')='365');
SELECT t_ok('2.3 p_dias=NULL -> padrao 28', (frequencia_aluno(NULL,NULL)->'janela'->>'dias')='28');
SELECT t_ok('2.3 janela de 7 dias: de/ate coerentes',
  ((frequencia_aluno(NULL,7)->'janela'->>'ate')::date - (frequencia_aluno(NULL,7)->'janela'->>'de')::date) = 6,
  'de='||(frequencia_aluno(NULL,7)->'janela'->>'de')||' ate='||(frequencia_aluno(NULL,7)->'janela'->>'ate'));
SELECT t_ok('2.3 janela de 365 dias: de/ate coerentes',
  ((frequencia_aluno(NULL,365)->'janela'->>'ate')::date - (frequencia_aluno(NULL,365)->'janela'->>'de')::date) = 364);

\echo '-- 2.4 casos nomeados (janela padrao de 28 dias)'
SELECT t_ok('2.4 acima da meta -> aderencia com TETO em 1.000',
  (a->>'aderencia')::numeric=1.0 AND (a->>'ritmo_semanal')::numeric=4.0,
  'ader='||(a->>'aderencia')||' ritmo='||(a->>'ritmo_semanal')||' tr='||(a->>'dias_treinados')||'/'||(a->>'dias_esperados'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '01 %';
SELECT t_ok('2.4 exatamente na meta -> 1.000', (a->>'aderencia')::numeric=1.0)
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '02 %';
SELECT t_ok('2.4 abaixo da meta (4x, treina 2x) -> 0.500',
  (a->>'aderencia')::numeric=0.5, 'ader='||(a->>'aderencia'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '03 %';
SELECT t_ok('2.4 zero treinos -> 0.000 (nao NULL: ha expectativa e ela nao foi cumprida)',
  (a->>'aderencia')::numeric=0.0 AND a->>'ultima_presenca' IS NULL)
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '04 %';
SELECT t_ok('2.4 PRESENCA DUPLICADA: 2 aulas no mesmo dia contam 1 dia',
  (a->>'dias_treinados')::int=4 AND (a->>'ritmo_semanal')::numeric=1.0,
  'dias='||(a->>'dias_treinados')||' (seriam 8 se contasse linhas)')
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '10 %';
SELECT t_ok('2.4 sem contrato COM historico -> meta do proprio habito',
  (a->>'meta_origem')='historico' AND (a->>'meta_semanal')::int=3)
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '11 %';
SELECT t_ok('2.4 sem contrato SEM historico -> padrao 1x',
  (a->>'meta_origem')='padrao' AND (a->>'meta_semanal')::int=1)
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '12 %';
SELECT t_ok('2.4 frequencia contratada ALTERADA -> vale so o contrato ativo (2x, nao 4x)',
  (a->>'meta_semanal')::int=2 AND (a->>'meta_origem')='plano')
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '13 %';
SELECT t_ok('2.4 expectativa FRACIONARIA (<1 dia) -> aderencia NULL, nao 0% nem 100%',
  a->>'aderencia' IS NULL AND (a->>'dias_esperados')::numeric < 1,
  'esp='||(a->>'dias_esperados'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '08 %';
SELECT t_ok('2.4 aluno ANTIGO nao entra em carencia', (a->>'em_carencia')='false')
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '02 %';
SELECT t_ok('2.4 aluno inativo NAO aparece na lista',
  NOT bool_or(a->>'nome_completo' LIKE '17 %')) FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
SELECT t_ok('2.4 queda de ritmo aparece em ritmo vs base (4x -> 2x)',
  (SELECT (a->>'ritmo_semanal')::numeric FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '15 %')
  < (SELECT (a->>'ritmo_base_semanal')::numeric FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '15 %'));
RESET ROLE;

\echo '-- 2.5 datas de matricula degeneradas (segunda auditoria)'
BEGIN;
UPDATE alunos SET data_entrada=(now() AT TIME ZONE 'America/Sao_Paulo')::date + 30 WHERE id='a0000002-0000-0000-0000-000000000002';
SET request.jwt.claim.sub='11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('2.5 matricula no FUTURO -> dias_desde_entrada nunca negativo',
  (a->>'dias_desde_entrada')::int >= 0, 'valor='||(a->>'dias_desde_entrada'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '02 %';
SELECT t_ok('2.5 matricula no FUTURO -> ritmo continua plausivel (<=7/semana)',
  (a->>'ritmo_semanal')::numeric <= 7, 'ritmo='||(a->>'ritmo_semanal'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '02 %';
SELECT t_ok('2.5 matricula no FUTURO -> em_carencia marca a linha',
  (a->>'em_carencia')='true') FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '02 %';
RESET ROLE; ROLLBACK;
SET request.jwt.claim.sub='11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('2.5 ritmo_semanal <= 7 para TODA a base (nao existe 8o dia na semana)',
  bool_and((a->>'ritmo_semanal')::numeric <= 7), 'max='||max((a->>'ritmo_semanal')::numeric))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
SELECT t_ok('2.5 dias_desde_entrada >= 0 para TODA a base',
  bool_and((a->>'dias_desde_entrada')::int >= 0)) FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
RESET ROLE;
