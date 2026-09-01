-- ============================================================================
-- ROLLBACK do HARDENING_1_APLICAR.sql
--
-- NAO rode isto junto com a migration. E o desfazer, para o caso de alguma
-- tela ficar sem dados depois de aplicar. Devolve o estado exato de antes,
-- incluindo as falhas de seguranca.
-- ============================================================================

BEGIN;

-- C3 de volta ao original (tenant-cego)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id AND role = _role)
$$;

-- C2 de volta
DROP POLICY IF EXISTS profiles_update_self_or_admin ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid() OR (tenant_id = public.get_current_tenant() AND public.is_admin()));

-- C4 de volta
CREATE POLICY user_roles_insert_admin_only ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY user_roles_update_admin_only ON public.user_roles
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY user_roles_delete_admin_only ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_admin());

-- C5 de volta
GRANT SELECT, DELETE ON public.visitor_logs TO authenticated;
GRANT SELECT, DELETE ON public.system_logs  TO authenticated;
CREATE POLICY "Admins can read visitor logs"   ON public.visitor_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete visitor logs" ON public.visitor_logs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can read system logs"    ON public.system_logs  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete system logs"  ON public.system_logs  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- M3 e M4 de volta
UPDATE storage.buckets SET public = true WHERE id = 'fotos-alunos';
ALTER TABLE public.mensalidades DROP CONSTRAINT IF EXISTS mensalidades_desconto_lte_valor;

COMMIT;
