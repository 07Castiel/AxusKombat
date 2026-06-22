
CREATE TABLE IF NOT EXISTS public.presencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  horario_id uuid NOT NULL REFERENCES public.horarios(id) ON DELETE CASCADE,
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  data date NOT NULL,
  presente boolean NOT NULL DEFAULT true,
  observacoes text,
  registrado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (horario_id, aluno_id, data)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.presencas TO authenticated;
GRANT ALL ON public.presencas TO service_role;
ALTER TABLE public.presencas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presencas tenant access" ON public.presencas
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_presencas_horario_data ON public.presencas(horario_id, data);
CREATE INDEX IF NOT EXISTS idx_presencas_aluno ON public.presencas(aluno_id);

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS portal_token text UNIQUE;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS nome_fantasia text,
  ADD COLUMN IF NOT EXISTS pix_chave text,
  ADD COLUMN IF NOT EXISTS pix_titular text,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS notif_hora_envio text DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS notif_lembretes_ativos boolean DEFAULT true;

CREATE OR REPLACE FUNCTION public.portal_aluno_dados(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aluno record;
  v_mens jsonb;
  v_horarios jsonb;
  v_grad jsonb;
BEGIN
  SELECT a.id, a.nome_completo, a.email, a.categoria, a.tenant_id,
         a.graduacao_atual_id, t.nome AS academia
  INTO v_aluno
  FROM alunos a
  JOIN tenants t ON t.id = a.tenant_id
  WHERE a.portal_token = p_token;

  IF v_aluno.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'competencia', m.competencia, 'data_vencimento', m.data_vencimento,
    'valor', m.valor, 'valor_final', m.valor_final, 'status', m.status,
    'data_pagamento', m.data_pagamento
  ) ORDER BY m.data_vencimento DESC), '[]'::jsonb)
  INTO v_mens
  FROM mensalidades m
  WHERE m.aluno_id = v_aluno.id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'dia', h.dia, 'hora', h.hora, 'hora_fim', h.hora_fim,
    'modalidade', mo.nome, 'professor', h.professor
  )), '[]'::jsonb)
  INTO v_horarios
  FROM horarios h
  JOIN modalidades mo ON mo.id = h.modalidade_id
  WHERE h.tenant_id = v_aluno.tenant_id AND h.ativo = true
    AND (h.categoria = v_aluno.categoria OR h.categoria IS NULL);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'data', hg.data,
    'graduacao_nova', gn.nome,
    'observacoes', hg.observacoes
  ) ORDER BY hg.data DESC), '[]'::jsonb)
  INTO v_grad
  FROM historico_graduacoes hg
  LEFT JOIN graduacoes gn ON gn.id = hg.graduacao_nova_id
  WHERE hg.aluno_id = v_aluno.id;

  RETURN jsonb_build_object(
    'aluno', jsonb_build_object(
      'nome_completo', v_aluno.nome_completo,
      'email', v_aluno.email,
      'categoria', v_aluno.categoria,
      'academia', v_aluno.academia
    ),
    'mensalidades', v_mens,
    'horarios', v_horarios,
    'graduacoes', v_grad
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_aluno_dados(text) TO anon, authenticated;
