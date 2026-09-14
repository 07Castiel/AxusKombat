-- Troca a matricula de AXK-XXXXXXXX para 6 digitos.
--
-- O login passou a pedir matricula e data de nascimento. Com o segundo fator,
-- a matricula pode ser curta o bastante para caber num recado de WhatsApp e
-- ser ditada no balcao, que era o objetivo.
--
-- Seguro agora porque nenhuma matricula foi entregue a aluno nenhum ate aqui.
-- Depois da primeira leva de mensagens isto deixa de ser reexecutavel: trocaria
-- o numero de quem ja recebeu o dele.

-- Sorteia numeros distintos da faixa 100000..999999 e distribui um por
-- credencial. Vem de generate_series embaralhado, e nao de random() por linha,
-- porque assim a unicidade e garantida na origem, sem laco de retentativa — e
-- o script segue sendo um comando so, sem bloco $$, que o editor SQL da
-- Lovable parte ao meio.
--
-- O row_number() precisa vir DEPOIS do LIMIT. Numerando antes, os indices
-- sorteados iriam de 1 a 900000 e quase nenhum casaria com o alvo, que vai de
-- 1 a N: o UPDATE tocaria um punhado de linhas e o resto ficaria no formato
-- antigo, sem erro nenhum para avisar.
WITH sorteio AS (
  SELECT g::text AS matricula, row_number() OVER () AS rn
  FROM (
    SELECT g
    FROM generate_series(100000, 999999) AS g
    ORDER BY random()
    LIMIT (SELECT count(*) FROM public.aluno_credenciais)
  ) AS escolhidos
),
alvo AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.aluno_credenciais
)
UPDATE public.aluno_credenciais c
SET matricula = s.matricula,
    updated_at = now()
FROM alvo a
JOIN sorteio s ON s.rn = a.rn
WHERE c.id = a.id;
