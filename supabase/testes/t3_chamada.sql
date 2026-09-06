\set C '''cccccccc-0000-0000-0000-00000000000c'''
\set ADMC '''44444444-0000-0000-0000-000000000001'''
\echo '### ITEM 3 — guarda "chamada nao realizada" (tenant C, grade todo dia)'

-- 3a) NENHUM dia com chamada na janela
BEGIN;
DELETE FROM presencas WHERE tenant_id=:C::uuid AND data > (now() AT TIME ZONE 'UTC')::date - 28;
SET request.jwt.claim.sub = '44444444-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('3a nenhum dia com chamada -> fator 0',
  (o->>'fator')::numeric = 0, 'fator='||(o->>'fator')||' chamadas='||(o->>'dias_com_chamada'))
  FROM jsonb_array_elements(frequencia_aluno()->'operacao') o WHERE o->>'categoria'='adulto';
SELECT t_ok('3a nenhum dia com chamada -> confiavel=false', (o->>'confiavel')='false')
  FROM jsonb_array_elements(frequencia_aluno()->'operacao') o WHERE o->>'categoria'='adulto';
SELECT t_ok('3a nenhum dia com chamada -> aderencia NULL p/ TODOS (inconclusivo, nao 0%)',
  bool_and(a->>'aderencia' IS NULL), 'nulls='||count(*) FILTER (WHERE a->>'aderencia' IS NULL)||'/'||count(*))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
SELECT t_ok('3a nenhum dia com chamada -> semTr 0 p/ TODOS (nada foi perdido)',
  bool_and((a->>'dias_sem_treinar')::int = 0)) FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
SELECT t_ok('3a mas dias_corridos denuncia o dado velho',
  max((a->>'dias_corridos_sem_treinar')::int) >= 28, 'max corridos='||max((a->>'dias_corridos_sem_treinar')::int))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
RESET ROLE; ROLLBACK;

-- 3b) chamada SOMENTE HOJE
BEGIN;
DELETE FROM presencas WHERE tenant_id=:C::uuid AND data < (now() AT TIME ZONE 'UTC')::date;
SET request.jwt.claim.sub = '44444444-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('3b chamada so hoje -> fator baixo, confiavel=false',
  (o->>'confiavel')='false', 'fator='||(o->>'fator')||' chamadas='||(o->>'dias_com_chamada'))
  FROM jsonb_array_elements(frequencia_aluno()->'operacao') o WHERE o->>'categoria'='adulto';
SELECT t_ok('3b quem treinou hoje -> semTr 0', (a->>'dias_sem_treinar')='0')
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE 'C1 %';
SELECT t_ok('3b quem sumiu ha 10d -> semTr 1 (so 1 chamada aconteceu)',
  (a->>'dias_sem_treinar')='1', 'semTr='||(a->>'dias_sem_treinar')||' corridos='||(a->>'dias_corridos_sem_treinar'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE 'C6 %';
RESET ROLE; ROLLBACK;

-- 3c) chamada SO HA VARIOS DIAS (parou ha 14)
BEGIN;
DELETE FROM presencas WHERE tenant_id=:C::uuid AND data > (now() AT TIME ZONE 'UTC')::date - 14;
SET request.jwt.claim.sub = '44444444-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('3c chamada parou ha 14d -> fator 0.5, confiavel=false',
  (o->>'confiavel')='false', 'fator='||(o->>'fator'))
  FROM jsonb_array_elements(frequencia_aluno()->'operacao') o WHERE o->>'categoria'='adulto';
SELECT t_ok('3c aluno em dia NAO vira risco: semTr 0 mas corridos 14',
  (a->>'dias_sem_treinar')='0' AND (a->>'dias_corridos_sem_treinar')::int = 14,
  'semTr='||(a->>'dias_sem_treinar')||' corridos='||(a->>'dias_corridos_sem_treinar'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE 'C1 %';
RESET ROLE; ROLLBACK;

-- 3d) METADE das chamadas ausentes (dias alternados)
BEGIN;
DELETE FROM presencas WHERE tenant_id=:C::uuid
   AND data > (now() AT TIME ZONE 'UTC')::date - 28 AND (extract(day from data)::int % 2)=0;
SET request.jwt.claim.sub = '44444444-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('3d metade das chamadas ausentes -> confiavel=false',
  (o->>'confiavel')='false', 'fator='||(o->>'fator'))
  FROM jsonb_array_elements(frequencia_aluno()->'operacao') o WHERE o->>'categoria'='adulto';
SELECT t_ok('3d aluno em dia continua ader 1.000 (meta encolheu junto)',
  (a->>'aderencia')::numeric = 1.0, 'ader='||(a->>'aderencia')||' esp='||(a->>'dias_esperados'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE 'C1 %';
RESET ROLE; ROLLBACK;

-- 3e) academia SEM GRADE ATIVA
BEGIN;
UPDATE horarios SET ativo=false WHERE tenant_id=:C::uuid;
SET request.jwt.claim.sub = '44444444-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('3e sem grade ativa -> fator NULL e aderencia NULL (nao 100%)',
  bool_and(a->>'aderencia' IS NULL AND a->>'dias_esperados' IS NULL))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
RESET ROLE; ROLLBACK;
