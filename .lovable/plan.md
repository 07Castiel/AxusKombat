
# Onboarding + Checkout Stripe (Axus Kombat)

Implementação das 3 rotas (/login, /precos, /bem-vindo) integradas à estrutura multi-tenant existente. Stripe BYOK. Status mora em `tenants`. Webhook é a única fonte de verdade.

## Escopo

### 1. Migração — colunas em `tenants`
- `status` text NOT NULL default `'active'` — `pending | trialing | active | trial_expired` (default `active` para não bloquear tenants existentes; novos signups gravam `pending`)
- `plan` text NULL — `start | pro | elite`
- `plan_period` text NULL — `monthly | annual`
- `is_trial` boolean default false
- `stripe_customer_id` text NULL (index)
- `stripe_subscription_id` text NULL (index)
- `trial_ends_at` timestamptz NULL
- `onboarding_completed` boolean default true (antigos não veem /bem-vindo; novos gravam false)

### 2. Trigger `handle_new_user`
Refatorar para ler `plan`, `plan_period`, `is_trial` de `raw_user_meta_data` e gravar tenant com `status='pending'`, `onboarding_completed=false`.

### 3. `/login` — alterações mínimas
- Mantém layout atual.
- Adiciona checkbox "Lembrar de mim" e link "Ainda não é cliente? Ver planos →" (→ `/precos`).
- Após login, ler `tenants.status`:
  - `active`/`trialing` → `/`
  - `pending` → `/precos?retomar=true` (abre modal direto no Step 2 com `plan`/`plan_period` salvos)
  - `trial_expired` → `/precos?expirado=true`
- Se já autenticado e visitar `/login`, redireciona para `/`.

### 4. `/precos` (pública)
- Header dark: logo + "Já sou cliente" → `/login`.
- Bloco CTA: "Teste 14 dias grátis no Plano Pro" + botão "Começar trial gratuito" (abre modal Pro + `is_trial:true`).
- Toggle Mensal/Anual (Anual: Start R$790, Pro R$990, Elite R$1.490 + badge "2 meses grátis").
- 3 cards: Start R$79, Pro R$99 (badge "Mais vendido" + borda 2px #8B0000), Elite R$149, com features exatas do brief.
- Mobile: Pro expandido, Start/Elite colapsados com "Ver detalhes".
- Banners condicionais via query (`?retomar`, `?expirado`) — **estilo custom inline**: `bg:#1a0000`, `border:1px solid #8B0000`, texto branco, Rajdhani. Não usar `<Alert>` padrão.
- Autenticado `active`/`trialing`: "Plano atual" desabilitado ou "Fazer upgrade" (apenas UI).
- Rodapé: WhatsApp + Política/Termos.

### 5. Modal de Checkout (3 steps)
**Step 1 — Cadastro**: nome (≥3), e-mail, senha (≥8), confirmar (tempo real). Server fn `checkEmailAvailable`. Server fn `signupPendingTenant` cria `auth.user` via `supabaseAdmin.auth.admin.createUser` com metadata; trigger cria tenant pending. Login automático no cliente.

**Step 2 — Resumo**: plano, período, valor (trial: "R$0,00 hoje. Cobrança de R$XX/mês após 14 dias.").

**Step 3 — Pagamento**: server fn `createCheckoutSession` (requireSupabaseAuth):
- Cria/recupera Customer Stripe (idempotente via `stripe_customer_id`).
- Checkout Session `mode:subscription`, price_id do env, `metadata.tenant_id`.
- Se trial: `subscription_data.trial_period_days:14`, `payment_method_collection:'if_required'`.
- `success_url: /bem-vindo?plano=X&trial=Y`, `cancel_url: /precos`.
- Erro → "Tentar novamente".

### 6. Webhook — `src/routes/api/public/stripe-webhook.ts`
- Verifica assinatura com `STRIPE_WEBHOOK_SECRET` sobre raw body.
- `checkout.session.completed`: salva customer/subscription, status `trialing`|`active`, `trial_ends_at`.
- `invoice.paid`: status = `active`.
- `customer.subscription.updated|deleted` com `past_due|canceled|unpaid`: status = `trial_expired`.
- Usa `supabaseAdmin` carregado dentro do handler.

### 7. `/bem-vindo` (em `_app`)
- Se `onboarding_completed=true` → `/`.
- Ícone ✓ 64px (#8B0000), título Cinzel, subtítulo dinâmico por `?plano`/`?trial` (trial: data atual+14d DD/MM/AAAA). Botão "Acessar o sistema" → marca `onboarding_completed=true` e vai para `/`.

### 8. Guard global em `_app/route.tsx`
Após carregar perfil, se `tenants.status ∈ {pending, trial_expired}` → redireciona `/precos?retomar|expirado=true`. Admin master livre.

### 9. Substituir todas as referências a `/signup` por `/precos`
Antes de mexer no roteamento, varrer o projeto e atualizar:
- Buscar (`rg "/signup"`, `rg "signup"`) em `src/**` e identificar:
  - Links/botões em `src/routes/login.tsx` ("Criar academia") e qualquer outro CTA/header/navbar.
  - `navigate({ to: "/signup" })` ou `<Link to="/signup">`.
  - Strings em e-mails transacionais, templates, copy de auth, mensagens de erro.
  - Comentários/docs (`.lovable/plan.md`, README, llms.txt, sitemap).
- Substituir todas as ocorrências de destino por `/precos`.
- A rota `src/routes/signup.tsx` é removida. Como fallback de bookmarks antigos, criar um stub que apenas faz `redirect({ to: "/precos" })` no `beforeLoad` (sem UI).
- Validar com nova busca por `/signup` que só sobra o stub.

### 10. Estilo
- Fontes Cinzel + Rajdhani já existem.
- Wrapper `<div className="dark">` nas 3 rotas.
- Cores: bg #0D0D0D, accent #8B0000 (hover #6B0000), cards #111111, checks #8B0000.

### 11. Secrets BYOK (via add_secret após aprovação)
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_{START|PRO|ELITE}_{MONTHLY|ANNUAL}`.

URL do webhook: `https://project--{id}.lovable.app/api/public/stripe-webhook`.

## Detalhes técnicos
- `bun add stripe`.
- `src/lib/stripe.server.ts` (cliente) + `src/lib/billing.functions.ts` (server fns).
- Webhook em server route com `await request.text()` para HMAC.
- Migração: ALTER em `tenants` (GRANT já existe).

## Fora de escopo
- Não substituir layout do /login.
- Não migrar para Lovable Payments.
- Sem portal de gestão de assinatura/troca de cartão nesta fase.
- Troca real de subscription (upgrade) fica para fase seguinte; nesta entrega só a UI.

## Ordem de execução
1. Migração `tenants` + refator do trigger.
2. Varredura e substituição de `/signup` → `/precos` (incluindo stub de redirect).
3. Pedir secrets Stripe.
4. `stripe.server.ts` + `billing.functions.ts` + webhook.
5. `/precos` + modal 3 steps + banners custom.
6. Ajustes em `/login`.
7. `/bem-vindo` + guard em `_app`.
8. Teste end-to-end (Stripe test mode).
