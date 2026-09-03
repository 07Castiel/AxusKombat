-- Fecha a última porta de escrita que o navegador ainda tinha com o teste
-- vencido.
--
-- O gatilho tg_exigir_assinatura cobria 10 tabelas de operação (alunos,
-- contratos, mensalidades, despesas, presencas, planos, modalidades,
-- graduacoes, horarios, historico_graduacoes). Faltavam duas:
--
--   profiles   — /configuracoes escreve direto do navegador
--                (supabase.from("profiles").update({ nome_completo })), sem
--                passar por server function. Era escrita livre com o teste
--                vencido.
--   user_roles — hoje só é escrita por server function com
--                requireActiveSubscription, mas é o par de profiles: quem
--                gerencia equipe mexe nas duas. Fica coberta por simetria.
--
-- Rotinas internas continuam passando: o gatilho libera quando auth.uid() é
-- NULL, que é o caso do service_role (staff.functions.ts usa supabaseAdmin) e
-- do handle_new_user, que roda antes de existir sessão do usuário novo.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'user_roles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_exigir_assinatura ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER tg_exigir_assinatura BEFORE INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.tg_exigir_assinatura_ativa()', t);
  END LOOP;
END $$;
