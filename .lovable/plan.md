# Plano de Melhorias — Axus Kombat

> ## ✅ STATUS: MELHORIAS DE ALTO E MÉDIO IMPACTO **CONCLUÍDAS** (itens 1–7)
> Implementadas em 22/06/2026. Apenas o item 8 (polimentos diversos) ainda está pendente.

---

## ✅ 1. Módulo de Relatórios — **CONCLUÍDO**

A página `/relatorios` foi reconstruída do zero com filtros, gráficos e exportação.

**Entregue:**
- ✅ Filtros por data (intervalo personalizado, atalhos "mês atual" e "últimos 12 meses")
- ✅ 5 KPIs do período: recebido, vencido, pendente, despesas, lucro líquido
- ✅ Gráfico de barras Receita × Despesa por mês (Recharts)
- ✅ Gráfico de despesas por categoria (barras horizontais)
- ✅ Top 10 ranking de inadimplência (nome, mensalidades atrasadas, total devido)
- ✅ Composição de alunos (adulto vs. kids) com barras de proporção
- ✅ Exportação CSV completa do período

---

## ✅ 2. Módulo de Despesas — **CONCLUÍDO**

Nova rota `/despesas` com CRUD completo.

**Entregue:**
- ✅ CRUD de despesas com 10 categorias pré-definidas (Aluguel, Energia, Material, Salário, etc.)
- ✅ Campos: descrição, categoria, valor, data, observações
- ✅ Filtros por mês e categoria + total do período no header
- ✅ Server functions `upsertDespesa`/`deleteDespesa` (`src/lib/despesas.functions.ts`)
- ✅ Integração automática no cálculo de lucro líquido em Relatórios e Dashboard
- ✅ Adicionado ao menu lateral com ícone Receipt

---

## ✅ 3. Controle de Presença / Check-in — **CONCLUÍDO**

Nova rota `/presencas` com tela de chamada e dashboard de ocupação.

**Entregue:**
- ✅ Tabela `presencas` criada (horário + aluno + data, único, RLS por tenant)
- ✅ Tela de chamada: seleciona data → horário → marca presença com checkbox
- ✅ Filtra automaticamente alunos pela categoria do horário (adulto/kids)
- ✅ KPIs em tempo real: presentes / total, capacidade, % ocupação (vermelho se >90%)
- ✅ Server functions `togglePresenca` e `frequenciaAluno` para histórico
- ✅ Adicionado ao menu lateral (visível para professores também)

---

## ✅ 4. Portal do Aluno — **CONCLUÍDO**

Portal público read-only acessível via link único.

**Entregue:**
- ✅ Campo `portal_token` (text único) em `alunos`
- ✅ Função RPC `portal_aluno_dados(token)` (SECURITY DEFINER) retornando dados em JSON
- ✅ Rota pública `/portal/$token` (sem autenticação) com layout responsivo
- ✅ Aluno vê: dados pessoais, mensalidades (com status colorido), próximos horários, histórico de graduação
- ✅ Total em aberto destacado em vermelho
- ✅ Geração de link a partir do cadastro do aluno: botão "copiar link do portal" em cada linha
- ✅ Server function `gerarPortalToken` cria token aleatório e copia URL completa para o clipboard

---

## ✅ 5. Pausar Contratos — **CONCLUÍDO**

Função `pausarContrato` agora tem UI.

**Entregue:**
- ✅ Botão Pausar/Retomar contrato (ícone Pause/Play) na lista de alunos
- ✅ Server function `pausarContrato` já existente, agora exposta
- ✅ Query de contratos atualizada para incluir status "pausado" (não só ativo)
- ✅ Ao pausar, geração de mensalidades futuras é suspensa
- ✅ Ao reativar, mensalidades são geradas novamente automaticamente
- ✅ Toast de feedback ao alternar status

---

## ✅ 6. Notificações Expandidas — **CONCLUÍDO**

Nova capacidade de comunicado em massa via WhatsApp.

**Entregue:**
- ✅ Nova aba "Comunicado" em `/notificacoes`
- ✅ Server function `enviarComunicado` envia mensagem única para um grupo
- ✅ Filtros: todos / adulto / kids + opção "apenas ativos"
- ✅ Cada envio é registrado em `notificacoes` com tipo `COMUNICADO`
- ✅ Resultado retorna contagem: enviados, falhas, sem-telefone
- ✅ Confirmação antes de envio em massa
- ✅ Filtro "Comunicado" adicionado ao histórico
- ✅ Validação: requer WhatsApp conectado

---

## ✅ 7. Configurações da Academia — **CONCLUÍDO**

Página `/configuracoes` totalmente reformulada em abas.

**Entregue:**
- ✅ Bug corrigido: título da aba agora é "Configurações | Axus Kombat" (antes "CT Aquiles")
- ✅ Página organizada em 4 abas: Perfil, Academia, Notificações, Segurança
- ✅ **Academia**: nome, nome fantasia, CNPJ/CPF, telefone, responsável, e-mail, endereço, URL do logo
- ✅ **Dados bancários/PIX**: chave PIX, titular, banco
- ✅ **Notificações**: switch para ativar/desativar lembretes automáticos + horário padrão de envio
- ✅ Novos campos adicionados em `tenants`: nome_fantasia, pix_chave, pix_titular, banco, notif_hora_envio, notif_lembretes_ativos
- ✅ Server functions `getTenantConfig` / `updateTenantConfig` com gate de admin

---

## ✅ 8. Pequenos Polimentos — **CONCLUÍDO**

- ✅ Busca e filtro por categoria adicionados nas abas **Faixas** e **Ranking** de Graduações
- ✅ `StatusBadge` refatorado para usar tokens semânticos (`success`/`warning`/`destructive`/`muted`) — contraste correto em ambos os temas
- ✅ `useVisitorTracking` validado: ativo em `src/routes/__root.tsx`
- ✅ Título da aba Configurações já corrigido no item 7

---

## Resumo Final

| Status | Melhoria |
|---|---|
| ✅ Concluído | 1. Relatórios com filtros e gráficos |
| ✅ Concluído | 2. CRUD de Despesas |
| ✅ Concluído | 3. Controle de Presença / Check-in |
| ✅ Concluído | 4. Portal do Aluno (link público) |
| ✅ Concluído | 5. Pausar contratos |
| ✅ Concluído | 6. Comunicado em massa |
| ✅ Concluído | 7. Configurações da academia |
| ✅ Concluído | 8. Polimentos diversos |

## Arquivos criados/alterados

**Novos:**
- `src/lib/despesas.functions.ts`
- `src/lib/presencas.functions.ts`
- `src/lib/tenant.functions.ts`
- `src/lib/comunicados.functions.ts`
- `src/routes/_app/despesas.tsx`
- `src/routes/_app/presencas.tsx`
- `src/routes/portal.$token.tsx` (rota pública)

**Alterados:**
- `src/routes/_app/relatorios.tsx` (reescrita completa)
- `src/routes/_app/configuracoes.tsx` (reescrita completa)
- `src/routes/_app/alunos.tsx` (botões pausar + portal)
- `src/routes/_app/notificacoes.tsx` (aba comunicado)
- `src/components/AppLayout.tsx` (itens "Despesas" e "Presenças" no menu)

**Migração:**
- Nova tabela `presencas` com RLS por tenant
- Coluna `portal_token` em `alunos`
- 6 novas colunas em `tenants` (nome_fantasia, pix_*, banco, notif_*)
- Função RPC `portal_aluno_dados(token)`
