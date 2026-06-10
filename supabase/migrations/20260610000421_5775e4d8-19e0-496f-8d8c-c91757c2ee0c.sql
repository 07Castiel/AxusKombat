
-- ============================================================================
-- REFATORAÇÃO FINANCEIRO: Mensalidades Recorrentes (modelo contratos)
-- ATENÇÃO: apaga todas as pagamentos e matrículas existentes.
-- ============================================================================

-- 1) Remove dependências antigas
ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_matricula_id_fkey;
DROP INDEX IF EXISTS public.uq_notificacoes_matricula_tipo_aviso;
ALTER TABLE public.notificacoes DROP COLUMN IF EXISTS matricula_id;

DROP TABLE IF EXISTS public.pagamentos CASCADE;
DROP TABLE IF EXISTS public.matriculas CASCADE;

DROP TYPE IF EXISTS public.status_matricula CASCADE;
DROP TYPE IF EXISTS public.status_pagamento CASCADE;

-- 2) Enums novos
CREATE TYPE public.status_contrato AS ENUM ('ativo', 'pausado', 'cancelado');
CREATE TYPE public.status_mensalidade AS ENUM ('pendente', 'pago', 'vencido', 'cancelado');

-- 3) Tabela contratos (assinatura mensal do aluno)
CREATE TABLE public.contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  plano_id UUID REFERENCES public.planos(id) ON DELETE SET NULL,
  valor_mensalidade NUMERIC(10,2) NOT NULL CHECK (valor_mensalidade >= 0),
  dia_vencimento SMALLINT NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 28),
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  status public.status_contrato NOT NULL DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_contrato_aluno_ativo ON public.contratos(aluno_id) WHERE status = 'ativo';
CREATE INDEX idx_contratos_tenant ON public.contratos(tenant_id);
CREATE INDEX idx_contratos_status ON public.contratos(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos TO authenticated;
GRANT ALL ON public.contratos TO service_role;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contratos_tenant_admin" ON public.contratos FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) Tabela mensalidades (cobranças mensais)
CREATE TABLE public.mensalidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  competencia DATE NOT NULL,
  data_vencimento DATE NOT NULL,
  valor NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  desconto NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  valor_final NUMERIC(10,2) GENERATED ALWAYS AS (valor - COALESCE(desconto, 0)) STORED,
  forma_pagamento public.metodo_pagamento,
  data_pagamento DATE,
  status public.status_mensalidade NOT NULL DEFAULT 'pendente',
  observacoes_pagamento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_mensalidade_contrato_competencia ON public.mensalidades(contrato_id, competencia);
CREATE INDEX idx_mensalidades_tenant_status ON public.mensalidades(tenant_id, status);
CREATE INDEX idx_mensalidades_vencimento_pendente ON public.mensalidades(data_vencimento) WHERE status = 'pendente';
CREATE INDEX idx_mensalidades_aluno ON public.mensalidades(aluno_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mensalidades TO authenticated;
GRANT ALL ON public.mensalidades TO service_role;
ALTER TABLE public.mensalidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mensalidades_tenant_admin" ON public.mensalidades FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.mensalidades
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5) Liga notificações às mensalidades
ALTER TABLE public.notificacoes
  ADD COLUMN mensalidade_id UUID REFERENCES public.mensalidades(id) ON DELETE CASCADE;
CREATE INDEX idx_notif_mensalidade ON public.notificacoes(mensalidade_id);
CREATE UNIQUE INDEX uq_notificacoes_mensalidade_tipo_aviso
  ON public.notificacoes(mensalidade_id, tipo)
  WHERE tipo IN ('AVISO_7_DIAS','AVISO_3_DIAS','AVISO_VENCIMENTO');

-- 6) Função: gera mensalidades pendentes para os próximos N meses (rolling 3)
CREATE OR REPLACE FUNCTION public.gerar_mensalidades_contrato(p_contrato_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c RECORD;
  v_base DATE;
  v_mes DATE;
  v_venc DATE;
  v_last_day INTEGER;
  v_inserted INTEGER := 0;
  i INTEGER;
BEGIN
  SELECT * INTO c FROM public.contratos WHERE id = p_contrato_id;
  IF c IS NULL OR c.status <> 'ativo' THEN RETURN 0; END IF;

  -- Começa no maior entre data_inicio e mês corrente
  v_base := date_trunc('month', GREATEST(c.data_inicio, CURRENT_DATE))::date;

  FOR i IN 0..3 LOOP
    v_mes := (v_base + (i || ' month')::interval)::date;
    v_last_day := EXTRACT(DAY FROM (date_trunc('month', v_mes) + interval '1 month - 1 day'))::int;
    v_venc := make_date(
      EXTRACT(YEAR FROM v_mes)::int,
      EXTRACT(MONTH FROM v_mes)::int,
      LEAST(c.dia_vencimento::int, v_last_day)
    );

    INSERT INTO public.mensalidades (tenant_id, contrato_id, aluno_id, competencia, data_vencimento, valor)
    VALUES (c.tenant_id, c.id, c.aluno_id, v_mes, v_venc, c.valor_mensalidade)
    ON CONFLICT (contrato_id, competencia) DO NOTHING;
    IF FOUND THEN v_inserted := v_inserted + 1; END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gerar_mensalidades_contrato(UUID) TO authenticated, service_role;

-- 7) Função: processa cron diário (marca vencidas + gera rolling)
CREATE OR REPLACE FUNCTION public.processar_mensalidades_diario()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_geradas INTEGER := 0;
  v_vencidas INTEGER := 0;
  r RECORD;
BEGIN
  UPDATE public.mensalidades
  SET status = 'vencido'
  WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE;
  GET DIAGNOSTICS v_vencidas = ROW_COUNT;

  FOR r IN SELECT id FROM public.contratos WHERE status = 'ativo' LOOP
    v_geradas := v_geradas + public.gerar_mensalidades_contrato(r.id);
  END LOOP;

  RETURN jsonb_build_object('geradas', v_geradas, 'marcadas_vencidas', v_vencidas);
END;
$$;
GRANT EXECUTE ON FUNCTION public.processar_mensalidades_diario() TO service_role;
