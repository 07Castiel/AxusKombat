## Refatoração do Módulo de Notificações — Axus Kombat

### Diagnóstico dos problemas atuais

1. **Modelo daily-scan**: `notify-mensalidades` (cron 05:00 UTC = **02:00 BRT**) varre `mensalidades` procurando `D-7 / D-3 / D-0`. Se o vencimento mudar depois do scan, ou o aluno for criado no meio do dia, nada acontece até o próximo dia — e a mensagem sai às 2h.
2. **Prazos fixos**: `D-7 / D-3 / D-0` estão hardcoded no handler.
3. **Sem janela horária**: nada controla horário permitido/preferencial nem fuso.
4. **Sem cancelamento em alterações**: contratos/mensalidades mudam sem limpar notificações pendentes.
5. **Templates só cobrem 3 tipos**, variáveis limitadas.
6. **Aba "Mensagens" mistura tudo**.

### Nova arquitetura — event-driven + worker de janela

```text
+-----------------------------------+       +----------------------------+
| Trigger DB (alunos, contratos,    | ----> | fn agendar_notificacoes()  |
| mensalidades: INSERT/UPDATE/DEL)  |       | - cancela pendentes        |
+-----------------------------------+       | - recalcula agendada_para  |
                                            |   em cada mensalidade      |
+-----------------------------------+       +-------------+--------------+
| Aba Automação (config por tenant) | ------>              |
+-----------------------------------+                      v
                                            +----------------------------+
             pg_cron a cada 15 min  ------> | /api/public/hooks/         |
             (cobre janela 08–20h)          | dispatch-notifications     |
                                            | envia só as due AGORA      |
                                            | dentro da janela do tenant |
                                            +----------------------------+
```

Notificações passam a ser **agendadas com timestamp exato** (`agendada_para`), não descobertas em runtime. Um worker leve dispara apenas o que está `pendente` e cujo `agendada_para <= now()` dentro da `[hora_inicio, hora_fim]` do tenant.

### Alterações no banco

**Nova tabela `notification_settings` (1 por tenant):**
- `dias_antes_lembrete int[]` (default `{2}`)
- `enviar_no_vencimento bool` (default true)
- `dias_apos_vencimento int[]` (default `{}`)
- `hora_inicio time` (default `08:00`), `hora_fim time` (`20:00`)
- `hora_preferencial time` (`09:00`)
- `timezone text` (`America/Sao_Paulo`)
- `pix_chave text`, `assinatura text`

**Nova tabela `notification_templates` (1 por tipo por tenant):**
- `tipo text` (`lembrete`, `vencimento`, `atraso`, `boas_vindas`, `manual`)
- `dias_offset int` (permite N templates de lembrete: -2, -1, +1)
- `mensagem text`

**Alterações em `notificacoes`:**
- adicionar `agendada_para timestamptz NOT NULL`
- adicionar `motivo_cancelamento text`
- novo status `cancelada` (já existe no enum)
- novo status `agendada` (já existe)
- adicionar índice `(tenant_id, status, agendada_para)`

**Novas funções SQL:**
- `agendar_notificacoes_mensalidade(mensalidade_id)` — cancela pendentes/agendadas dessa mensalidade com motivo, recalcula e insere novos registros `status='agendada'` combinando `data_vencimento + offset` com `hora_preferencial` no timezone do tenant.
- `agendar_notificacoes_aluno(aluno_id)` — itera mensalidades futuras `pendente` do aluno.
- `cancelar_notificacoes_mensalidade(mensalidade_id, motivo)`.

**Triggers (AFTER):**
- `alunos`: INSERT / UPDATE de status → reagendar
- `contratos`: INSERT / UPDATE de `dia_vencimento`, `valor_mensalidade`, `status`, `plano_id` → cancelar + regenerar mensalidades futuras + reagendar
- `mensalidades`: INSERT → agendar; UPDATE de `data_vencimento` → cancelar antigas + reagendar; UPDATE `status` para `pago` → cancelar pendentes; DELETE → cancelar.

**GRANTS + RLS** por tenant (segue padrão existente; nenhuma policy antiga de alunos/professores é tocada).

### Worker de disparo

