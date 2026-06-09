
CREATE OR REPLACE FUNCTION public.is_professor_adulto()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'professor_adulto') $$;

-- Update alunos RLS
DROP POLICY IF EXISTS alunos_select ON public.alunos;
DROP POLICY IF EXISTS alunos_insert ON public.alunos;
DROP POLICY IF EXISTS alunos_update ON public.alunos;
DROP POLICY IF EXISTS alunos_delete ON public.alunos;

CREATE POLICY alunos_select ON public.alunos
FOR SELECT TO authenticated
USING (
  tenant_id = get_current_tenant() AND (
    is_admin()
    OR (is_professor_kids() AND categoria = 'kids'::categoria_aluno)
    OR (is_professor_adulto() AND categoria = 'adulto'::categoria_aluno)
  )
);

CREATE POLICY alunos_insert ON public.alunos
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_current_tenant() AND (
    is_admin()
    OR (is_professor_kids() AND categoria = 'kids'::categoria_aluno)
    OR (is_professor_adulto() AND categoria = 'adulto'::categoria_aluno)
  )
);

CREATE POLICY alunos_update ON public.alunos
FOR UPDATE TO authenticated
USING (
  tenant_id = get_current_tenant() AND (
    is_admin()
    OR (is_professor_kids() AND categoria = 'kids'::categoria_aluno)
    OR (is_professor_adulto() AND categoria = 'adulto'::categoria_aluno)
  )
);

CREATE POLICY alunos_delete ON public.alunos
FOR DELETE TO authenticated
USING (tenant_id = get_current_tenant() AND is_admin());
