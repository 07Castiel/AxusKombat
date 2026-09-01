-- ============================================================================
-- PREFLIGHT — semáforo antes da migration de hardening multi-tenant
--
-- SOMENTE LEITURA. Nenhum comando altera dado, schema ou policy.
--
-- Cole TUDO no SQL editor do Lovable (Cloud > SQL editor) e rode de uma vez.
-- Devolve uma única tabela. Me mande o print.
--
-- Regra de leitura:
--   status = OK            -> pode seguir
--   status = CORRIGIR      -> PARE. A migration tiraria acesso de alguém.
--   status = CONFIRMA      -> só confirma que o problema existe (esperado)
-- ============================================================================

WITH
  div AS (
    SELECT count(*)::int AS n
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE ur.tenant_id IS DISTINCT FROM p.tenant_id
  ),
  orfaos AS (
    SELECT count(*)::int AS n
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    WHERE p.id IS NULL
  ),
  multi AS (
    SELECT count(*)::int AS n FROM (
      SELECT user_id FROM public.user_roles
      GROUP BY user_id HAVING count(DISTINCT tenant_id) > 1
    ) t
  ),
  descontos AS (
    SELECT count(*)::int AS n FROM public.mensalidades WHERE desconto > valor
  ),
  fantasma AS (
    SELECT count(*)::int AS n FROM public.tenants WHERE nome = '__skip__'
  ),
  bucket AS (
    SELECT coalesce(bool_or(public), false) AS pub
    FROM storage.buckets WHERE id = 'fotos-alunos'
  ),
  arquivos AS (
    SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = 'fotos-alunos'
  ),
  pol_roles AS (
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname IN ('user_roles_insert_admin_only',
                         'user_roles_update_admin_only',
                         'user_roles_delete_admin_only')
  ),
  pol_roles_ok AS (
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname = 'roles_admin_all'
  ),
  pol_logs AS (
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('visitor_logs', 'system_logs')
  ),
  pol_prof AS (
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND cmd = 'UPDATE' AND with_check IS NULL
  ),
  hasrole_cego AS (
    SELECT count(*)::int AS n FROM pg_proc
    WHERE proname = 'has_role' AND prosrc NOT ILIKE '%profiles%'
  ),
  mens AS (SELECT count(*)::int AS n FROM public.mensalidades),
  notif_atrasadas AS (
    SELECT count(*)::int AS n FROM public.notificacoes
    WHERE status = 'agendada' AND agendada_para <= now()
  ),
  worker AS (
    SELECT coalesce(sum(sent), 0)::int AS enviadas,
           count(*)::int               AS execucoes
    FROM public.notification_worker_runs
    WHERE started_at > now() - interval '7 days'
  )

SELECT  1 AS ord, 'BLOQUEIA' AS tipo,
        'C3 · papel em tenant diferente do perfil' AS verificacao,
        n::text AS valor,
        CASE WHEN n = 0 THEN 'OK' ELSE 'CORRIGIR' END AS status FROM div
UNION ALL SELECT 2, 'BLOQUEIA',
        'C3 · papeis orfaos (usuario sem perfil)', n::text,
        CASE WHEN n = 0 THEN 'OK' ELSE 'CORRIGIR' END FROM orfaos
UNION ALL SELECT 3, 'ATENCAO',
        'C3 · usuarios com papel em mais de um tenant', n::text,
        CASE WHEN n = 0 THEN 'OK' ELSE 'CORRIGIR' END FROM multi
UNION ALL SELECT 4, 'BLOQUEIA',
        'M4 · mensalidades com desconto maior que o valor', n::text,
        CASE WHEN n = 0 THEN 'OK' ELSE 'CORRIGIR' END FROM descontos
UNION ALL SELECT 5, 'BLOQUEIA',
        'C4 · roles_admin_all existe? (a migration depende dela)', n::text,
        CASE WHEN n = 1 THEN 'OK' ELSE 'CORRIGIR' END FROM pol_roles_ok

