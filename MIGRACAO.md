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

Todo o schema está versionado em `supabase/migrations/` e, para as tabelas do
portal do aluno, em `drizzle/migrations/`. Não precisa recriar nada à mão:

```bash
npm i -g supabase
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push
LOVABLE_DB_MIGRATION_URL="postgresql://...projeto-novo..." npx drizzle-kit migrate
```

> Rode `supabase db push` só no projeto **novo e vazio**. Nunca contra o banco
> da Lovable: lá o registro `supabase_migrations.schema_migrations` grava as
> versões com alguns segundos de diferença do nome dos arquivos (22 de 25) e
> não registra as 11 migrations aplicadas à mão pelo editor SQL. O push
> tentaria reaplicar 33 delas.

Isso aplica, na ordem: tipos enum, tabelas (`tenants`, `profiles`, `user_roles`,
`alunos`, `contratos`, `mensalidades`, `planos`, `modalidades`, `graduacoes`,
`horarios`, `presencas`, `despesas`, `notificacoes`, `notification_settings`,
`notification_templates`, `whatsapp_config`, `whatsapp_connections`,
`visitor_logs`, `system_logs`), todos os GRANTs, políticas de RLS e as funções
(`has_role`, `is_admin`, `can_access_categoria`, `gerar_mensalidades_contrato`,
`agendar_notificacoes_mensalidade`, etc.).

Confirme depois com `supabase db diff` — deve vir vazio.

## 4. Migrar os dados

Exporte os dados atuais em **Cloud → Configurações avançadas → Exportar dados**.
O arquivo é um `pg_dump` no formato custom do Postgres 17: abra com
`pg_restore` **17 ou mais novo** (o 16 recusa com `unsupported version (1.16)`).

**Não restaure o arquivo inteiro.** Ele traz também `auth`, `storage`,
`realtime`, `vault`, `cron` e `supabase_migrations`, que no projeto novo já
existem e pertencem a papéis gerenciados pelo Supabase. Extraia só os dados do
`public` e os usuários:

```bash
pg_restore --data-only --schema=public -f dados.sql axuskombat.backup
pg_restore --data-only --schema=auth --table=users --table=identities -f usuarios.sql axuskombat.backup

psql "postgresql://...projeto-novo..." --single-transaction -v ON_ERROR_STOP=1 \
  -c "SET session_replication_role = replica" \
  -f usuarios.sql -f dados.sql
```

`session_replication_role = replica` desliga triggers e checagem de chave
estrangeira durante a carga, então a ordem das tabelas não importa e nenhum
gatilho dispara: `on_auth_user_created` não cria academia duplicada e
`tg_mensalidade_notificacoes_iud` não reagenda a fila.

Não traga o schema `drizzle`: o registro dele no projeto novo é o que o
`drizzle-kit migrate` do passo 3 gravou, e o do backup colide com ele.

Testado com o backup de 11/10/2026: os dados do `public` entram sem erro num
banco montado só pelas migrations do repositório, com as mesmas contagens do
original (6 academias, 65 alunos, 424 mensalidades, 76 notificações).

## 5. Migrar os usuários (Auth)

O export completo da Lovable traz `auth.users` com o hash bcrypt de cada senha
e `auth.identities`. O `usuarios.sql` do passo 4 leva os dois, com o mesmo `id`
(UUID) que `profiles`, `user_roles` e `presencas.registrado_por` usam: cada
usuário entra no projeto novo com a senha que já tinha.

Se a carga falhar em `usuarios.sql` porque o `auth.users` do projeto novo tem
colunas diferentes, nada entra (é uma transação só). Rode o passo 4 sem
`-f usuarios.sql` e crie os usuários pela Auth Admin API, preservando o `id` e
enviando redefinição de senha:

```ts
await supabaseAdmin.auth.admin.createUser({
  id: usuarioAntigo.id,
  email: usuarioAntigo.email,
  email_confirm: true,
  password: senhaTemporaria, // ou dispare "reset de senha" para todos
});
```

Não traga `auth.sessions` nem `auth.refresh_tokens`: todo mundo entra de novo.

> O export tem os hashes de senha, os tokens de sessão em texto puro e dados
> pessoais e de saúde dos alunos. Guarde o arquivo cifrado e apague as cópias
> soltas (ver `supabase/POS_BACKUP_LEIA-ME.md`).

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
| `CRON_SECRET` | hooks de cron — sem ela os hooks respondem 503 |

Se usar Stripe, adicione também as chaves e o segredo do webhook.

## 9. Agendamentos (cron)

Dois endpoints rodam por agendamento e autenticam pelo header `x-cron-secret`,
comparado com `CRON_SECRET` (`src/lib/cron-auth.ts`). A chave publicável não é
mais aceita:

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

Os jobs do `pg_cron` não vêm no passo 4 e precisam ser recriados no projeto
novo, apontando para o domínio novo. Guarde o segredo no Vault, não no texto do
job: o comando de cada job é copiado para `cron.job_run_details` a cada
execução, e um segredo literal ali vai junto em todo backup.

```sql
SELECT vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'x-cron-secret dos jobs do pg_cron');
-- copie o valor abaixo para CRON_SECRET na Vercel
SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';

SELECT cron.schedule('dispatch-notifications-15min', '*/15 * * * *', $$
  SELECT net.http_post(
    url     := 'https://SEU-DOMINIO/api/public/hooks/dispatch-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')),
    body    := '{}'::jsonb)
$$);
-- idem para 'mensalidades-daily', '0 5 * * *', /api/public/hooks/notify-mensalidades
```

## 10. Webhooks e integrações

- **Stripe**: aponte o webhook para `https://SEU-DOMINIO/api/public/stripe-webhook`
  e atualize o signing secret.
- **Evolution API**: as instâncias de WhatsApp precisam ser reconectadas
  (novo QR Code) se você trocar de servidor Evolution.
- **Portal do aluno**: o acesso é feito em `/portal` com a matrícula e a data
  de nascimento. Confirme que as tabelas `aluno_credenciais`, `aluno_sessoes` e
  `aluno_login_tentativas` foram migradas. Elas nascem em `drizzle/migrations/`,
  não em `supabase/migrations/` — aplique as duas pastas (passo 3).

## 11. Checklist final

- [ ] `supabase db diff` vazio (schema idêntico)
- [ ] Contagem de linhas confere tabela a tabela
- [ ] Login funciona para admin, professor kids, professor adulto, recepção
- [ ] Professor Kids **não** enxerga aluno adulto (teste de RLS)
- [ ] Fotos dos alunos carregam
- [ ] Fila de notificações mostra os agendamentos corretos
- [ ] Crons executando (verifique `notification_worker_runs`)
- [ ] Nenhum job do cron com segredo literal no comando (`supabase/POS_BACKUP_2_CRON_SECRET.sql`, PASSO 5)
