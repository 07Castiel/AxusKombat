
REVOKE EXECUTE ON FUNCTION public.agendar_notificacoes_mensalidade(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancelar_notificacoes_mensalidade(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gerar_mensalidades_contrato(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.processar_mensalidades_diario() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_mensalidade_notificacoes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
