-- ============================================================================
-- Os caminhos de consulta que as TELAS usam, exercitados como authenticated.
--
-- Nao testa componentes (isso e src/components/FrequenciaAluno.test.tsx). Testa
-- que o dado que chega neles esta certo, e que a ficha nao vaza entre academias
-- pela rota /aluno/$id.
-- ============================================================================
\echo '### ITEM 7/11 — caminhos de consulta das telas'

SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;

\echo '-- ficha: uma chamada por aluno, uma linha'
SELECT t_ok('ficha devolve exatamente 1 linha para o aluno pedido',
  jsonb_array_length(frequencia_aluno('a0000002-0000-0000-0000-000000000002')->'alunos') = 1);

\echo '-- painel: uma chamada, a academia inteira (sem N+1)'
SELECT t_ok('painel devolve todos os alunos ativos numa chamada so',
  jsonb_array_length(frequencia_aluno()->'alunos') = (SELECT count(*) FROM alunos WHERE status='ativo'),
  'rpc='||jsonb_array_length(frequencia_aluno()->'alunos')||' alunos_ativos_visiveis='||(SELECT count(*) FROM alunos WHERE status='ativo'));

\echo '-- os campos que a interface le existem em toda linha'
SELECT t_ok('nenhuma linha sem os campos que a tela consome',
  bool_and(a ?& ARRAY['aluno_id','nome_completo','categoria','meta_semanal','meta_origem',
                      'dias_treinados','dias_esperados','aderencia','ritmo_semanal',
                      'ritmo_base_semanal','ultima_presenca','dias_sem_treinar',
                      'dias_corridos_sem_treinar','gap_esperado','em_carencia',
                      'dias_desde_entrada','confiavel']))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a;

\echo '-- cenarios que a tela precisa distinguir'
SELECT t_ok('aluno completo: aderencia numerica, nao nula',
  (a->>'aderencia') IS NOT NULL AND (a->>'confiavel')='true')
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '02 %';
SELECT t_ok('aluno NOVO: aderencia NULA (tela mostra "sem dados", nao 0%)',
  (a->>'aderencia') IS NULL AND (a->>'em_carencia')='true')
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '08 %';
SELECT t_ok('aluno SEM frequencia nenhuma: aderencia 0 de verdade, ultima_presenca nula',
  (a->>'aderencia')::numeric = 0 AND (a->>'ultima_presenca') IS NULL,
  'ader='||(a->>'aderencia'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '04 %';
SELECT t_ok('aluno que treinou no ultimo dia de operacao: 0 aulas perdidas',
  (a->>'dias_sem_treinar')='0')
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '02 %';
SELECT t_ok('aluno fora ha varios dias: oportunidades perdidas refletem a grade dele',
  (a->>'dias_sem_treinar')::int >= 10, 'perdidas='||(a->>'dias_sem_treinar')||' corridos='||(a->>'dias_corridos_sem_treinar'))
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE '15 %';
RESET ROLE;

\echo '-- escada exata numa grade de todo dia (tenant C)'
SET request.jwt.claim.sub = '44444444-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('treinou HOJE -> 0 perdidas', (a->>'dias_sem_treinar')='0')
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE 'C1 %';
SELECT t_ok('treinou ONTEM -> 1 perdida', (a->>'dias_sem_treinar')='1')
  FROM jsonb_array_elements(frequencia_aluno()->'alunos') a WHERE a->>'nome_completo' LIKE 'C2 %';
RESET ROLE;

\echo '-- ISOLAMENTO pela rota /aluno/$id'
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('ficha: SELECT do aluno por id de OUTRA academia devolve zero linhas',
  count(*) = 0, 'linhas='||count(*))
  FROM alunos WHERE id = 'b0000001-0000-0000-0000-000000000001';
SELECT t_ok('ficha: contrato por aluno de OUTRA academia devolve zero linhas',
  count(*) = 0) FROM contratos WHERE aluno_id = 'b0000001-0000-0000-0000-000000000001';
SELECT t_ok('ficha: RPC com aluno de OUTRA academia devolve lista vazia',
  jsonb_array_length(frequencia_aluno('b0000001-0000-0000-0000-000000000001')->'alunos') = 0);
SELECT t_ok('ficha: envelope tambem nao vaza operacao de outra academia',
  jsonb_array_length(frequencia_aluno('b0000001-0000-0000-0000-000000000001')->'operacao') = 0);
RESET ROLE;

\echo '-- o financeiro nao le presenca (decisao documentada em acesso-telas.ts)'
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000005'; SET ROLE authenticated;
SELECT t_ok('financeiro: zero linhas de presenca (RLS)', count(*) = 0) FROM presencas;
SELECT t_ok('financeiro: ve alunos e contratos normalmente (as telas dele)',
  (SELECT count(*) FROM alunos) > 0 AND (SELECT count(*) FROM contratos) > 0);
RESET ROLE;
