-- ============================================================================
-- HARDENING — ETAPA 4 (A3: fila sem corrida)
--
-- Rode depois da ETAPA 3.
--
-- PROBLEMA: o worker seleciona status='agendada' e so grava o status novo
-- DEPOIS do envio. O cron dispara a cada 15 minutos e cada rodada faz ate 180
-- chamadas HTTP com timeout de 20 s. Duas execucoes sobrepostas leem as mesmas
-- linhas e o aluno recebe a mesma cobranca duas vezes.
--
-- POR QUE UMA COLUNA E NAO UM VALOR NOVO NO ENUM:
--   1. ALTER TYPE ... ADD VALUE nao pode ter o valor usado na mesma transacao,
--      o que obrigaria a partir a migration em duas.
--   2. Um status 'enviando' apareceria em toda consulta que filtra por status —
--      historico, contadores de saude, limpeza da janela — e cada uma teria de
--      ser revisada. Coluna e puramente aditiva: quem nao sabe dela continua
--      funcionando igual.
--
-- Um BEGIN, um COMMIT. Nao altera nenhuma linha de dado de negocio.
-- Desfazer: HARDENING_11_ROLLBACK.sql
-- ============================================================================

BEGIN;

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS reivindicado_em timestamptz;

-- Indice parcial: so as linhas efetivamente reivindicadas entram.
CREATE INDEX IF NOT EXISTS idx_notificacoes_reivindicadas
  ON public.notificacoes (reivindicado_em)
  WHERE reivindicado_em IS NOT NULL;


-- ----------------------------------------------------------------------------
-- Reivindica um lote para uma unica execucao do worker.
--
-- FOR UPDATE SKIP LOCKED e o que impede duas execucoes de pegarem a mesma
-- linha: a segunda simplesmente pula o que a primeira travou, em vez de
-- esperar ou duplicar.
--
-- Reivindicacao parada ha mais de p_expira_min e considerada abandonada (o
-- Worker morreu no meio) e volta a ficar disponivel. Sem isso, uma queda
-- deixaria a mensagem presa para sempre.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reivindicar_notificacoes(
  p_tenant            uuid DEFAULT NULL,
  p_limite_agendadas  int  DEFAULT 120,
  p_limite_retry      int  DEFAULT 60,
  p_max_tentativas    int  DEFAULT 5,
  p_expira_min        int  DEFAULT 15
)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Libera o que ficou preso de uma execucao anterior.
  UPDATE public.notificacoes
     SET reivindicado_em = NULL
   WHERE reivindicado_em IS NOT NULL
     AND reivindicado_em < now() - make_interval(mins => p_expira_min);

  RETURN QUERY
  WITH disponiveis AS (
    (
      SELECT id
        FROM public.notificacoes
       WHERE status = 'agendada'
         AND agendada_para <= now()
         AND reivindicado_em IS NULL
         AND (p_tenant IS NULL OR tenant_id = p_tenant)
       ORDER BY agendada_para
       LIMIT p_limite_agendadas
       FOR UPDATE SKIP LOCKED
    )
    UNION ALL
    (
      SELECT id
        FROM public.notificacoes
       WHERE status = 'falhou'
         AND tentativas < p_max_tentativas
         AND proxima_tentativa IS NOT NULL
         AND proxima_tentativa <= now()
         AND reivindicado_em IS NULL
         AND (p_tenant IS NULL OR tenant_id = p_tenant)
       ORDER BY proxima_tentativa
       LIMIT p_limite_retry
       FOR UPDATE SKIP LOCKED
    )
  )
  UPDATE public.notificacoes n
     SET reivindicado_em = now()
    FROM disponiveis d
   WHERE n.id = d.id
  RETURNING n.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reivindicar_notificacoes(uuid, int, int, int, int)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reivindicar_notificacoes(uuid, int, int, int, int)
  TO service_role;

COMMIT;
