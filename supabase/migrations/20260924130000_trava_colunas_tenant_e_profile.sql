-- ============================================================================
-- Tira do alcance de escrita do navegador as colunas sensíveis de tenants e
-- profiles. Issues: #19 (assinatura/estado da academia) e #20 (permissões).
--
-- O RLS controla LINHA, não COLUNA: as policies tenants_update_admin e
-- profiles_update_self_or_admin liberavam a linha inteira. Um admin escrevia
-- tenants.status/plan/ativo direto do navegador (burla de paywall e desfazia a
-- suspensão do painel mestre), e qualquer funcionário reescrevia o próprio
-- profiles.permissions, anulando as restrições que o admin havia definido.
--
-- A trava de coluna vem do GRANT (privilégio de coluna), que o Postgres checa
-- para cada coluna do SET. Depois disto, 'authenticated' só pode escrever as
-- colunas de cadastro; billing, estado, permissões, papel e tenant só a
-- service_role escreve — que é como o webhook do Stripe, o painel mestre e o
-- createStaff/updateStaff já operam (supabaseAdmin ignora RLS e tem ALL).
--
-- Fluxos legítimos preservados:
--   - updateTenantConfig (server fn, client do usuário) escreve exatamente as 13
--     colunas de cadastro liberadas abaixo.
--   - configuracoes.tsx escreve profiles.nome_completo pelo navegador.
--   - Stripe webhook / master / staff escrevem o resto via service_role.
-- ============================================================================

BEGIN;

-- ---- #19 — tenants: só a service_role escreve billing e estado --------------
-- Colunas liberadas para 'authenticated' = exatamente as que updateTenantConfig
-- grava. Ficam de fora (só service_role): status, plan, plan_period, is_trial,
-- trial_ends_at, stripe_customer_id, stripe_subscription_id, ativo,
-- onboarding_completed, slug, id, created_at.
REVOKE UPDATE ON public.tenants FROM authenticated;
GRANT UPDATE (
  nome,
  nome_fantasia,
  cnpj_cpf,
  telefone,
  responsavel_nome,
  responsavel_email,
  endereco,
  logo_url,
  pix_chave,
  pix_titular,
  banco,
  notif_hora_envio,
  notif_lembretes_ativos
) ON public.tenants TO authenticated;
-- Garante que o webhook/master (service_role) seguem com escrita total.
GRANT ALL ON public.tenants TO service_role;

-- ---- #20 — profiles: usuário só edita o próprio nome ------------------------
-- permissions, papel (user_roles) e tenant_id passam a ser escritos apenas pela
-- service_role (createStaff/updateStaff). O navegador só grava nome_completo,
-- que é o único campo que a tela de configurações edita.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (nome_completo) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

COMMIT;
