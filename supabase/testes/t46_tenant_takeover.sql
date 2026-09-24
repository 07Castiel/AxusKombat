\echo ''
\echo '### ITEM 6 — tomada de conta de tenant via perfil autoinserido (issue #18)'

-- Helper: tenta inserir um profile como o papel atual (authenticated) e diz se
-- passou. SECURITY INVOKER (padrao) => o RLS e exercido de verdade. A violacao
-- de RLS chega como insufficient_privilege (42501) e e capturada, sem abortar a
-- transacao do teste.
CREATE OR REPLACE FUNCTION _tenta_inserir_profile(p_uid uuid, p_tenant uuid)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, tenant_id, nome_completo, email)
  VALUES (p_uid, p_tenant, 'Intruso', 'intruso@evil');
  RETURN true;   -- conseguiu inserir (ruim)
EXCEPTION WHEN OTHERS THEN
  RETURN false;  -- bloqueado pelo RLS (bom)
END $$;

-- A policy de INSERT foi removida: 'authenticated' nao tem mais caminho de
-- escrita em profiles. O cadastro cria o perfil pelo trigger (SECURITY DEFINER)
-- e o convite pelo createStaff (service_role) — nenhum passa por esta policy.
SELECT t_ok('6a policy profiles_insert_self removida',
  NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='public' AND tablename='profiles'
                AND policyname='profiles_insert_self'));

-- Atacante: usuario autenticado SEM perfil (o mesmo 33333333 usado no t45),
-- que e o estado de quem se cadastrou com skip_tenant. Tenta enfiar o proprio
-- perfil na academia A.
SET request.jwt.claim.sub = '33333333-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('6b atacante sem perfil NAO insere profile em tenant alheio (A)',
  NOT _tenta_inserir_profile('33333333-0000-0000-0000-000000000001'::uuid,
                             'aaaaaaaa-0000-0000-0000-00000000000a'::uuid));
RESET ROLE;

-- Admin de B tambem nao consegue plantar um perfil na academia A.
SET request.jwt.claim.sub = '22222222-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('6c admin de B NAO insere profile em tenant A',
  NOT _tenta_inserir_profile('99999999-0000-0000-0000-000000000099'::uuid,
                             'aaaaaaaa-0000-0000-0000-00000000000a'::uuid));
RESET ROLE;

-- Nenhuma das tentativas deixou linha para tras.
SELECT t_ok('6d nenhum perfil intruso entrou no banco',
  NOT EXISTS (SELECT 1 FROM profiles WHERE email='intruso@evil'));

DROP FUNCTION _tenta_inserir_profile(uuid, uuid);
