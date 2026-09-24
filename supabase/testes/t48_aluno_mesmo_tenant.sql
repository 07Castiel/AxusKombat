\echo ''
\echo '### ITEM 8 — aluno_id tem de ser do mesmo tenant (issue #22)'

CREATE OR REPLACE FUNCTION _ins_contrato(p_tenant uuid, p_aluno uuid, p_status text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.contratos (tenant_id, aluno_id, valor_mensalidade, dia_vencimento, data_inicio, status)
  VALUES (p_tenant, p_aluno, 100, 10, current_date, p_status::status_contrato);
  RETURN true;   -- passou
EXCEPTION WHEN OTHERS THEN
  RETURN false;  -- bloqueado (guarda de tenant, RLS ou outra constraint)
END $$;

-- O gatilho está nas três tabelas que carregam aluno_id + tenant_id.
SELECT t_ok('8a gatilho tg_aluno_mesmo_tenant em contratos/historico/mensalidades',
  (SELECT count(*) FROM pg_trigger
     WHERE tgname='tg_aluno_mesmo_tenant'
       AND tgrelid IN ('public.contratos'::regclass,
                       'public.historico_graduacoes'::regclass,
                       'public.mensalidades'::regclass)) = 3,
  'triggers='||(SELECT count(*) FROM pg_trigger WHERE tgname='tg_aluno_mesmo_tenant'));

-- Admin da Academia A tentando referenciar um aluno da Academia B.
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('8b admin A NAO cria contrato com aluno da academia B',
  NOT _ins_contrato('aaaaaaaa-0000-0000-0000-00000000000a'::uuid,
                    'b0000001-0000-0000-0000-000000000001'::uuid, 'ativo'));
-- aluno da propria academia passa (status pausado p/ nao colidir com o contrato
-- ativo unico que o seed ja deu a esse aluno).
SELECT t_ok('8c admin A cria contrato com aluno da propria academia',
  _ins_contrato('aaaaaaaa-0000-0000-0000-00000000000a'::uuid,
                'a0000001-0000-0000-0000-000000000001'::uuid, 'pausado'));
RESET ROLE;

-- A guarda e SECURITY DEFINER: pega o cross-tenant ATE quando quem escreve e a
-- service_role (o worker e a RPC gerar_mensalidades rodam assim).
SET ROLE service_role;
SELECT t_ok('8d service_role tambem NAO cria contrato cross-tenant',
  NOT _ins_contrato('aaaaaaaa-0000-0000-0000-00000000000a'::uuid,
                    'b0000001-0000-0000-0000-000000000001'::uuid, 'ativo'));
RESET ROLE;

-- Nenhum contrato intruso (aluno de B dentro do tenant A) ficou no banco.
SELECT t_ok('8e nenhum contrato cross-tenant entrou',
  NOT EXISTS (
    SELECT 1 FROM contratos c JOIN alunos a ON a.id = c.aluno_id
    WHERE c.tenant_id <> a.tenant_id));

DROP FUNCTION _ins_contrato(uuid, uuid, text);
