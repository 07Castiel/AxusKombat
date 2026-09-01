-- ============================================================================
-- ROLLBACK da ETAPA 4 (HARDENING_10_APLICAR.sql)
--
-- Devolve a fila ao modo sem reivindicacao — volta a existir a chance de duas
-- execucoes do worker enviarem a mesma mensagem.
--
-- A coluna reivindicado_em e mantida de proposito: derruba-la exigiria que o
-- codigo em producao ja nao a mencionasse. Deixe o rollback do banco e do
-- codigo em ordens opostas e voce quebra o worker.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.reivindicar_notificacoes(uuid, int, int, int, int);

UPDATE public.notificacoes SET reivindicado_em = NULL WHERE reivindicado_em IS NOT NULL;

COMMIT;