- Rota nova `src/routes/api/public/hooks/dispatch-notifications.ts` — chamada a cada 15 min por `pg_cron`.
- Lê `notificacoes` `status='agendada' AND agendada_para <= now()`, agrupa por `tenant_id`, checa `notification_settings.hora_inicio/hora_fim/timezone` — fora da janela: pula (não marca falha).
- Renderiza template com todas as variáveis (`{primeiro_nome}`, `{telefone}`, `{modalidade}`, `{plano}`, `{pix}`, `{dias_restantes}`, `{professor}`, `{link_pagamento}` além das existentes).
- Envia via `sendWhatsappByTenant`, atualiza `status`, `enviada_em`, `erro`.
- Cron antigo `mensalidades-daily` **mantido só** para: marcar vencidas + gerar mensalidades futuras (rolling 3 meses). O trigger em `mensalidades` cuida do agendamento das novas.
- Novo cron `dispatch-notifications-15min` `*/15 * * * *` chamando o worker.

**Correção da causa raiz do envio às 2h:** worker respeita janela por tenant no timezone configurado; cron a cada 15 min só serve como tick — o filtro é aplicado por linha.

### Frontend — nova organização de abas

Reescrever `src/routes/_app/notificacoes.tsx` com 5 abas:

1. **WhatsApp** — conteúdo atual de conexão/QR/teste (reaproveita `whatsapp-connection.functions`).
2. **Automação** — form de `notification_settings`: chips para `dias_antes_lembrete`, toggle vencimento, chips `dias_apos_vencimento`, `hora_inicio/fim/preferencial`, `timezone`, `pix_chave`, `assinatura`. Botão **"Executar verificações agora"** com descrição pedida.
3. **Modelos** — CRUD de `notification_templates` com sidebar de variáveis clicáveis (insere no cursor).
4. **Comunicados** — reaproveita `comunicados.functions.ts` já existente.
5. **Histórico** — tabela com filtros (aluno, tipo, status, período), colunas: aluno, telefone, tipo, agendada_para, enviada_em, status, erro, motivo_cancelamento, prévia da mensagem, ação **Reenviar** (se `falhou`).

**Sidebar (`AppLayout`)**: remover item "Acessos" (estrutura de banco preservada).

### Server functions (todas com `requireSupabaseAuth` + admin check)

`src/lib/notifications.functions.ts` — reescrito:
- `getNotificationSettings`, `saveNotificationSettings`
- `listTemplates`, `upsertTemplate`, `deleteTemplate`
- `listNotifications` (com filtros novos)
- `resendNotification`
- `runDispatchNow` — invoca a rota `dispatch-notifications` com secret interno.

### Migrations

Uma única migration cria: tabelas, GRANTs, RLS, funções e triggers; e um bootstrap que popula `notification_settings` + templates default para todos os tenants existentes copiando os textos hoje em `whatsapp_config.template_*`.

### Arquivos a criar / alterar

**Criar**
- `supabase/migrations/<ts>_notifications_v2.sql`
- `src/routes/api/public/hooks/dispatch-notifications.ts`
- `src/components/notifications/TabWhatsapp.tsx`
- `src/components/notifications/TabAutomacao.tsx`
- `src/components/notifications/TabModelos.tsx`
- `src/components/notifications/TabComunicados.tsx`
- `src/components/notifications/TabHistorico.tsx`

**Alterar**
- `src/lib/notifications.functions.ts` (reescrito)
- `src/lib/whatsapp.server.ts` (novo `renderTemplate` com variáveis extras)
- `src/routes/_app/notificacoes.tsx` (5 abas)
- `src/components/AppLayout.tsx` (remover Acessos)
- `src/routes/api/public/hooks/notify-mensalidades.ts` (reduzir escopo para só marcar vencidas + gerar futuras)
- Agendar novo cron via `supabase--insert` após migration.

### O que NÃO será tocado

RLS de alunos/professores/recepção/financeiro, rota `/acessos` (só some do menu), Stripe/billing, layout dark/vermelho.

### Ao final

Vou entregar um resumo de tabelas/funções/triggers criadas e do fluxo de recálculo para você documentar.
