# Migração: Axus Kombat → Supabase próprio + Vercel

Guia para sair da hospedagem gerenciada e assumir controle total do banco.

---

## 1. Exportar o código

No Lovable: **GitHub → Connect / Export to GitHub**. O repositório passa a ser
seu, com todo o histórico. Depois: `git clone` e trabalhe localmente.

## 2. Criar o projeto no Supabase

1. Crie um projeto novo em supabase.com (escolha a região `South America (São Paulo)`).
2. Guarde: **Project URL**, **anon/publishable key**, **service_role key**,
   **database password** e o **project ref**.

## 3. Recriar o schema (tabelas, RLS, funções, triggers)

Todo o schema está versionado em `supabase/migrations/` (23 arquivos, em ordem
cronológica). Não precisa recriar nada à mão:

```bash
npm i -g supabase
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Isso aplica, na ordem: tipos enum, tabelas (`tenants`, `profiles`, `user_roles`,
`alunos`, `contratos`, `mensalidades`, `planos`, `modalidades`, `graduacoes`,
`horarios`, `presencas`, `despesas`, `notificacoes`, `notification_settings`,
`notification_templates`, `whatsapp_config`, `whatsapp_connections`,
`visitor_logs`, `system_logs`), todos os GRANTs, políticas de RLS e as funções
(`has_role`, `is_admin`, `can_access_categoria`, `gerar_mensalidades_contrato`,
`agendar_notificacoes_mensalidade`, `portal_aluno_dados`, etc.).

Confirme depois com `supabase db diff` — deve vir vazio.

## 4. Migrar os dados

Exporte os dados atuais em **Cloud → Configurações avançadas → Exportar dados**
e importe no banco novo.

Ordem de inserção (respeita as chaves estrangeiras):

```
1. tenants
2. auth.users        (via Auth Admin API — ver passo 5)
3. profiles → user_roles
4. modalidades → graduacoes → planos → horarios
5. alunos
6. contratos → mensalidades
7. presencas, despesas, historico_graduacoes
8. notification_settings, notification_templates, whatsapp_config
```

> Atenção: o trigger `tg_mensalidade_notificacoes_iud` dispara ao inserir
> mensalidades e vai reagendar notificações. Desative-o durante a carga:
> `ALTER TABLE public.mensalidades DISABLE TRIGGER tg_mensalidade_notificacoes_iud;`
> e reative ao final.

> O trigger `on_auth_user_created` cria tenant + profile + role automaticamente
> a cada novo usuário. Desative-o antes de importar usuários existentes, senão
> vai duplicar academias.

## 5. Migrar os usuários (Auth)

Usuários vivem em `auth.users`, fora do dump comum. Use a Auth Admin API do
projeto novo, preservando o mesmo `id` (UUID) para não quebrar `profiles`,
`user_roles`, `presencas.registrado_por`:

```ts
await supabaseAdmin.auth.admin.createUser({
  id: usuarioAntigo.id,
  email: usuarioAntigo.email,
  email_confirm: true,
  password: senhaTemporaria, // ou dispare "reset de senha" para todos
});
```

Hashes de senha não são exportáveis. O caminho prático é criar os usuários e
enviar redefinição de senha em massa.

Configure ainda em **Authentication → Providers/Policies**:
- Email/senha ativo, mínimo de 6 caracteres
- Proteção contra senhas vazadas (HIBP) ativada
- URLs de redirecionamento: seu domínio da Vercel

## 6. Storage

Crie o bucket **privado** `fotos-alunos` e recrie as policies de
`storage.objects` (elas estão nas migrations). Depois copie os arquivos:
baixe do bucket antigo com signed URLs e re-upload no novo, mantendo o mesmo
caminho (`<tenant_id>/<aluno_id>/...`), para que `alunos.foto_url` continue válido.

## 7. Deploy na Vercel

O projeto hoje tem alvo Cloudflare Workers (`wrangler.jsonc` + `src/server.ts`).
Para Vercel, troque o alvo do TanStack Start no `vite.config.ts`:

```ts
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  plugins: [tanstackStart({ target: "vercel" }), /* ...demais plugins */],
});
```

E remova `wrangler.jsonc` do fluxo de build. A Vercel detecta Vite
automaticamente (`npm run build`).

## 8. Variáveis de ambiente na Vercel

| Variável | Onde é usada |
|---|---|
| `VITE_SUPABASE_URL` | navegador |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | navegador |
| `VITE_SUPABASE_PROJECT_ID` | navegador |
| `SUPABASE_URL` | servidor (SSR, server functions) |
| `SUPABASE_PUBLISHABLE_KEY` | servidor (middleware de auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor (operações admin) — **nunca no cliente** |
| `EVOLUTION_API_URL` | integração WhatsApp |
| `EVOLUTION_API_KEY` | integração WhatsApp |
| `MASTER_ADMIN_EMAIL` | admin master |
| `MASTER_ADMIN_PASSWORD` | admin master |

Se usar Stripe, adicione também as chaves e o segredo do webhook.

## 9. Agendamentos (cron)

Dois endpoints hoje rodam por agendamento e autenticam pelo header `apikey`
(comparado com `SUPABASE_PUBLISHABLE_KEY`):

| Endpoint | Frequência |
|---|---|
| `POST /api/public/hooks/notify-mensalidades` | 1x/dia — marca vencidas e gera mensalidades futuras |
| `POST /api/public/hooks/dispatch-notifications` | a cada 15 min — envia notificações agendadas |

Na Vercel, configure em `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/public/hooks/notify-mensalidades", "schedule": "0 9 * * *" },
    { "path": "/api/public/hooks/dispatch-notifications", "schedule": "*/15 * * * *" }
  ]
}
```

Cron da Vercel usa GET; se mantiver os handlers em POST, use `pg_cron` +
`pg_net` no próprio Supabase, ou adicione um handler GET equivalente.

## 10. Webhooks e integrações

- **Stripe**: aponte o webhook para `https://SEU-DOMINIO/api/public/stripe-webhook`
  e atualize o signing secret.
- **Evolution API**: as instâncias de WhatsApp precisam ser reconectadas
  (novo QR Code) se você trocar de servidor Evolution.
- **Portal do aluno**: os links usam `alunos.portal_token`; como os tokens vêm
  no dump, os links continuam válidos — só muda o domínio.

## 11. Checklist final

- [ ] `supabase db diff` vazio (schema idêntico)
- [ ] Contagem de linhas confere tabela a tabela
- [ ] Login funciona para admin, professor kids, professor adulto, recepção
- [ ] Professor Kids **não** enxerga aluno adulto (teste de RLS)
- [ ] Fotos dos alunos carregam
- [ ] Fila de notificações mostra os agendamentos corretos
- [ ] Crons executando (verifique `notification_worker_runs`)
