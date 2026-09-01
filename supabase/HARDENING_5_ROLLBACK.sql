-- ============================================================================
-- ROLLBACK da ETAPA 2 (HARDENING_4_APLICAR.sql)
--
-- NAO rode junto com a migration. E o desfazer, para o caso de alguma tela
-- parar de salvar depois de aplicar.
--
-- Derruba o paywall do banco e devolve a escrita a quem esta com assinatura
-- pendente ou expirada. As duas tabelas de apoio ficam: sao inertes e nao
-- atrapalham nada.
-- ============================================================================

BEGIN;

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
    EXECUTE format('DROP POLICY IF EXISTS exige_assinatura_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS exige_assinatura_delete ON public.%I', t);
  END LOOP;
END $$;

COMMIT;
