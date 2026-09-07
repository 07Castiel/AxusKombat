-- `planos.frequencia_semanal` passa a ter CHECK, e a coluna ganha a regra
-- de negócio escrita no próprio banco.
--
-- REGRA DE NEGÓCIO DO AXUS KOMBAT
--
-- Duração e frequência semanal são independentes. Um plano mensal e um
-- trimestral podem existir nas mesmas frequências (1x, 2x, 3x, 5x por
-- semana). O número no nome do plano só representa frequência quando vem
-- acompanhado de "X SEMANA" — "Adulto - TRIMESTRAL" é duração, não 3x.
--
-- POR QUE O CHECK
--
-- A coluna nasceu `INTEGER` sem restrição nenhuma, e é o denominador de
-- frequencia_aluno(): a meta semanal de todo aluno com contrato no plano.
-- Um valor errado aqui não deixa a tela em branco, deixa um número errado
-- com cara de certo. Medido no fixture, um aluno com contrato de 4x que
-- treina 2x aparece com aderência 0,500 se a meta for 4 e com 1,000 se a
-- meta for 1 — o caso que a leitura de evasão existe para pegar, silenciado.
--
-- Em produção dois planos vieram com a DURAÇÃO em meses neste campo
-- ("Plano Mensal" com 1, "Adulto - TRIMESTRAL" com 3), porque a duração já
-- mora em `duracao` e ninguém tinha como dizer "este plano não combina
-- treinos por semana". Isso foi corrigido no formulário; o CHECK fecha a
-- porta para os valores que quebram a matemática, de onde quer que venham
-- (tela, SQL editor, importação, integração futura).
--
-- NULL CONTINUA VÁLIDO, e é a resposta certa para plano vendido só por
-- duração: frequencia_aluno() estima a meta pelo histórico do próprio aluno
-- e a ficha diz "estimada pelo histórico do aluno". Melhor um número
-- assumido e rotulado do que um número inventado e apresentado como
-- contrato.
--
-- ZERO É O QUE MAIS IMPORTA BARRAR: `gap_esperado` divide pela meta, e a
-- tela de planos gravava Number("") = 0 quando o campo era apagado.
--
-- NÃO ALTERA NENHUMA LINHA. Se algum plano estiver fora da faixa a
-- migration para com a lista dos culpados, sem gravar nada.

BEGIN;

DO $$
DECLARE v_ruins text;
BEGIN
  SELECT string_agg(format('%s (frequencia_semanal = %s)', nome, frequencia_semanal), '; ')
    INTO v_ruins
    FROM public.planos
   WHERE frequencia_semanal IS NOT NULL
     AND frequencia_semanal NOT BETWEEN 1 AND 7;

  IF v_ruins IS NOT NULL THEN
    RAISE EXCEPTION
      'Ha plano com frequencia_semanal fora de 1 a 7: %. Corrija na tela de planos (ou deixe o campo vazio, se o plano nao combina treinos por semana) e rode de novo. Nenhuma linha foi alterada.',
      v_ruins;
  END IF;
END $$;

ALTER TABLE public.planos
  ADD CONSTRAINT planos_frequencia_semanal_1_a_7
  CHECK (frequencia_semanal IS NULL OR frequencia_semanal BETWEEN 1 AND 7);

COMMENT ON COLUMN public.planos.frequencia_semanal IS
  'Quantas vezes por semana o aluno treina (1 a 7), ou NULL quando o plano '
  'nao combina uma quantidade de treinos. E a meta semanal que '
  'frequencia_aluno() usa como denominador da aderencia. NAO e a duracao do '
  'contrato: duracao mora em planos.duracao, e as duas sao independentes — '
  'mensal e trimestral existem nas mesmas frequencias. O numero no nome do '
  'plano so significa frequencia quando vem com "X SEMANA".';

COMMIT;
