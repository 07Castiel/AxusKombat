-- ============================================================================
-- POS-BACKUP 3 — REGISTRAR AS MIGRATIONS 0002 E 0003 DO DRIZZLE
--
-- POR QUE: drizzle.__drizzle_migrations registra so a 0000 e a 0001, mas o
-- banco ja tem o efeito das quatro: alunos.portal_token nao existe mais (0002)
-- e as 65 matriculas ja tem 6 digitos (0003). As duas foram aplicadas a mao no
-- editor. O drizzle-kit decide o que rodar pela ultima linha registrada, entao
-- um `drizzle-kit migrate` executaria a 0002 e a 0003 de novo. A 0003 original
-- sorteava matricula nova para TODOS os alunos.
--
-- A 0003 do repositorio ja foi reescrita para nao mexer em quem tem 6 digitos.
-- Registrar as duas aqui e a segunda trava: o drizzle-kit passa a pular as duas.
--
-- Os INSERTs so gravam se o efeito da migration estiver de fato no banco, e nao
-- duplicam se rodados duas vezes. Os hashes sao o sha256 de cada arquivo em
-- drizzle/migrations, como o drizzle-kit calcula.
--
-- Cada PASSO e um comando so. Cole um de cada vez no editor SQL.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASSO 1 — VER o registro atual. Esperado hoje: 2 linhas.
-- ----------------------------------------------------------------------------
SELECT id, left(hash, 12) AS hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;


-- ----------------------------------------------------------------------------
-- PASSO 2 — registrar a 0002. So grava se alunos.portal_token ja nao existe.
-- ----------------------------------------------------------------------------
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) SELECT 'a1acd689204bf29237fc8515832ab28f5985add870ecec26ea4d77b8a53ea9f2', 1789218959523 WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = 1789218959523) AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'alunos' AND column_name = 'portal_token');


-- ----------------------------------------------------------------------------
-- PASSO 3 — registrar a 0003. So grava se toda matricula ja tem 6 digitos.
-- ----------------------------------------------------------------------------
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) SELECT 'a7e5eb588f294636a581a31539adfc00c2e8a96d75e6cfa0d5854ac40cc4eca1', 1789223400000 WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = 1789223400000) AND NOT EXISTS (SELECT 1 FROM public.aluno_credenciais WHERE matricula !~ '^[1-9][0-9]{5}$');


-- ----------------------------------------------------------------------------
-- PASSO 4 — CONFERIR. Esperado: 4 linhas, a ultima com created_at 1789223400000.
-- Se vier 3 linhas, o PASSO 3 nao gravou porque ainda ha matricula fora do
-- formato: rode drizzle/migrations/0003_matricula_numerica.sql (a versao nova,
-- que so converte essas) e repita o PASSO 3.
-- ----------------------------------------------------------------------------
SELECT id, left(hash, 12) AS hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;
