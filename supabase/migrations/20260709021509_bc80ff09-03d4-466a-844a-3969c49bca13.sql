
DROP POLICY IF EXISTS roles_select_own_tenant ON public.user_roles;
CREATE POLICY roles_select_own ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR (tenant_id = public.get_current_tenant() AND public.is_admin()));

DROP POLICY IF EXISTS profiles_select_own_tenant ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR (tenant_id = public.get_current_tenant() AND public.is_admin()));
