-- ============================================================================
-- CANCELAR AS MENSAGENS QUE FICARAM PARADAS
--
-- QUANDO RODAR: logo ANTES do deploy do codigo novo.
--
-- POR QUE: o worker esta ha semanas descartando toda notificacao automatica
-- (achado A1) — 672 execucoes em 7 dias, 0 mensagens enviadas. As que venceram
-- nesse periodo continuam com status 'agendada' e data no passado.
--
-- Assim que o codigo corrigido subir, o worker roda em ate 15 minutos e envia
-- TODAS de uma vez: cobrancas de competencias que ja passaram, chegando juntas
-- no WhatsApp do aluno. Alem do constrangimento, e o padrao de rajada que faz
-- o WhatsApp bloquear o numero.
--
-- Isto NAO apaga nada. Marca como cancelada e registra o motivo, entao o
-- historico continua contando o que aconteceu.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASSO 1 — VER o que sera cancelado. Nada e alterado aqui.
--
-- Confira se os nomes e as datas fazem sentido antes de seguir.
-- ----------------------------------------------------------------------------
SELECT n.id,
       a.nome_completo         AS aluno,
       n.tipo,
       n.agendada_para,
       (now()::date - n.agendada_para::date) AS dias_de_atraso,
       m.competencia,
       m.data_vencimento,
       m.status               AS status_da_mensalidade
FROM public.notificacoes n
LEFT JOIN public.alunos a       ON a.id = n.aluno_id
LEFT JOIN public.mensalidades m ON m.id = n.mensalidade_id
WHERE n.status = 'agendada'
  AND n.agendada_para < now()
ORDER BY n.agendada_para;


-- ----------------------------------------------------------------------------
-- PASSO 2 — CANCELAR. Rode so depois de conferir o passo 1.
--
-- O RETURNING devolve quantas foram, para voce comparar com o passo 1.
-- ----------------------------------------------------------------------------
UPDATE public.notificacoes
   SET status = 'cancelada',
       motivo_cancelamento =
         'Cancelada na correcao do worker de envio: a mensagem venceu enquanto '
         || 'o disparo automatico estava parado e nao faz mais sentido enviar.',
       proxima_tentativa = NULL,
       updated_at = now()
 WHERE status = 'agendada'
   AND agendada_para < now()
RETURNING id, aluno_id, tipo, agendada_para;


-- ----------------------------------------------------------------------------
-- PASSO 3 — CONFERIR. Deve voltar zero em "atrasadas".
-- ----------------------------------------------------------------------------
SELECT count(*) FILTER (WHERE status = 'agendada' AND agendada_para < now()) AS atrasadas,
       count(*) FILTER (WHERE status = 'agendada' AND agendada_para >= now()) AS agendadas_no_futuro,
       count(*) FILTER (WHERE status = 'cancelada')                           AS canceladas
FROM public.notificacoes;
