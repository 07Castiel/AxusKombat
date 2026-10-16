-- ============================================================================
-- POS-BACKUP 1 — DERRUBAR TODAS AS SESSOES DE LOGIN
--
-- POR QUE: o backup de 11/10/2026 (e qualquer export completo do banco) leva
-- auth.refresh_tokens em texto puro. Quem tem o arquivo troca um desses tokens
-- por uma sessao valida e entra como o usuario, inclusive o admin, sem senha.
-- O arquivo saiu do ambiente controlado; apagar as sessoes inutiliza os tokens
-- que estao nele.
--
-- EFEITO: todo mundo (4 usuarios) precisa entrar de novo com e-mail e senha.
-- Nenhuma senha muda e nenhum dado de negocio e tocado. O token de acesso que
-- ja estiver aberto num navegador continua valendo ate expirar (em geral 1 hora).
--
-- Cada PASSO e um comando so. Cole um de cada vez no editor SQL.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASSO 1 — VER as sessoes abertas por usuario. Nada e alterado aqui.
-- ----------------------------------------------------------------------------
SELECT u.email, count(s.id) AS sessoes, max(s.refreshed_at) AS ultimo_uso FROM auth.users u LEFT JOIN auth.sessions s ON s.user_id = u.id GROUP BY u.email ORDER BY u.email;


-- ----------------------------------------------------------------------------
-- PASSO 2 — APAGAR as sessoes. auth.refresh_tokens e auth.mfa_amr_claims
-- apontam para auth.sessions com ON DELETE CASCADE e caem junto.
-- ----------------------------------------------------------------------------
DELETE FROM auth.sessions;


-- ----------------------------------------------------------------------------
-- PASSO 3 — CONFERIR. Esperado: sessoes = 0 e refresh_tokens = 0.
-- Se voce ja entrou de novo no app, vai aparecer 1 de cada: e a sua sessao nova.
-- ----------------------------------------------------------------------------
SELECT (SELECT count(*) FROM auth.sessions) AS sessoes, (SELECT count(*) FROM auth.refresh_tokens) AS refresh_tokens;
