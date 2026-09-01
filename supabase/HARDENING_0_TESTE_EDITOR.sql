-- ============================================================================
-- TESTE DO EDITOR — rode ANTES das ETAPAS 2 e 3.
--
-- Somente leitura, nao cria nem altera nada.
--
-- POR QUE: as ETAPAS 2 e 3 definem funcoes com ";" dentro do corpo, entre
-- $$ ... $$. Se o editor do Lovable separar comandos pelo ";" sem entender
-- dollar-quoting, ele parte o corpo da funcao ao meio e a migration falha —
-- ou, pior, executa pedacos soltos.
--
-- A ETAPA 1 nao prova nada a esse respeito: nenhuma funcao dela tinha ";"
-- interno.
--
-- ESPERADO: uma tabela com uma linha, resultado = 'dollar-quoting OK'.
-- Se der erro de sintaxe, me avise — eu reescrevo as etapas sem blocos
-- dollar-quoted.
-- ============================================================================

DO $$
DECLARE
  v_um int;
  v_dois int;
BEGIN
  v_um := 1;
  v_dois := v_um + 1;
  RAISE NOTICE 'bloco com % comandos internos executou inteiro', v_dois;
END $$;

SELECT 'dollar-quoting OK' AS resultado;
