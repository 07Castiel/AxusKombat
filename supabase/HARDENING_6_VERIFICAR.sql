-- ============================================================================
-- VERIFICACAO da ETAPA 2 — rode depois do HARDENING_4_APLICAR.sql
-- Somente leitura. Toda linha precisa vir OK.
-- ============================================================================

WITH
  fn AS (
    SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'assinatura_ativa'
  ),
  pol AS (
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'exige_assinatura_%'
  ),
  pol_select AS (
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'exige_assinatura_%'
      AND cmd = 'SELECT'
  ),
  tab AS (
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('master_login_attempts', 'stripe_webhook_events')
  ),
  vazamento AS (
    SELECT count(*)::int AS n FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('master_login_attempts', 'stripe_webhook_events')
      AND grantee IN ('anon', 'authenticated')
  ),
  eu_libero AS (
    SELECT count(*)::int AS n FROM public.tenants
    WHERE ativo AND status IN ('active', 'trialing')
  )

SELECT  1 AS ord, 'C6 - funcao assinatura_ativa criada' AS verificacao,
        n::text AS valor, CASE WHEN n = 1 THEN 'OK' ELSE 'FALHOU' END AS status FROM fn
UNION ALL SELECT 2, 'C6 - policies restritivas criadas (esperado 30)', n::text,
        CASE WHEN n = 30 THEN 'OK' ELSE 'FALHOU' END FROM pol
UNION ALL SELECT 3, 'C6 - nenhuma restricao sobre SELECT (leitura livre)', n::text,
        CASE WHEN n = 0 THEN 'OK' ELSE 'FALHOU' END FROM pol_select
UNION ALL SELECT 4, 'A6/M8 - tabelas de apoio criadas', n::text,
        CASE WHEN n = 2 THEN 'OK' ELSE 'FALHOU' END FROM tab
UNION ALL SELECT 5, 'A6/M8 - tabelas invisiveis para anon/authenticated', n::text,
        CASE WHEN n = 0 THEN 'OK' ELSE 'FALHOU' END FROM vazamento
UNION ALL SELECT 6, 'SANIDADE - academias que continuam podendo escrever', n::text,
        CASE WHEN n >= 1 THEN 'OK' ELSE 'ATENCAO - confira tenants.status' END FROM eu_libero
ORDER BY ord;
