-- ============================================================================
-- Mensalidade cancelada não gera mais cobrança no WhatsApp.
--
-- O gatilho tg_mensalidade_notificacoes só esvaziava a fila quando a
-- mensalidade era PAGA. Cancelar a mensalidade (cancelarContrato no app, ou à
-- mão) deixava as notificações 'agendada' de pé, e o worker não confere o
-- status da mensalidade antes de enviar. No backup de 11/10/2026 há uma
-- cobrança de vencimento enviada às 12h para uma mensalidade cancelada às 03h56
-- do mesmo dia.
--
-- Três mudanças:
--   1. O gatilho trata 'cancelado' como trata 'pago': cancela a fila. E volta a
--      agendar quando a mensalidade sai de 'cancelado' para 'pendente', do
--      mesmo jeito que já fazia no estorno de um pagamento.
--   2. cancelar_notificacoes_mensalidade passa a pegar também as falhas que o
--      worker ainda vai retentar ('falhou' com proxima_tentativa). Antes só
--      pegava 'agendada', e uma falha de envio continuava na fila de
--      retentativa depois de a mensalidade ser paga ou cancelada.
--   3. Cancela o que já está na fila hoje para mensalidades pagas ou canceladas.
--
-- Não toca em 'vencido': o aviso de atraso tem de continuar saindo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.cancelar_notificacoes_mensalidade(p_mensalidade_id uuid, p_motivo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.notificacoes
     SET status = 'cancelada',
         motivo_cancelamento = p_motivo,
         proxima_tentativa = NULL,
         updated_at = now()
   WHERE mensalidade_id = p_mensalidade_id
     AND (status = 'agendada'
          OR (status = 'falhou' AND proxima_tentativa IS NOT NULL));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.cancelar_notificacoes_mensalidade(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_mensalidade_notificacoes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pendente' THEN
      PERFORM public.agendar_notificacoes_mensalidade(NEW.id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento THEN
      PERFORM public.cancelar_notificacoes_mensalidade(
        NEW.id, 'O vencimento foi alterado. As notificações antigas foram removidas.'
      );
      IF NEW.status = 'pendente' THEN
        PERFORM public.agendar_notificacoes_mensalidade(NEW.id);
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'pago' THEN
        PERFORM public.cancelar_notificacoes_mensalidade(NEW.id, 'Mensalidade paga.');
      ELSIF NEW.status = 'cancelado' THEN
        PERFORM public.cancelar_notificacoes_mensalidade(NEW.id, 'Mensalidade cancelada.');
      ELSIF OLD.status IN ('pago', 'cancelado') AND NEW.status = 'pendente' THEN
        PERFORM public.agendar_notificacoes_mensalidade(NEW.id);
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.cancelar_notificacoes_mensalidade(OLD.id, 'Mensalidade removida.');
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.tg_mensalidade_notificacoes() FROM PUBLIC, anon, authenticated;

-- O que já está na fila para mensalidade que não deve mais ser cobrada.
SELECT public.cancelar_notificacoes_mensalidade(
         m.id,
         CASE WHEN m.status = 'pago' THEN 'Mensalidade paga.' ELSE 'Mensalidade cancelada.' END)
  FROM public.mensalidades m
 WHERE m.status IN ('pago', 'cancelado')
   AND EXISTS (
     SELECT 1 FROM public.notificacoes n
      WHERE n.mensalidade_id = m.id
        AND (n.status = 'agendada' OR (n.status = 'falhou' AND n.proxima_tentativa IS NOT NULL)));

COMMIT;
