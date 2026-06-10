
REVOKE EXECUTE ON FUNCTION public.gerar_mensalidades_contrato(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.processar_mensalidades_diario() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_mensalidades_contrato(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.processar_mensalidades_diario() TO service_role;
