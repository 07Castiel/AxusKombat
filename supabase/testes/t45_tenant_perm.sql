\echo '### ITEM 4 — isolamento entre academias'
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('4a admin A: nenhum aluno de B ou C na lista',
  NOT bool_or(a->>'nome_completo' LIKE 'B%' OR a->>'nome_completo' LIKE 'C%'),
  'total='||count(*)) FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
SELECT t_ok('4b admin A pedindo aluno_id da academia B -> lista VAZIA',
  jsonb_array_length(frequencia_aluno('b0000001-0000-0000-0000-000000000001')->'alunos') = 0,
  'len='||jsonb_array_length(frequencia_aluno('b0000001-0000-0000-0000-000000000001')->'alunos'));
SELECT t_ok('4c admin A pedindo aluno_id da academia C -> lista VAZIA',
  jsonb_array_length(frequencia_aluno('c0000001-0000-0000-0000-000000000001')->'alunos') = 0);
SELECT t_ok('4d operacao de A nao soma chamada de B/C',
  (SELECT (o->>'dias_com_chamada')::int FROM jsonb_array_elements(frequencia_aluno()->'operacao') o WHERE o->>'categoria'='adulto') = 20,
  'chamadas adulto A='||(SELECT o->>'dias_com_chamada' FROM jsonb_array_elements(frequencia_aluno()->'operacao') o WHERE o->>'categoria'='adulto'));
RESET ROLE;

SET request.jwt.claim.sub = '22222222-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('4e admin B ve apenas alunos de B',
  bool_and(a->>'nome_completo' LIKE 'B%'), 'total='||count(*))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
SELECT t_ok('4f admin B pedindo aluno_id de A -> lista VAZIA',
  jsonb_array_length(frequencia_aluno('a0000002-0000-0000-0000-000000000002')->'alunos') = 0);
SELECT t_ok('4g fuso de B e o de B (Manaus), nao o de A',
  (frequencia_aluno()->'janela'->>'fuso') = 'America/Manaus', frequencia_aluno()->'janela'->>'fuso');
RESET ROLE;

\echo ''
\echo '### ITEM 5 — permissoes por papel (RLS real)'
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000002'; SET ROLE authenticated;  -- professor_adulto
SELECT t_ok('5a professor_adulto: SO alunos adulto',
  bool_and(a->>'categoria'='adulto'), 'n='||count(*)||' categorias='||string_agg(DISTINCT a->>'categoria',','))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
SELECT t_ok('5a professor_adulto: operacao so da categoria dele',
  bool_and(o->>'categoria'='adulto'), string_agg(o->>'categoria',','))
  FROM jsonb_array_elements(frequencia_aluno()->'operacao') o;
SELECT t_ok('5a professor_adulto pedindo aluno KIDS -> vazio',
  jsonb_array_length(frequencia_aluno('a0000010-0000-0000-0000-000000000010')->'alunos')=0);
RESET ROLE;

SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000003'; SET ROLE authenticated;  -- professor_kids
SELECT t_ok('5b professor_kids: SO alunos kids',
  bool_and(a->>'categoria'='kids'), 'n='||count(*)) FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
SELECT t_ok('5b professor_kids: numerador e denominador do MESMO recorte (fator kids=1)',
  (o->>'fator')::numeric=1.0, 'dias_semana='||(o->>'dias_por_semana')||' chamadas='||(o->>'dias_com_chamada'))
  FROM jsonb_array_elements(frequencia_aluno()->'operacao') o WHERE o->>'categoria'='kids';
RESET ROLE;

SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000004'; SET ROLE authenticated;  -- recepcao
SELECT t_ok('5c recepcao: ve as duas categorias de A',
  count(DISTINCT a->>'categoria')=2, 'n='||count(*)) FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
RESET ROLE;

SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000005'; SET ROLE authenticated;  -- financeiro
SELECT t_ok('5d financeiro ve alunos mas NAO presencas (RLS) -> degrada p/ inconclusivo, nao p/ "todos sumidos"',
  bool_and(a->>'aderencia' IS NULL), 'alunos='||count(*)||' com_ader='||count(*) FILTER (WHERE a->>'aderencia' IS NOT NULL))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
SELECT t_ok('5d financeiro: confiavel=false em todas as linhas',
  bool_and((a->>'confiavel')='false')) FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;
RESET ROLE;

SET request.jwt.claim.sub = '33333333-0000-0000-0000-000000000001'; SET ROLE authenticated;  -- sem profile
SELECT t_ok('5e usuario sem perfil (sem tenant) -> funcao devolve NULL',
  frequencia_aluno() IS NULL, coalesce(frequencia_aluno()::text,'NULL'));
RESET ROLE;
