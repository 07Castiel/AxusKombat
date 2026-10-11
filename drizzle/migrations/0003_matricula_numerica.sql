-- Troca a matricula de AXK-XXXXXXXX para 6 digitos.
--
-- O login passou a pedir matricula e data de nascimento. Com o segundo fator,
-- a matricula pode ser curta o bastante para caber num recado de WhatsApp e
-- ser ditada no balcao, que era o objetivo.
--
-- Reexecutavel: so converte credencial que ainda nao tem 6 digitos, e so sorteia
-- numero que ninguem usa. A primeira versao sorteava de novo para TODAS as
-- credenciais. Ela foi aplicada a mao, fora do registro do drizzle, e um
-- `drizzle-kit migrate` depois disso trocaria o numero de quem ja recebeu o
-- dele pelo WhatsApp, sem erro nenhum. Rodar de novo agora nao muda nada.

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
WITH alvo AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.aluno_credenciais
  WHERE matricula !~ '^[1-9][0-9]{5}$'
),
sorteio AS (
  SELECT g::text AS matricula, row_number() OVER () AS rn
  FROM (
    SELECT g
    FROM generate_series(100000, 999999) AS g
    WHERE NOT EXISTS (
      SELECT 1 FROM public.aluno_credenciais x WHERE x.matricula = g::text
    )
    ORDER BY random()
    LIMIT (SELECT count(*) FROM alvo)
  ) AS escolhidos
)
UPDATE public.aluno_credenciais c
SET matricula = s.matricula,
    updated_at = now()
FROM alvo a
JOIN sorteio s ON s.rn = a.rn
WHERE c.id = a.id;
