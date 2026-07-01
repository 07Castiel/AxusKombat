
-- 1) Enum: adicionar status 'arquivado'
ALTER TYPE public.status_aluno ADD VALUE IF NOT EXISTS 'arquivado';

-- 2) Helpers de perfil
CREATE OR REPLACE FUNCTION public.is_recepcao()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT public.has_role(auth.uid(), 'recepcao') $$;

CREATE OR REPLACE FUNCTION public.is_financeiro()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT public.has_role(auth.uid(), 'financeiro') $$;

-- Helper: professor pode acessar aluno de uma dada categoria?
CREATE OR REPLACE FUNCTION public.can_access_categoria(_cat public.categoria_aluno)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    public.is_admin()
    OR public.is_recepcao()
    OR (public.is_professor_kids()   AND _cat = 'kids')
    OR (public.is_professor_adulto() AND _cat = 'adulto')
$$;

-- 3) ALUNOS
DROP POLICY IF EXISTS alunos_select ON public.alunos;
DROP POLICY IF EXISTS alunos_insert ON public.alunos;
DROP POLICY IF EXISTS alunos_update ON public.alunos;
DROP POLICY IF EXISTS alunos_delete ON public.alunos;

CREATE POLICY alunos_select ON public.alunos FOR SELECT TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR public.is_recepcao()
    OR public.is_financeiro()
    OR (public.is_professor_kids()   AND categoria = 'kids')
    OR (public.is_professor_adulto() AND categoria = 'adulto')
  )
);

CREATE POLICY alunos_insert ON public.alunos FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR public.is_recepcao()
    OR (public.is_professor_kids()   AND categoria = 'kids')
    OR (public.is_professor_adulto() AND categoria = 'adulto')
  )
);

CREATE POLICY alunos_update ON public.alunos FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR public.is_recepcao()
    OR (public.is_professor_kids()   AND categoria = 'kids')
    OR (public.is_professor_adulto() AND categoria = 'adulto')
  )
)
WITH CHECK (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR public.is_recepcao()
    OR (public.is_professor_kids()   AND categoria = 'kids')
    OR (public.is_professor_adulto() AND categoria = 'adulto')
  )
);

-- Exclusão definitiva: SOMENTE admin
CREATE POLICY alunos_delete ON public.alunos FOR DELETE TO authenticated
USING (tenant_id = public.get_current_tenant() AND public.is_admin());

-- 4) HORÁRIOS
DROP POLICY IF EXISTS horarios_select ON public.horarios;
DROP POLICY IF EXISTS horarios_admin_all ON public.horarios;
DROP POLICY IF EXISTS horarios_delete ON public.horarios;

CREATE POLICY horarios_select ON public.horarios FOR SELECT TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR public.is_recepcao()
    OR (public.is_professor_kids()   AND categoria = 'kids')
    OR (public.is_professor_adulto() AND categoria = 'adulto')
  )
);
CREATE POLICY horarios_insert ON public.horarios FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR (public.is_professor_kids()   AND categoria = 'kids')
    OR (public.is_professor_adulto() AND categoria = 'adulto')
  )
);
CREATE POLICY horarios_update ON public.horarios FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR (public.is_professor_kids()   AND categoria = 'kids')
    OR (public.is_professor_adulto() AND categoria = 'adulto')
  )
)
WITH CHECK (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR (public.is_professor_kids()   AND categoria = 'kids')
    OR (public.is_professor_adulto() AND categoria = 'adulto')
  )
);
CREATE POLICY horarios_delete ON public.horarios FOR DELETE TO authenticated
USING (tenant_id = public.get_current_tenant() AND public.is_admin());

-- 5) PRESENÇAS (baseado na categoria do aluno)
DROP POLICY IF EXISTS "presencas tenant access" ON public.presencas;

CREATE POLICY presencas_select ON public.presencas FOR SELECT TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR public.is_recepcao()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = presencas.aluno_id
      AND (
        (public.is_professor_kids()   AND a.categoria = 'kids')
        OR (public.is_professor_adulto() AND a.categoria = 'adulto')
      )
    )
  )
);
CREATE POLICY presencas_write ON public.presencas FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR public.is_recepcao()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = presencas.aluno_id
      AND (
        (public.is_professor_kids()   AND a.categoria = 'kids')
        OR (public.is_professor_adulto() AND a.categoria = 'adulto')
      )
    )
  )
);
CREATE POLICY presencas_update ON public.presencas FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR public.is_recepcao()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = presencas.aluno_id
      AND (
        (public.is_professor_kids()   AND a.categoria = 'kids')
        OR (public.is_professor_adulto() AND a.categoria = 'adulto')
      )
    )
  )
);
CREATE POLICY presencas_delete ON public.presencas FOR DELETE TO authenticated
USING (tenant_id = public.get_current_tenant() AND public.is_admin());

