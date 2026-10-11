\echo ''
\echo '### ITEM 9 — mensalidade cancelada esvazia a fila do WhatsApp'

BEGIN;

-- Mensalidade nova, vencendo daqui a 10 dias: o gatilho agenda o lembrete de
-- 2 dias antes e o aviso do dia (notification_settings do seed).
CREATE TEMP TABLE _m (id uuid, tenant_id uuid, aluno_id uuid) ON COMMIT DROP;
WITH c AS (
  SELECT id, tenant_id, aluno_id FROM public.contratos
   WHERE aluno_id = 'a0000001-0000-0000-0000-000000000001' AND status = 'ativo' LIMIT 1),
ins AS (
  INSERT INTO public.mensalidades (tenant_id, contrato_id, aluno_id, competencia, data_vencimento,
                                   valor, desconto, status)
  SELECT tenant_id, id, aluno_id, date_trunc('month', current_date + 40)::date, current_date + 10,
         100, 0, 'pendente'
    FROM c
  RETURNING id, tenant_id, aluno_id)
INSERT INTO _m SELECT id, tenant_id, aluno_id FROM ins;

SELECT t_ok('9a mensalidade pendente agenda a fila',
  (SELECT count(*) FROM notificacoes n JOIN _m ON n.mensalidade_id = _m.id
    WHERE n.status = 'agendada') = 2,
  'agendadas='||(SELECT count(*) FROM notificacoes n JOIN _m ON n.mensalidade_id = _m.id
                  WHERE n.status = 'agendada'));

-- Uma falha que o worker ainda vai retentar e uma falha definitiva.
INSERT INTO public.notificacoes (tenant_id, aluno_id, mensalidade_id, tipo, canal, mensagem,
                                 status, agendada_para, tentativas, proxima_tentativa)
SELECT tenant_id, aluno_id, id, 'lembrete', 'whatsapp', '', 'falhou'::status_notificacao, now(), 1, now() + interval '1 hour' FROM _m
UNION ALL
SELECT tenant_id, aluno_id, id, 'lembrete', 'whatsapp', '', 'falhou'::status_notificacao, now(), 5, NULL FROM _m;

UPDATE public.mensalidades SET status = 'cancelado' WHERE id = (SELECT id FROM _m);

SELECT t_ok('9b cancelar a mensalidade cancela o que estava agendado',
  NOT EXISTS (SELECT 1 FROM notificacoes n JOIN _m ON n.mensalidade_id = _m.id
               WHERE n.status = 'agendada'));
SELECT t_ok('9c cancelar a mensalidade tira a falha da fila de retentativa',
  NOT EXISTS (SELECT 1 FROM notificacoes n JOIN _m ON n.mensalidade_id = _m.id
               WHERE n.status = 'falhou' AND n.proxima_tentativa IS NOT NULL));
SELECT t_ok('9d falha definitiva fica como estava (historico)',
  (SELECT count(*) FROM notificacoes n JOIN _m ON n.mensalidade_id = _m.id
    WHERE n.status = 'falhou' AND n.proxima_tentativa IS NULL) = 1);
SELECT t_ok('9e motivo registrado',
  (SELECT count(*) FROM notificacoes n JOIN _m ON n.mensalidade_id = _m.id
    WHERE n.status = 'cancelada' AND n.motivo_cancelamento = 'Mensalidade cancelada.') = 3);

-- Desfazer o cancelamento volta a agendar, como no estorno de pagamento.
UPDATE public.mensalidades SET status = 'pendente' WHERE id = (SELECT id FROM _m);
SELECT t_ok('9f cancelado -> pendente agenda de novo',
  (SELECT count(*) FROM notificacoes n JOIN _m ON n.mensalidade_id = _m.id
    WHERE n.status = 'agendada') = 2);

-- Virar 'vencido' não pode calar o aviso de atraso.
UPDATE public.mensalidades SET status = 'vencido' WHERE id = (SELECT id FROM _m);
SELECT t_ok('9g pendente -> vencido mantem a fila',
  (SELECT count(*) FROM notificacoes n JOIN _m ON n.mensalidade_id = _m.id
    WHERE n.status = 'agendada') = 2);

-- O caminho que ja existia continua: pagar cancela.
UPDATE public.mensalidades SET status = 'pago', data_pagamento = current_date WHERE id = (SELECT id FROM _m);
SELECT t_ok('9h pagar continua cancelando a fila',
  NOT EXISTS (SELECT 1 FROM notificacoes n JOIN _m ON n.mensalidade_id = _m.id
               WHERE n.status = 'agendada'));

ROLLBACK;
