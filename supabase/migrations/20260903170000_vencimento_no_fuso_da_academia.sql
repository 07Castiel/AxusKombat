-- Mensalidade deixa de vencer pelo relógio do servidor.
--
-- processar_mensalidades_diario() marcava vencido com `data_vencimento <
-- CURRENT_DATE`. CURRENT_DATE no Supabase é UTC, e as academias estão no
-- Brasil: entre 21h e a meia-noite de Brasília o UTC já é o dia seguinte, e a
-- mensalidade que vence HOJE virava "vencida" — com a cobrança automática
-- saindo no próprio dia do vencimento.
--
-- O fuso sai de notification_settings.timezone, que a academia já configura na
-- tela de notificações e que o disparador de mensagens sempre respeitou. Quem
-- não tem configuração cai em America/Sao_Paulo.
--
-- O par em TypeScript é hojeNoFuso() em src/lib/data-tenant.ts, usado pelo
-- botão "Atualizar agora" — que é o caminho mais exposto, porque o admin pode
-- clicar nele às 22h, enquanto este cron roda de madrugada.
CREATE OR REPLACE FUNCTION public.processar_mensalidades_diario()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_geradas INTEGER := 0;
  v_vencidas INTEGER := 0;
  r RECORD;
BEGIN
  UPDATE public.mensalidades m
     SET status = 'vencido'
    FROM public.tenants t
    LEFT JOIN public.notification_settings ns ON ns.tenant_id = t.id
   WHERE m.tenant_id = t.id
     AND m.status = 'pendente'
     AND m.data_vencimento
         < (now() AT TIME ZONE COALESCE(ns.timezone, 'America/Sao_Paulo'))::date;
  GET DIAGNOSTICS v_vencidas = ROW_COUNT;

  FOR r IN SELECT id FROM public.contratos WHERE status = 'ativo' LOOP
    v_geradas := v_geradas + public.gerar_mensalidades_contrato(r.id);
  END LOOP;

  RETURN jsonb_build_object('geradas', v_geradas, 'marcadas_vencidas', v_vencidas);
END;
$$;

-- Mantém as permissões que a migração de hardening aplicou: só o cron chama.
REVOKE EXECUTE ON FUNCTION public.processar_mensalidades_diario() FROM PUBLIC, anon, authenticated;
