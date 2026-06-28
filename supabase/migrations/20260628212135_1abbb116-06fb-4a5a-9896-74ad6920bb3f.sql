
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan TEXT,
  ADD COLUMN IF NOT EXISTS plan_period TEXT,
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check CHECK (status IN ('pending','trialing','active','trial_expired'));

CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer_id ON public.tenants(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_subscription_id ON public.tenants(stripe_subscription_id);

-- Refactor trigger to read plan metadata and mark new tenants as pending
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
