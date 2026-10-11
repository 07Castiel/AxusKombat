# Depois do backup de 11/10/2026

O export completo do banco (`axuskombat_261011.backup`) restaura por inteiro,
mas funciona como uma credencial: leva os refresh tokens de sessão em texto
puro, o `CRON_SECRET` em texto puro dentro dos jobs do `pg_cron`, o hash das
senhas e dados pessoais e de saúde dos alunos. A análise dele também achou
cobrança indo para quem não devia e um registro de migrations que, rodado como
está, trocaria a matrícula de todos os alunos.

Este guia fecha isso. Os scripts são para o editor SQL da Lovable
(**Cloud → SQL**). Cada `PASSO` é um comando só: cole um de cada vez, porque o
editor parte script longo em pedaços e mostra só o último resultado.

Todos foram testados numa cópia restaurada do próprio backup, com o
`pg_cron`, o `pg_net` e o Vault substituídos por versões mínimas com a mesma
assinatura (eles só existem no Supabase).

## No editor SQL, nesta ordem

| # | O quê | Efeito |
|---|---|---|
| 1 | `POS_BACKUP_1_SESSOES.sql` | Apaga as 6 sessões abertas. Os tokens do backup param de valer. Todo mundo entra de novo, com a mesma senha. |
| 2 | `POS_BACKUP_2_CRON_SECRET.sql` | Gera um `CRON_SECRET` novo dentro do Vault e faz os 2 jobs lerem dele. No meio, você cola o valor novo em **Cloud → Secrets → CRON_SECRET**. |
| 3 | `POS_BACKUP_3_DRIZZLE.sql` | Registra a 0002 e a 0003 como aplicadas. Um `drizzle-kit migrate` deixa de reexecutá-las. |
| 4 | `migrations/20261011120000_cancela_fila_de_mensalidade_cancelada.sql` (cole o arquivo inteiro) | Mensalidade cancelada passa a tirar a cobrança da fila do WhatsApp. Antes, só a paga tirava. |
| 5 | `POS_BACKUP_4_COBRANCA_INDEVIDA.sql` | Congela a academia ativa que não tem nenhum usuário e cancela o contrato do aluno inativo. Mostra os nomes antes; tem seção para desfazer. |
| 6 | `POS_BACKUP_5_CONFERIR.sql` | Só leitura. Lista o que pede decisão sua (seção abaixo). |

A ordem 4 → 5 importa: sem a migration, o passo 5 cancela as mensalidades mas
a cobrança continua na fila.

## Fora do banco

**O arquivo de backup.** Guarde cifrado e apague as cópias sem cifra (o
`.backup`, o `.zip` e a lixeira):

- 7-Zip: *Adicionar ao arquivo* → formato 7z → senha forte → marque
  *Criptografar nomes de arquivo*. Usa AES-256.
- Linha de comando: `gpg -c --cipher-algo AES256 axuskombat_261011.backup`

O arquivo também foi anexado a uma conversa com o Claude. A cópia no ambiente
da sessão foi apagada. Para tirar o anexo do histórico, apague a conversa.

**Exports antigos no Storage** (consulta 5). Os buckets `database_export_*`
guardam cópias completas do banco. Baixe o que quiser manter (cifrado) e
apague os buckets em **Cloud → Storage**. Não apague pelo SQL: o Supabase
bloqueia `DELETE` direto em `storage.objects`, e o arquivo continuaria no
armazenamento.

## Decisões suas (`POS_BACKUP_5_CONFERIR.sql`)

| Consulta | Achado no backup | O que fazer |
|---|---|---|
| 1 | 2 alunos com matrícula e sem data de nascimento | Preencher pelo app. Sem ela, o login do portal não passa. |
| 2 | 1 usuário que faz login mas não tem perfil nem academia | Apague em **Cloud → Users**. Se for alguém da equipe, cadastre de novo pela tela Equipe depois de apagar, porque o cadastro cria o login com o mesmo e-mail. |
| 3 | 4 academias sem usuário: a congelada no passo 5 e 3 vazias | As vazias não geram cobrança. Para apagar, use a exclusão do painel master. Uma delas tem cliente no Stripe e nenhuma assinatura: confira no Stripe e apague o cliente lá se for cadastro abandonado. |
| 4 | Papel `sandbox_exec` com leitura de `auth.users`, `auth.sessions` e `auth.refresh_tokens` | É da plataforma (provavelmente o executor de SQL da Lovable). Se `rolcanlogin` ou `rolbypassrls` vier `true`, pergunte ao suporte da Lovable. Não altere o papel por conta própria. |
| 5 | Exports completos do banco no Storage | Ver "Fora do banco". |

## Achado lateral: ETAPA 4 do hardening

`HARDENING_10_APLICAR.sql` (fila sem corrida) não estava aplicado no backup.
**Não aplique como está**: ele roda sem erro, mas a função
`reivindicar_notificacoes` que ele cria falha em toda chamada
(`FOR UPDATE is not allowed with UNION/INTERSECT/EXCEPT`, testado em Postgres
16 e 18). O worker cai no caminho antigo sem a proteção contra envio
duplicado, que é o mesmo comportamento de hoje. A função precisa ser reescrita
antes.
