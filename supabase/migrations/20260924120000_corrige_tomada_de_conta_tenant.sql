-- ============================================================================
-- Corrige a tomada de conta de outra academia via perfil autoinserido.
-- Issue: #18 (Segurança / isolamento de inquilino).
--
-- Duas raízes fechadas aqui:
--
--   1) PRIMÁRIA — a policy profiles_insert_self deixava qualquer usuário
--      'authenticated' inserir a própria linha em profiles (WITH CHECK só exigia
--      id = auth.uid()), SEM amarrar tenant_id. Combinada com a flag skip_tenant
--      no signUp público (que faz o trigger não criar perfil, deixando a PK
--      livre), o atacante inseria o próprio perfil apontando para o tenant_id de
--      qualquer vítima e passava a operar dentro da academia dela.
--
--      Nenhum fluxo legítimo precisa desse INSERT pelo cliente: o cadastro cria
--      o perfil pelo trigger handle_new_user (SECURITY DEFINER, dono da tabela,
--      não sujeito a esta policy) e o convite de equipe cria pelo createStaff,
--      que usa a service_role (ignora RLS). Então a policy é simplesmente
--      removida — sem ela, 'authenticated' não tem caminho de INSERT em profiles.
--
--   2) DEFESA EM PROFUNDIDADE — o trigger honrava skip_tenant lido de
--      raw_user_meta_data, que o signUp público controla (options.data). Passa a
--      ler de raw_app_meta_data, que só a service_role escreve (createUser com
--      app_metadata). Assim um signUp público com skip_tenant no metadata é
--      ignorado e o usuário recebe uma academia própria normal, em vez de uma
--      conta órfã sem tenant. O par em TypeScript é createStaff em
--      src/lib/staff.functions.ts, que passa a mandar { app_metadata: { skip_tenant } }.
--
-- Ordem em produção: as migrations são aplicadas por timestamp, então esta (a
-- mais nova) é a definição final de handle_new_user e do conjunto de policies.
-- ============================================================================

BEGIN;

-- 1) PRIMÁRIA: fecha o INSERT de profiles pelo cliente.
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;

-- 2) DEFESA EM PROFUNDIDADE: skip_tenant deixa de vir de campo controlado pelo
--    usuário final. Corpo idêntico ao de 20260902140522 (teste de 14 dias no
--    nascimento da conta), trocando apenas a fonte de skip_tenant.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_tenant_nome TEXT;
  v_tenant_slug TEXT;
  v_nome_responsavel TEXT;
  v_telefone TEXT;
  v_plan TEXT;
  v_plan_period TEXT;
BEGIN
  -- Convite de equipe: só a service_role escreve raw_app_meta_data (createStaff
  -- passa app_metadata). O signUp público não alcança este campo, então não
  -- consegue mais pular a criação da academia.
  IF COALESCE((NEW.raw_app_meta_data->>'skip_tenant')::boolean, false) THEN
    RETURN NEW;
  END IF;

  v_tenant_nome := COALESCE(NEW.raw_user_meta_data->>'tenant_nome', 'Minha Academia');
  v_nome_responsavel := COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email);
  v_telefone := NEW.raw_user_meta_data->>'telefone';
  v_plan := NEW.raw_user_meta_data->>'plan';
  v_plan_period := NEW.raw_user_meta_data->>'plan_period';

  v_tenant_slug := lower(regexp_replace(v_tenant_nome, '[^a-zA-Z0-9]+', '-', 'g'))
                   || '-' || substr(NEW.id::text, 1, 8);

  -- Toda conta nova entra em teste gratuito de 14 dias. Sem cartao, sem Stripe.
  INSERT INTO public.tenants (
    nome, slug, responsavel_nome, responsavel_email, telefone,
    status, plan, plan_period, is_trial, trial_ends_at, onboarding_completed
  )
  VALUES (
    v_tenant_nome, v_tenant_slug, v_nome_responsavel, NEW.email, v_telefone,
    'trialing', COALESCE(v_plan, 'pro'), COALESCE(v_plan_period, 'monthly'),
    true, now() + interval '14 days', false
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, nome_completo, email, telefone)
  VALUES (NEW.id, v_tenant_id, v_nome_responsavel, NEW.email, v_telefone);

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, v_tenant_id, 'admin');

  RETURN NEW;
END $function$;

-- CREATE OR REPLACE preserva as ACLs, mas reafirmamos o revoke das migrations
-- anteriores para o caso de a função ter sido recriada por fora.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;
