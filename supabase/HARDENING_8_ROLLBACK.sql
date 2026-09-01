-- ============================================================================
-- ROLLBACK da ETAPA 3 (HARDENING_7_APLICAR.sql)
--
-- NAO rode junto com a migration. Devolve o painel a agregacao no cliente
-- (com o truncamento em 1000 linhas), a exclusao de academia ao modo nao
-- transacional e o trigger de cadastro a versao de 28/06.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.dashboard_resumo();
DROP FUNCTION IF EXISTS public.relatorio_periodo(date, date);
DROP FUNCTION IF EXISTS public.master_excluir_tenant(uuid);

-- Versao de handle_new_user vigente antes da ETAPA 3, copiada da migration
-- 20260628212135 — nao reescrita de memoria.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tenant_id UUID;
  v_tenant_nome TEXT;
  v_tenant_slug TEXT;
  v_nome_responsavel TEXT;
  v_telefone TEXT;
  v_plan TEXT;
  v_plan_period TEXT;
  v_is_trial BOOLEAN;
  v_status TEXT;
  v_onboarding_completed BOOLEAN;
BEGIN
  v_tenant_nome := COALESCE(NEW.raw_user_meta_data->>'tenant_nome', 'Minha Academia');
  v_nome_responsavel := COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email);
  v_telefone := NEW.raw_user_meta_data->>'telefone';
  v_plan := NEW.raw_user_meta_data->>'plan';
  v_plan_period := NEW.raw_user_meta_data->>'plan_period';
  v_is_trial := COALESCE((NEW.raw_user_meta_data->>'is_trial')::boolean, false);

  -- Tenants criados via fluxo de billing chegam como 'pending'.
  -- Tenants criados sem plano (admin master, fluxos internos) continuam ativos.
  IF v_plan IS NOT NULL THEN
    v_status := 'pending';
    v_onboarding_completed := false;
  ELSE
    v_status := 'active';
    v_onboarding_completed := true;
  END IF;

  v_tenant_slug := lower(regexp_replace(v_tenant_nome, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.tenants (
    nome, slug, responsavel_nome, responsavel_email, telefone,
    status, plan, plan_period, is_trial, onboarding_completed
  )
  VALUES (
    v_tenant_nome, v_tenant_slug, v_nome_responsavel, NEW.email, v_telefone,
    v_status, v_plan, v_plan_period, v_is_trial, v_onboarding_completed
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, nome_completo, email, telefone)
  VALUES (NEW.id, v_tenant_id, v_nome_responsavel, NEW.email, v_telefone);

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, v_tenant_id, 'admin');

  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;
