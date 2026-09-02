-- 1) Trial de 14 dias no nascimento da conta, decidido pelo banco.
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
  IF COALESCE((NEW.raw_user_meta_data->>'skip_tenant')::boolean, false) THEN
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

-- 2) Rede de seguranca: trial_ends_at nunca nulo em conta de teste.
CREATE OR REPLACE FUNCTION public.tg_tenant_trial_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'trialing' AND NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := now() + interval '14 days';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_tenant_trial_defaults ON public.tenants;
CREATE TRIGGER tg_tenant_trial_defaults
BEFORE INSERT OR UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tg_tenant_trial_defaults();

-- 3) Migra quem estava preso em 'pending' para o teste gratuito.
UPDATE public.tenants
   SET status = 'trialing',
       is_trial = true,
       trial_ends_at = COALESCE(trial_ends_at, now() + interval '14 days')
 WHERE status = 'pending';

UPDATE public.tenants
   SET status = 'expired'
 WHERE status = 'trial_expired';

-- 4) Verificacao central de assinatura.
CREATE OR REPLACE FUNCTION public.tenant_liberado(_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = _tenant_id
      AND t.ativo IS NOT FALSE
      AND (
        t.status IN ('active', 'past_due')
        OR (t.status = 'trialing' AND COALESCE(t.trial_ends_at, now()) > now())
      )
  )
$function$;

REVOKE ALL ON FUNCTION public.tenant_liberado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_liberado(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assinatura_ativa()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.tenant_liberado(public.get_current_tenant())
$function$;

REVOKE ALL ON FUNCTION public.assinatura_ativa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assinatura_ativa() TO authenticated, service_role;

-- 5) Bloqueio de ESCRITA no servidor (leitura permanece livre).
CREATE OR REPLACE FUNCTION public.tg_exigir_assinatura_ativa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_status text;
  v_ativo  boolean;
BEGIN
  -- Rotinas internas (service_role / cron / SECURITY DEFINER sem usuario) passam.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL OR public.tenant_liberado(v_tenant) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT t.status, t.ativo INTO v_status, v_ativo FROM public.tenants t WHERE t.id = v_tenant;

  IF v_ativo IS FALSE THEN
    RAISE EXCEPTION 'Esta academia está suspensa. Fale com o suporte para reativar o acesso.';
  END IF;

  RAISE EXCEPTION 'Seu período de teste terminou. Escolha um plano para continuar usando o sistema.';
END $function$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'alunos','contratos','mensalidades','despesas','presencas',
    'planos','modalidades','graduacoes','horarios','historico_graduacoes'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_exigir_assinatura ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER tg_exigir_assinatura BEFORE INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.tg_exigir_assinatura_ativa()', t);
  END LOOP;
END $$;