# Notificações — status do serviço, modelos únicos e reenvio automático

## 1. Status do servidor de notificações

Novo painel no topo da aba **Notificações** (visível em todas as abas), com um indicador
Ativo / Instável / Inativo formado por três checagens:

- **WhatsApp da academia** — conectado ou não (já existe, passa a alimentar o indicador).
- **Motor de automação** — quando o worker de disparo rodou pela última vez. Se a última
  execução foi há mais de 30 minutos, o serviço aparece como Inativo.
- **Fila** — quantas mensagens estão agendadas, quantas estão atrasadas e quantas falharam.

O painel mostra: estado geral, última verificação, número conectado, mensagens na fila e
botão "Verificar agora". Atualiza sozinho a cada 60 segundos.

```text
[ ● ATIVO ]  Última verificação: há 4 min
WhatsApp: conectado (11 99999-9999)   Fila: 12 agendadas · 0 atrasadas · 2 com erro
```

## 2. Mensagens automáticas — manter só a versão atual

Hoje, ao editar um modelo e mudar o tipo ou o deslocamento de dias, o sistema pode criar
um segundo registro e a versão antiga continua existindo (e podendo ser disparada).

Correção:
- Ao editar, o registro existente é **atualizado no lugar** (pelo id), nunca duplicado.
- Se a nova combinação tipo + deslocamento já pertencer a outro modelo, esse outro é
  substituído/removido — sobra apenas um modelo por tipo + deslocamento.
- Limpeza única dos modelos duplicados já existentes, mantendo o mais recente.
- Mensagens ainda **não enviadas** que usariam o modelo alterado passam a usar
  automaticamente o texto novo (o texto só é congelado no momento do envio).

## 3. Aviso de erro + reenvio automático

- Toda falha de envio já grava o motivo; agora o motivo é **traduzido para linguagem
  clara** (WhatsApp desconectado, aluno sem telefone, número inválido, serviço fora do ar)
  e aparece como faixa de alerta vermelha no topo da tela, com contagem e link para o
  Histórico filtrado.
- Falhas passam a ser **reagendadas automaticamente** em vez de descartadas: o worker
  marca a mensagem para nova tentativa com espera crescente (5 min, 30 min, 2 h, 6 h,
  24 h — até 5 tentativas). Falhas definitivas (aluno sem telefone) não são retentadas e
  ficam sinalizadas como "requer correção".
- Quando a causa é corrigida (ex.: WhatsApp reconectado), o sistema **dispara na hora**
  as mensagens pendentes de reenvio, respeitando a janela de horário configurada.
- Botão **"Reenviar todas as falhas"** no Histórico, além do reenvio individual que já
  existe.

## Detalhes técnicos

**Banco (uma migration):**
- `notificacoes`: novas colunas `tentativas int default 0`, `proxima_tentativa timestamptz`,
  `erro_codigo text`; índice em `(tenant_id, status, proxima_tentativa)`.
- `notification_templates`: índice único em `(tenant_id, tipo, dias_offset)` após dedupe.
- Nova tabela `notification_worker_runs` (tenant-agnóstica, uma linha por execução do
  worker: início, fim, enviadas, falhas, erro) + GRANTs e RLS de leitura para admins.

**Backend:**
- `src/routes/api/public/hooks/dispatch-notifications.ts` — registra cada execução em
  `notification_worker_runs`; passa a incluir na busca as falhas com
  `proxima_tentativa <= now()`; ao falhar, calcula backoff e classifica o erro.
- `src/lib/notifications.functions.ts` — nova `getNotificationsHealth` (última execução,
  contagens da fila, falhas agrupadas por motivo), `retryAllFailed`, e `upsertTemplate`
  reescrita para atualizar por id e remover conflito.
- `src/lib/whatsapp-connection.functions.ts` — ao reconectar com sucesso, reprograma as
  falhas retentáveis do tenant para envio imediato.

**Frontend:**
- `src/routes/_app/notificacoes.tsx` — novo componente de painel de status + faixa de
  alerta de erros; coluna de tentativas/próxima tentativa e botão de reenvio em massa
  no Histórico.
