-- ============================================================================
-- IDOR por chave estrangeira: garante que aluno_id pertence ao tenant da linha.
-- Issue: #22.
--
-- As policies de INSERT de contratos/historico_graduacoes/mensalidades conferem
-- o tenant_id da PRÓPRIA linha, mas não que o aluno_id referenciado seja daquele
-- tenant. Um admin da Academia A criava um contrato no próprio tenant apontando
-- para um aluno da Academia B; gerar_mensalidades_contrato e o worker (ambos
-- service_role, que ignora RLS) passavam a ler nome/telefone do aluno da vítima.
--
-- A guarda é um gatilho SECURITY DEFINER: ele lê alunos ignorando RLS (para
-- enxergar o tenant real do aluno, mesmo o de outra academia) e recusa a escrita
-- quando alunos.tenant_id <> NEW.tenant_id. Fecha o furo para QUALQUER caminho
-- (cliente com RLS ou service_role), não só o handler.
--
-- Não quebra o fluxo legítimo: gerar_mensalidades_contrato insere a mensalidade
-- com o tenant_id e o aluno_id do próprio contrato — que já passou por esta mesma
-- guarda —, então a consistência se propaga.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_aluno_do_mesmo_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.aluno_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.alunos a
    WHERE a.id = NEW.aluno_id
      AND a.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'O aluno informado não pertence a esta academia.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.tg_aluno_do_mesmo_tenant() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contratos', 'historico_graduacoes', 'mensalidades'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_aluno_mesmo_tenant ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER tg_aluno_mesmo_tenant
         BEFORE INSERT OR UPDATE OF aluno_id, tenant_id ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_aluno_do_mesmo_tenant()', t);
  END LOOP;
END $$;

COMMIT;
