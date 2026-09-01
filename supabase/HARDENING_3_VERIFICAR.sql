-- ============================================================================
-- VERIFICAÇÃO — rode DEPOIS do HARDENING_1_APLICAR.sql
--
-- Somente leitura. Devolve uma tabela única: toda linha precisa vir com
-- status OK. Qualquer FALHOU significa que a migration não pegou por
-- completo — nesse caso rode o HARDENING_2_ROLLBACK.sql e me avise.
-- ============================================================================

WITH
  hasrole AS (
    SELECT count(*)::int AS n FROM pg_proc
    WHERE proname = 'has_role' AND prosrc ILIKE '%profiles%'
  ),
  prof AS (
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND cmd = 'UPDATE' AND with_check IS NOT NULL
  ),
  roles_ruins AS (
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname IN ('user_roles_insert_admin_only',
                         'user_roles_update_admin_only',
                         'user_roles_delete_admin_only')
  ),
  roles_boa AS (
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname = 'roles_admin_all'
  ),
  logs AS (
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('visitor_logs', 'system_logs')
  ),
  bucket AS (
    SELECT coalesce(bool_or(public), false) AS pub
    FROM storage.buckets WHERE id = 'fotos-alunos'
  ),
  constr AS (
    SELECT count(*)::int AS n FROM pg_constraint
    WHERE conname = 'mensalidades_desconto_lte_valor'
  ),
  admins AS (
    SELECT count(*)::int AS n
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id AND p.tenant_id = ur.tenant_id
    WHERE ur.role = 'admin'
  )

SELECT  1 AS ord, 'C3 · has_role agora exige tenant casado' AS verificacao,
        n::text AS valor,
        CASE WHEN n = 1 THEN 'OK' ELSE 'FALHOU' END AS status FROM hasrole
UNION ALL SELECT 2, 'C2 · policy UPDATE de profiles tem WITH CHECK', n::text,
        CASE WHEN n >= 1 THEN 'OK' ELSE 'FALHOU' END FROM prof
UNION ALL SELECT 3, 'C4 · policies sem escopo removidas', n::text,
        CASE WHEN n = 0 THEN 'OK' ELSE 'FALHOU' END FROM roles_ruins
UNION ALL SELECT 4, 'C4 · roles_admin_all continua no lugar', n::text,
        CASE WHEN n = 1 THEN 'OK' ELSE 'FALHOU' END FROM roles_boa
UNION ALL SELECT 5, 'C5 · logs fechados para authenticated', n::text,
        CASE WHEN n = 0 THEN 'OK' ELSE 'FALHOU' END FROM logs
UNION ALL SELECT 6, 'M3 · bucket de fotos privado', pub::text,
        CASE WHEN NOT pub THEN 'OK' ELSE 'FALHOU' END FROM bucket
UNION ALL SELECT 7, 'M4 · constraint de desconto criada', n::text,
        CASE WHEN n = 1 THEN 'OK' ELSE 'FALHOU' END FROM constr
UNION ALL SELECT 8, 'SANIDADE · admins que continuam validos', n::text,
        CASE WHEN n >= 1 THEN 'OK' ELSE 'FALHOU — RODE O ROLLBACK' END FROM admins

ORDER BY ord;