UNION ALL SELECT 10, 'DIAGNOSTICO',
        'C2 · policy UPDATE em profiles sem WITH CHECK', n::text,
        CASE WHEN n > 0 THEN 'CONFIRMA' ELSE 'ja corrigido' END FROM pol_prof
UNION ALL SELECT 11, 'DIAGNOSTICO',
        'C3 · has_role ignora o tenant', n::text,
        CASE WHEN n > 0 THEN 'CONFIRMA' ELSE 'ja corrigido' END FROM hasrole_cego
UNION ALL SELECT 12, 'DIAGNOSTICO',
        'C4 · policies de user_roles sem escopo de tenant', n::text,
        CASE WHEN n > 0 THEN 'CONFIRMA' ELSE 'ja corrigido' END FROM pol_roles
UNION ALL SELECT 13, 'DIAGNOSTICO',
        'C5 · policies abertas em visitor_logs/system_logs', n::text,
        CASE WHEN n > 0 THEN 'CONFIRMA' ELSE 'ja corrigido' END FROM pol_logs
UNION ALL SELECT 14, 'DIAGNOSTICO',
        'M3 · bucket fotos-alunos publico', pub::text,
        CASE WHEN pub THEN 'CONFIRMA' ELSE 'ja corrigido' END FROM bucket
UNION ALL SELECT 15, 'DIAGNOSTICO',
        'M3 · arquivos no bucket (0 = ninguem usa)', n::text,
        CASE WHEN n = 0 THEN 'OK' ELSE 'revisar' END FROM arquivos
UNION ALL SELECT 16, 'DIAGNOSTICO',
        'M5 · academias fantasma (__skip__)', n::text,
        CASE WHEN n = 0 THEN 'OK' ELSE 'limpar depois' END FROM fantasma

UNION ALL SELECT 20, 'CONTEXTO',
        'A4 · total de mensalidades (>1000 = painel ja erra)', n::text,
        CASE WHEN n > 1000 THEN 'PAINEL ERRADO' ELSE 'ok por ora' END FROM mens
UNION ALL SELECT 21, 'CONTEXTO',
        'A1 · notificacoes agendadas ja vencidas', n::text,
        CASE WHEN n > 0 THEN 'FILA PARADA' ELSE 'fila limpa' END FROM notif_atrasadas
UNION ALL SELECT 22, 'CONTEXTO',
        'A1 · mensagens enviadas pelo worker em 7 dias', enviadas::text,
        CASE WHEN enviadas = 0 THEN 'NENHUMA ENVIADA' ELSE 'enviando' END FROM worker
UNION ALL SELECT 23, 'CONTEXTO',
        'A1 · execucoes do worker em 7 dias', execucoes::text,
        CASE WHEN execucoes = 0 THEN 'WORKER PARADO' ELSE 'rodando' END FROM worker

ORDER BY ord;


-- ============================================================================
-- SEGUNDA CONSULTA — rode separada, é a única que precisa de olho humano.
--
-- Mostra os jobs do pg_cron. Preciso da URL e do formato do header para
-- montar o comando novo com CRON_SECRET (achado C1).
--
-- ATENÇÃO: a chave anon aparece em texto claro na coluna `command`.
-- Pode mascarar antes de me mandar — o que importa é a URL e a estrutura.
-- ============================================================================

-- SELECT jobid, jobname, schedule, active, command FROM cron.job ORDER BY jobid;


-- ============================================================================
-- SÓ SE ALGUM 'BLOQUEIA' VOLTAR 'CORRIGIR' — detalhamento para eu ajustar
-- ============================================================================

-- Linha 1 — quem está com papel em tenant divergente:
-- SELECT p.id, p.email, p.tenant_id AS tenant_perfil,
--        ur.tenant_id AS tenant_papel, ur.role
-- FROM public.profiles p
-- JOIN public.user_roles ur ON ur.user_id = p.id
-- WHERE ur.tenant_id IS DISTINCT FROM p.tenant_id;

-- Linha 4 — mensalidades com desconto maior que o valor:
-- SELECT id, tenant_id, competencia, valor, desconto, valor_final, status
-- FROM public.mensalidades WHERE desconto > valor;
