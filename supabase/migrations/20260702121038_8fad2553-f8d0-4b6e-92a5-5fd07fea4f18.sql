
REVOKE ALL ON FUNCTION public.agendar_notificacoes_mensalidade(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancelar_notificacoes_mensalidade(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agendar_notificacoes_mensalidade(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_notificacoes_mensalidade(uuid, text) TO service_role;
