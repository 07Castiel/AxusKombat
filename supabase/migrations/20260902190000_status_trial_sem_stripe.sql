-- Fecha o desacoplamento entre o teste gratuito e o Stripe.
--
-- A migração anterior (20260902140522) passou a gravar 'expired' e a tratar
-- 'pending' como teste, mas o CHECK da tabela continuava preso ao vocabulário
-- antigo: CHECK (status IN ('pending','trialing','active','trial_expired')).
-- Enquanto ele existir, todo UPDATE para 'expired', 'past_due' ou 'canceled' é
-- rejeitado pelo banco — inclusive os do webhook do Stripe, que não checa o
-- erro do update e falharia em silêncio.

-- 1) Normaliza o que sobrou do modelo antigo antes de apertar a regra.
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;

UPDATE public.tenants
   SET status = 'trialing',
       is_trial = true,
       trial_ends_at = COALESCE(trial_ends_at, now() + interval '14 days')
 WHERE status = 'pending';

UPDATE public.tenants
   SET status = 'expired'
 WHERE status = 'trial_expired';

-- Teste sem data de término é ambíguo: o app lê como "ainda vale" e o banco,
-- como "já venceu". Dando data a todos, a ambiguidade some.
UPDATE public.tenants
   SET trial_ends_at = now() + interval '14 days'
 WHERE status = 'trialing'
   AND trial_ends_at IS NULL;

-- 2) Vocabulário novo.
--    trialing  = teste de 14 dias em andamento (sem Stripe)
--    active    = assinatura paga em dia
--    past_due  = pagamento atrasado; acesso segue liberado
--    canceled  = assinatura encerrada no Stripe
--    expired   = teste terminou sem assinatura
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired'));

-- 3) Conta em teste não tem cadastro no Stripe. Explicitamente opcionais.
ALTER TABLE public.tenants
  ALTER COLUMN stripe_customer_id DROP NOT NULL,
  ALTER COLUMN stripe_subscription_id DROP NOT NULL;

-- 4) Alinha tenant_liberado() ao que o app calcula.
--    O COALESCE anterior transformava trial_ends_at nulo em `now() > now()`,
--    ou seja, bloqueado — enquanto _app.tsx e lerSituacaoTenant() liberavam.
--    A conta ficava navegável e toda escrita estourava exceção no banco.
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
        OR (t.status = 'trialing' AND (t.trial_ends_at IS NULL OR t.trial_ends_at > now()))
      )
  )
$function$;

REVOKE ALL ON FUNCTION public.tenant_liberado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_liberado(uuid) TO authenticated, service_role;
