-- ============================================================================
-- POS-BACKUP 5 — CONFERENCIAS QUE PEDEM DECISAO SUA
--
-- Somente leitura: nenhum comando daqui altera nada. Cada um responde uma
-- pergunta que o backup de 11/10/2026 levantou e que precisa de alguem que
-- conhece a academia para fechar. O que fazer com cada resposta esta em
-- supabase/POS_BACKUP_LEIA-ME.md.
--
-- Cada consulta e um comando so. Cole uma de cada vez no editor SQL.
-- ============================================================================


-- 1. Alunos com matricula e sem data de nascimento. O login do portal pede as
--    duas, entao eles nao conseguem entrar. Esperado hoje: 2 linhas.
SELECT a.nome_completo, t.nome AS academia, a.status FROM public.alunos a JOIN public.tenants t ON t.id = a.tenant_id JOIN public.aluno_credenciais c ON c.aluno_id = a.id WHERE a.data_nascimento IS NULL ORDER BY t.nome, a.nome_completo;


-- 2. Usuarios que fazem login mas nao tem perfil nem papel em academia
--    nenhuma. Esperado hoje: 1 linha.
SELECT u.email, u.created_at::date AS criado, u.last_sign_in_at::date AS ultimo_login FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id) AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id);


-- 3. Academias sem nenhum usuario. Esperado hoje: 4 linhas (a congelada pelo
--    POS_BACKUP_4 e mais 3 vazias).
SELECT t.nome, t.status, t.ativo, t.created_at::date AS criada, (SELECT count(*) FROM public.alunos a WHERE a.tenant_id = t.id) AS alunos, t.stripe_customer_id IS NOT NULL AS tem_cliente_stripe, t.stripe_subscription_id IS NOT NULL AS tem_assinatura_stripe FROM public.tenants t WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.tenant_id = t.id) ORDER BY t.created_at;


-- 4. O papel sandbox_exec, que nao e padrao do Supabase. Ele tem SELECT em
--    auth.users, auth.sessions e auth.refresh_tokens. O que importa e se ele
--    pode fazer login e se ignora RLS.
SELECT rolname, rolcanlogin, rolbypassrls, rolsuper, rolvaliduntil FROM pg_roles WHERE rolname = 'sandbox_exec';


-- 5. Copias completas do banco guardadas no Storage de producao.
SELECT bucket_id, name, created_at, (metadata ->> 'size')::bigint AS bytes FROM storage.objects WHERE bucket_id LIKE 'database_export_%' ORDER BY created_at;
