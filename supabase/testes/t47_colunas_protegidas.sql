\echo ''
\echo '### ITEM 7 — travas de coluna em tenants e profiles (issues #19 e #20)'

-- Helpers: tentam um UPDATE como o papel atual e dizem se passou. SECURITY
-- INVOKER (padrao) => o privilegio de coluna e o RLS sao exercidos de verdade.
CREATE OR REPLACE FUNCTION _upd_tenant(p_id uuid, p_col text, p_val text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('UPDATE public.tenants SET %I = %L WHERE id = %L', p_col, p_val, p_id);
  RETURN true;   -- passou
EXCEPTION WHEN OTHERS THEN
  RETURN false;  -- bloqueado (privilegio de coluna ou RLS)
END $$;

CREATE OR REPLACE FUNCTION _upd_profile(p_id uuid, p_col text, p_val text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('UPDATE public.profiles SET %I = %L WHERE id = %L', p_col, p_val, p_id);
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END $$;

-- ===== #19 — tenants: admin escreve cadastro, NAO billing/estado =====
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;  -- admin A

SELECT t_ok('7a admin escreve coluna de cadastro (nome)',
  _upd_tenant('aaaaaaaa-0000-0000-0000-00000000000a'::uuid, 'nome', 'Academia A Renomeada'));
SELECT t_ok('7b admin escreve pix_chave (cadastro)',
  _upd_tenant('aaaaaaaa-0000-0000-0000-00000000000a'::uuid, 'pix_chave', 'pix@academia'));
SELECT t_ok('7c admin NAO escreve status (burla de paywall)',
  NOT _upd_tenant('aaaaaaaa-0000-0000-0000-00000000000a'::uuid, 'status', 'active'));
SELECT t_ok('7d admin NAO escreve ativo (desfazer suspensao do master)',
  NOT _upd_tenant('aaaaaaaa-0000-0000-0000-00000000000a'::uuid, 'ativo', 'true'));
SELECT t_ok('7e admin NAO escreve plan',
  NOT _upd_tenant('aaaaaaaa-0000-0000-0000-00000000000a'::uuid, 'plan', 'elite'));
SELECT t_ok('7f admin NAO escreve trial_ends_at',
  NOT _upd_tenant('aaaaaaaa-0000-0000-0000-00000000000a'::uuid, 'trial_ends_at', '2099-01-01'));
SELECT t_ok('7g admin NAO escreve stripe_customer_id',
  NOT _upd_tenant('aaaaaaaa-0000-0000-0000-00000000000a'::uuid, 'stripe_customer_id', 'cus_forjado'));

-- ===== #20 — profiles: usuario edita o proprio nome, NAO as permissoes =====
SELECT t_ok('7h usuario escreve o proprio nome_completo',
  _upd_profile('11111111-0000-0000-0000-000000000001'::uuid, 'nome_completo', 'Admin A II'));
RESET ROLE;

-- Recepcao restrita pelo admin (perfil 006 nasce com alunos ver:false)
SET request.jwt.claim.sub = '11111111-0000-0000-0000-000000000006'; SET ROLE authenticated;
SELECT t_ok('7i funcionario NAO reescreve as proprias permissions',
  NOT _upd_profile('11111111-0000-0000-0000-000000000006'::uuid, 'permissions', '{}'));
SELECT t_ok('7j funcionario NAO reescreve o proprio tenant_id',
  NOT _upd_profile('11111111-0000-0000-0000-000000000006'::uuid, 'tenant_id',
                   'bbbbbbbb-0000-0000-0000-00000000000b'));
-- a permissao restritiva continua de pe
SELECT t_ok('7k permissions da recepcao seguem restritas apos a tentativa',
  (SELECT permissions->'alunos'->>'ver' FROM profiles WHERE id='11111111-0000-0000-0000-000000000006') = 'false',
  'permissions='||(SELECT permissions::text FROM profiles WHERE id='11111111-0000-0000-0000-000000000006'));
RESET ROLE;

-- ===== service_role (webhook/master/staff) segue com escrita total =====
SET ROLE service_role;
SELECT t_ok('7l service_role escreve status (webhook do Stripe)',
  _upd_tenant('aaaaaaaa-0000-0000-0000-00000000000a'::uuid, 'status', 'active'));
SELECT t_ok('7m service_role escreve permissions (updateStaff)',
  _upd_profile('11111111-0000-0000-0000-000000000006'::uuid, 'permissions',
               '{"alunos":{"ver":true,"editar":true}}'));
RESET ROLE;

DROP FUNCTION _upd_tenant(uuid, text, text);
DROP FUNCTION _upd_profile(uuid, text, text);
