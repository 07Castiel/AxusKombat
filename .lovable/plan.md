## Refatoração: Financeiro Recorrente

Vou substituir o modelo manual atual por **contratos** + **mensalidades** geradas automaticamente. Como você escolheu "resetar", apago todos os pagamentos e matrículas existentes.

### 1. Banco de dados (migration única)

**Apaga:**
- `pagamentos` (todas as linhas e a tabela inteira)
- `matriculas` (todas as linhas e a tabela inteira)
- `notificacoes` linhas órfãs (mantém tabela, troca FK para `mensalidade_id`)

**Cria `contratos`** (assinatura do aluno):
- aluno_id, plano_id (opcional), valor_mensalidade, dia_vencimento (1–28), data_inicio, data_fim (nullable), status (`ativo` | `pausado` | `cancelado`), observacoes
- Um aluno pode ter histórico, mas só 1 contrato `ativo` por vez (índice parcial único)

**Cria `mensalidades`** (núcleo financeiro):
- contrato_id, aluno_id, tenant_id
- competencia (date, dia 1 do mês), data_vencimento, valor, desconto, valor_final (gerado), forma_pagamento, data_pagamento, status (`pendente` | `pago` | `vencido` | `cancelado`), observacoes_pagamento
- Único por `(contrato_id, competencia)` — evita duplicatas em re-execuções do cron

**Ajusta `notificacoes`:** troca `matricula_id` por `mensalidade_id` (FK + índice único `(mensalidade_id, tipo)`).

RLS + GRANTs para tenant_id em ambas. Trigger `updated_at`.

### 2. Geração automática (rolling 3 meses)

**Função SQL `gerar_mensalidades_contrato(contrato_id)`:** garante que existam mensalidades pendentes para o mês corrente + 3 meses à frente, sem duplicar.

**Disparos:**
- Ao criar/ativar contrato (server fn chama a função)
- Cron diário 05:00 UTC: roda para todos contratos `ativo` + marca `pendente` com vencimento < hoje como `vencido`

### 3. Server functions (`src/lib/contratos.functions.ts`, `mensalidades.functions.ts`)

- `createContrato`, `updateContrato`, `pausarContrato`, `cancelarContrato`
- `listMensalidades` (filtros: status, aluno, mês, vencidos)
- `registrarPagamento(mensalidade_id, { data_pagamento, forma_pagamento, desconto, observacoes })` → marca `pago`
- `cancelarMensalidade`, `editarMensalidade` (admin override)
- `dashboardFinanceiro(mes)` → totais agregados

### 4. UI

**Cadastro/edição de aluno** (`_app/alunos.tsx`): nova seção "Plano":
- valor mensalidade, dia vencimento, data início, status — ao salvar cria/atualiza contrato e gera mensalidades.

**Nova rota `/financeiro`** (renomeia `pagamentos` → `financeiro`):
- Tabela de mensalidades com filtros (status, aluno, mês)
- Ação "Registrar pagamento" abre modal com desconto/forma/observações
- Badges: pendente/pago/vencido/cancelado

**Dashboard `_app/index.tsx`** (cards adicionais):
- Receita recebida no mês, receita prevista, vencidas, pendentes, qtd alunos inadimplentes, lista "Próximos 7 dias"

### 5. Notificações WhatsApp

Atualizo `notify-matriculas` (renomeio para `notify-mensalidades`) para varrer `mensalidades` com `status = 'pendente'` em D-7, D-3, D-0. Como o cron marca `vencido` antes, e o filtro é estrito por status, pagas/canceladas/vencidas não recebem aviso — atende a regra "se pago, cancela próximos avisos".

### 6. Limpeza

Remove `src/lib/notifications.functions.ts` refs a `matricula_id` → `mensalidade_id`. Atualiza `notificacoes` page para mostrar contexto da mensalidade.

### Detalhes técnicos

- `valor_final` como coluna gerada: `GENERATED ALWAYS AS (valor - COALESCE(desconto,0)) STORED`
- Função `gerar_mensalidades_contrato` `SECURITY DEFINER`, idempotente via `ON CONFLICT DO NOTHING`
- Cron diário único substitui o cron antigo de notificações (`notify-matriculas` deixa de existir)
- Dia de vencimento > último dia do mês (ex: 31 em fev): usa último dia do mês
- "Inadimplente" = aluno com pelo menos 1 mensalidade `vencido` (query simples no dashboard)

### Pergunta final antes de executar

Você confirma que posso **apagar todas as tabelas `pagamentos` e `matriculas` + todos os dados existentes nelas**? Não tem volta.