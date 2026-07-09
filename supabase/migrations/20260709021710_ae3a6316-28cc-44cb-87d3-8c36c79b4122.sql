
REVOKE EXECUTE ON FUNCTION public.get_current_tenant() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_financeiro() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_recepcao() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_professor_adulto() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_professor_kids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_categoria(categoria_aluno) FROM PUBLIC, anon;