-- 6) HISTÓRICO DE GRADUAÇÕES
DROP POLICY IF EXISTS hist_grad_select ON public.historico_graduacoes;
DROP POLICY IF EXISTS hist_grad_insert ON public.historico_graduacoes;
DROP POLICY IF EXISTS hist_grad_update ON public.historico_graduacoes;
DROP POLICY IF EXISTS hist_grad_delete ON public.historico_graduacoes;

CREATE POLICY hist_grad_select ON public.historico_graduacoes FOR SELECT TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = historico_graduacoes.aluno_id
      AND (
        (public.is_professor_kids()   AND a.categoria = 'kids')
        OR (public.is_professor_adulto() AND a.categoria = 'adulto')
      )
    )
  )
);
CREATE POLICY hist_grad_insert ON public.historico_graduacoes FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = historico_graduacoes.aluno_id
      AND (
        (public.is_professor_kids()   AND a.categoria = 'kids')
        OR (public.is_professor_adulto() AND a.categoria = 'adulto')
      )
    )
  )
);
CREATE POLICY hist_grad_update ON public.historico_graduacoes FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = historico_graduacoes.aluno_id
      AND (
        (public.is_professor_kids()   AND a.categoria = 'kids')
        OR (public.is_professor_adulto() AND a.categoria = 'adulto')
      )
    )
  )
);
CREATE POLICY hist_grad_delete ON public.historico_graduacoes FOR DELETE TO authenticated
USING (tenant_id = public.get_current_tenant() AND public.is_admin());

-- 7) GRADUAÇÕES (catálogo)
DROP POLICY IF EXISTS grad_select ON public.graduacoes;
DROP POLICY IF EXISTS grad_admin_all ON public.graduacoes;
DROP POLICY IF EXISTS graduacoes_delete ON public.graduacoes;

CREATE POLICY grad_select ON public.graduacoes FOR SELECT TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR public.is_recepcao()
    OR (public.is_professor_kids()   AND categoria = 'kids')
    OR (public.is_professor_adulto() AND categoria = 'adulto')
  )
);
CREATE POLICY grad_admin_all ON public.graduacoes FOR ALL TO authenticated
USING (tenant_id = public.get_current_tenant() AND public.is_admin())
WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

-- 8) PLANOS
DROP POLICY IF EXISTS planos_select ON public.planos;
DROP POLICY IF EXISTS planos_admin_all ON public.planos;

CREATE POLICY planos_select ON public.planos FOR SELECT TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin()
    OR public.is_recepcao()
    OR public.is_financeiro()
    OR (public.is_professor_kids()   AND categoria = 'kids')
    OR (public.is_professor_adulto() AND categoria = 'adulto')
  )
);
CREATE POLICY planos_admin_all ON public.planos FOR ALL TO authenticated
USING (tenant_id = public.get_current_tenant() AND public.is_admin())
WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

-- 9) CONTRATOS
DROP POLICY IF EXISTS contratos_tenant_admin ON public.contratos;

CREATE POLICY contratos_select ON public.contratos FOR SELECT TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_recepcao() OR public.is_financeiro()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = contratos.aluno_id
      AND (
        (public.is_professor_kids()   AND a.categoria = 'kids')
        OR (public.is_professor_adulto() AND a.categoria = 'adulto')
      )
    )
  )
);
CREATE POLICY contratos_insert ON public.contratos FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_recepcao() OR public.is_financeiro()
  )
);
CREATE POLICY contratos_update ON public.contratos FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_recepcao() OR public.is_financeiro()
  )
)
WITH CHECK (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_recepcao() OR public.is_financeiro()
  )
);
CREATE POLICY contratos_delete ON public.contratos FOR DELETE TO authenticated
USING (tenant_id = public.get_current_tenant() AND public.is_admin());

-- 10) MENSALIDADES
DROP POLICY IF EXISTS mensalidades_tenant_admin ON public.mensalidades;

CREATE POLICY mensalidades_select ON public.mensalidades FOR SELECT TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_recepcao() OR public.is_financeiro()
  )
);
CREATE POLICY mensalidades_write ON public.mensalidades FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_financeiro()
  )
);
CREATE POLICY mensalidades_update ON public.mensalidades FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_financeiro() OR public.is_recepcao()
  )
)
WITH CHECK (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_financeiro() OR public.is_recepcao()
  )
);
CREATE POLICY mensalidades_delete ON public.mensalidades FOR DELETE TO authenticated
USING (tenant_id = public.get_current_tenant() AND public.is_admin());

-- 11) DESPESAS
DROP POLICY IF EXISTS despesas_admin_all ON public.despesas;

CREATE POLICY despesas_select ON public.despesas FOR SELECT TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_financeiro()
  )
);
CREATE POLICY despesas_write ON public.despesas FOR ALL TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_financeiro()
  )
)
WITH CHECK (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_financeiro()
  )
);
