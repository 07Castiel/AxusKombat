-- ============================================================================
-- VERIFICACAO da ETAPA 3 — rode depois do HARDENING_7_APLICAR.sql
-- Somente leitura. Toda linha precisa vir OK.
-- ============================================================================

WITH
  fns AS (
    SELECT count(*)::int AS n FROM pg_proc
    WHERE proname IN ('dashboard_resumo', 'relatorio_periodo', 'master_excluir_tenant')
  ),
  -- A4 depende de as funcoes de painel NAO serem SECURITY DEFINER: se forem,
  -- ignoram RLS e passam a mostrar o faturamento inteiro para qualquer papel.
  definer_indevido AS (
    SELECT count(*)::int AS n FROM pg_proc
    WHERE proname IN ('dashboard_resumo', 'relatorio_periodo') AND prosecdef
  ),
  -- master_excluir_tenant, ao contrario, PRECISA ser SECURITY DEFINER.
  definer_correto AS (
    SELECT count(*)::int AS n FROM pg_proc
    WHERE proname = 'master_excluir_tenant' AND prosecdef
  ),
  exposicao AS (
    SELECT count(*)::int AS n
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE p.proname = 'master_excluir_tenant'
      AND r.rolname IN ('anon', 'authenticated')
  ),
  trigger_convite AS (
    SELECT count(*)::int AS n FROM pg_proc
    WHERE proname = 'handle_new_user' AND prosrc ILIKE '%skip_tenant%'
  ),
  painel AS (
    SELECT (public.dashboard_resumo() IS NOT NULL) AS ok
  )

SELECT  1 AS ord, 'A4/M12 - tres funcoes criadas' AS verificacao,
        n::text AS valor, CASE WHEN n = 3 THEN 'OK' ELSE 'FALHOU' END AS status FROM fns
UNION ALL SELECT 2, 'A4 - funcoes de painel NAO sao SECURITY DEFINER', n::text,
        CASE WHEN n = 0 THEN 'OK' ELSE 'FALHOU - VAZA FINANCEIRO' END FROM definer_indevido
UNION ALL SELECT 3, 'M12 - master_excluir_tenant e SECURITY DEFINER', n::text,
        CASE WHEN n = 1 THEN 'OK' ELSE 'FALHOU' END FROM definer_correto
UNION ALL SELECT 4, 'M12 - exclusao invisivel para anon/authenticated', n::text,
        CASE WHEN n = 0 THEN 'OK' ELSE 'FALHOU' END FROM exposicao
UNION ALL SELECT 5, 'M5 - trigger honra o convite de equipe', n::text,
        CASE WHEN n = 1 THEN 'OK' ELSE 'FALHOU' END FROM trigger_convite
UNION ALL SELECT 6, 'A4 - dashboard_resumo() responde para o seu usuario', ok::text,
        CASE WHEN ok THEN 'OK' ELSE 'FALHOU' END FROM painel
ORDER BY ord;
