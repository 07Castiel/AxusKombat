\echo '### ITEM 6 — fuso da academia'
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('6a fuso valido e lido do tenant (A = Sao Paulo)',
  (frequencia_aluno()->'janela'->>'fuso')='America/Sao_Paulo', frequencia_aluno()->'janela'->>'fuso');
SELECT t_ok('6b admin A NAO consegue ler o fuso da academia B (cai no padrao)',
  fuso_do_tenant('bbbbbbbb-0000-0000-0000-00000000000b')='America/Sao_Paulo',
  'B e Manaus; A leu: '||fuso_do_tenant('bbbbbbbb-0000-0000-0000-00000000000b'));
RESET ROLE;

-- 6c fuso INVALIDO gravado na configuracao
BEGIN;
UPDATE notification_settings SET timezone='Marte/Olympus' WHERE tenant_id='aaaaaaaa-0000-0000-0000-00000000000a';
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('6c fuso invalido -> nao derruba, cai em Sao Paulo',
  (frequencia_aluno()->'janela'->>'fuso')='America/Sao_Paulo' AND (frequencia_aluno()->'janela'->>'ate') IS NOT NULL,
  'fuso reportado='||(frequencia_aluno()->'janela'->>'fuso')||' ate='||(frequencia_aluno()->'janela'->>'ate'));
RESET ROLE; ROLLBACK;

-- 6d SEM linha de notification_settings
BEGIN;
DELETE FROM notification_settings WHERE tenant_id='aaaaaaaa-0000-0000-0000-00000000000a';
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('6d sem configuracao -> padrao Sao Paulo, sem erro',
  (frequencia_aluno()->'janela'->>'fuso')='America/Sao_Paulo');
RESET ROLE; ROLLBACK;

-- 6e fuso NULL explicito
BEGIN;
UPDATE notification_settings SET timezone=NULL WHERE tenant_id='aaaaaaaa-0000-0000-0000-00000000000a';
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('6e timezone NULL -> padrao Sao Paulo',
  (frequencia_aluno()->'janela'->>'fuso')='America/Sao_Paulo');
RESET ROLE; ROLLBACK;

-- 6f VIRADA DE DATA: dois fusos a 25h de distancia tem que dar datas diferentes
BEGIN;
UPDATE notification_settings SET timezone='Pacific/Kiritimati' WHERE tenant_id='aaaaaaaa-0000-0000-0000-00000000000a'; -- UTC+14
UPDATE notification_settings SET timezone='Pacific/Midway'     WHERE tenant_id='bbbbbbbb-0000-0000-0000-00000000000b'; -- UTC-11
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
CREATE TEMP TABLE _r(qual text, ate date, fuso text);
INSERT INTO _r SELECT 'A(UTC+14)', (frequencia_aluno()->'janela'->>'ate')::date, frequencia_aluno()->'janela'->>'fuso';
RESET ROLE;
SET request.jwt.claim.sub = '22222222-0000-0000-0000-000000000001'; SET ROLE authenticated;
INSERT INTO _r SELECT 'B(UTC-11)', (frequencia_aluno()->'janela'->>'ate')::date, frequencia_aluno()->'janela'->>'fuso';
RESET ROLE;
SELECT t_ok('6f virada de data: fusos a 25h de distancia dao "hoje" diferentes',
  (SELECT count(DISTINCT ate) FROM _r) = 2,
  (SELECT string_agg(qual||'='||ate::text,'  vs  ' ORDER BY qual) FROM _r)
  ||'   | servidor UTC='||(now() AT TIME ZONE 'UTC')::date::text);
ROLLBACK;

-- 6g o fallback muda o resultado? (Manaus vs Sao Paulo na virada)
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('6g hoje no fuso do tenant != hoje do servidor quando aplicavel (sanidade)',
  (frequencia_aluno()->'janela'->>'ate')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  'ate='||(frequencia_aluno()->'janela'->>'ate')||' SP='||(now() AT TIME ZONE 'America/Sao_Paulo')::date::text
  ||' UTC='||(now() AT TIME ZONE 'UTC')::date::text);
RESET ROLE;
