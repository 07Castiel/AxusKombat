
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP POLICY IF EXISTS fotos_alunos_read_public ON storage.objects;
DROP POLICY IF EXISTS fotos_alunos_upload_auth ON storage.objects;
DROP POLICY IF EXISTS fotos_alunos_update_auth ON storage.objects;
DROP POLICY IF EXISTS fotos_alunos_delete_auth ON storage.objects;

CREATE POLICY fotos_alunos_read_tenant ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'fotos-alunos'
  AND (storage.foldername(name))[1] = public.get_current_tenant()::text
);

CREATE POLICY fotos_alunos_insert_tenant ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fotos-alunos'
  AND (storage.foldername(name))[1] = public.get_current_tenant()::text
);

CREATE POLICY fotos_alunos_update_tenant ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'fotos-alunos'
  AND (storage.foldername(name))[1] = public.get_current_tenant()::text
)
WITH CHECK (
  bucket_id = 'fotos-alunos'
  AND (storage.foldername(name))[1] = public.get_current_tenant()::text
);

CREATE POLICY fotos_alunos_delete_tenant ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'fotos-alunos'
  AND (storage.foldername(name))[1] = public.get_current_tenant()::text
);

DROP POLICY IF EXISTS user_roles_insert_admin_only ON public.user_roles;
DROP POLICY IF EXISTS user_roles_update_admin_only ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete_admin_only ON public.user_roles;

CREATE POLICY user_roles_insert_admin_only ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY user_roles_update_admin_only ON public.user_roles
FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY user_roles_delete_admin_only ON public.user_roles
FOR DELETE TO authenticated
USING (public.is_admin());
