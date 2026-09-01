-- ============================================================================
-- HARDENING — ETAPA 2
--
-- Rode SÓ depois que a ETAPA 1 (HARDENING_1_APLICAR.sql) estiver aplicada e
-- verificada, e depois que o código desta branch estiver em producao.
--
-- Fecha C6 (paywall no banco) e cria as duas tabelas de apoio de A6 e M8.
--
-- Um BEGIN, um COMMIT. Nenhum comando altera linha de dado de negocio.
-- O desfazer esta em HARDENING_5_ROLLBACK.sql. A conferencia em
-- HARDENING_6_VERIFICAR.sql.
-- ============================================================================

BEGIN;


-- ============================================================================
-- C6 — paywall no banco
--
-- O middleware de assinatura que entrou no TypeScript cobre as server
-- functions, mas nao alcanca metade do sistema: alunos, planos, modalidades,
-- horarios, graduacoes e historico_graduacoes sao escritos DIRETO do navegador
-- pelo supabase-js. Quem ignorar o redirect de /precos continua operando.
--
-- O RLS e a unica camada por onde os dois caminhos passam.
--
-- Regra: bloqueia ESCRITA, libera LEITURA. Quem deixou de pagar continua
-- enxergando e exportando os proprios dados. Reter dado de cliente como
-- alavanca de cobranca e pratica ruim e problema de LGPD.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assinatura_ativa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = public.get_current_tenant()
      AND t.ativo
      AND t.status IN ('active', 'trialing')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.assinatura_ativa() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.assinatura_ativa() TO authenticated;

-- Policies RESTRICTIVE sao combinadas com AND sobre as permissivas que ja
-- existem. Assim nenhuma policy atual precisa ser reescrita — e o rollback e
-- so derrubar estas. Note que nao ha versao FOR SELECT: a leitura continua
-- exatamente como esta hoje.
--
-- service_role ignora RLS por completo, entao o worker de notificacoes, os
-- hooks de cron e tudo que usa supabaseAdmin seguem funcionando.

DO $$
DECLARE
  t text;
  alvos text[] := ARRAY[
    'alunos', 'planos', 'modalidades', 'horarios', 'graduacoes',
    'historico_graduacoes', 'contratos', 'mensalidades', 'despesas', 'presencas'
  ];
BEGIN
  FOREACH t IN ARRAY alvos LOOP
    EXECUTE format('DROP POLICY IF EXISTS exige_assinatura_insert ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY exige_assinatura_insert ON public.%I AS RESTRICTIVE '
      'FOR INSERT TO authenticated WITH CHECK (public.assinatura_ativa())', t);

    EXECUTE format('DROP POLICY IF EXISTS exige_assinatura_update ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY exige_assinatura_update ON public.%I AS RESTRICTIVE '
      'FOR UPDATE TO authenticated USING (public.assinatura_ativa()) '
      'WITH CHECK (public.assinatura_ativa())', t);

    EXECUTE format('DROP POLICY IF EXISTS exige_assinatura_delete ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY exige_assinatura_delete ON public.%I AS RESTRICTIVE '
      'FOR DELETE TO authenticated USING (public.assinatura_ativa())', t);
  END LOOP;
END $$;


-- ============================================================================
-- A6 — tentativas de login no painel mestre
--
-- masterLogin da acesso a TODAS as academias e nao tinha nenhum freio: era
-- forca bruta aberta. Esta tabela e a contagem por IP dentro da janela.
--
-- Ninguem alem do service_role enxerga: RLS ligada e nenhuma policy criada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.master_login_attempts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip         text NOT NULL,
  sucesso    boolean NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_login_ip_janela
  ON public.master_login_attempts (ip, criado_em DESC)
  WHERE sucesso = false;

ALTER TABLE public.master_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.master_login_attempts FROM anon, authenticated;
GRANT  ALL ON public.master_login_attempts TO service_role;


-- ============================================================================
-- M8 — eventos ja processados do Stripe
--
-- O Stripe reentrega quando nao recebe 200 rapido o bastante, e nao garante
-- ordem. Sem registro, a mesma cobranca era processada duas vezes e um
-- subscription.updated atrasado podia reativar assinatura ja cancelada.
--
-- A chave primaria em event_id faz o de-dupe; event_created sustenta a guarda
-- de ordem por cliente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id       text PRIMARY KEY,
  event_type     text NOT NULL,
  event_created  timestamptz NOT NULL,
  customer_id    text,
  processed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_cliente
  ON public.stripe_webhook_events (customer_id, event_created DESC)
  WHERE customer_id IS NOT NULL;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;
GRANT  ALL ON public.stripe_webhook_events TO service_role;


COMMIT;
