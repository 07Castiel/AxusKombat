# Plano de Melhorias — Axus Kombat

Baseado na auditoria completa do sistema, aqui estão as melhorias prioritárias, ordenadas por impacto no dia a dia da academia.

---

## 1. Módulo de Relatórios (impacto alto)

A página `/relatorios` hoje mostra apenas 5 cards estáticos sem filtros nem período.

**O que construir:**
- Filtros por data (mês/ano, intervalo personalizado)
- Gráficos de receita vs. despesa por período
- Ranking de inadimplência (alunos com mais mensalidades atrasadas)
- Resumo de presença por modalidade/professor
- Exportação CSV/PDF

---

## 2. Módulo de Despesas (impacto alto)

A tabela `despesas` existe no banco com schema completo, mas não há tela para lançar contas (aluguel, luz, material, etc).

**O que construir:**
- CRUD de despesas com categoria, data, valor, anexo (opcional)
- Filtros por mês e categoria
- Integração automática no cálculo de "lucro líquido" do dashboard e relatórios

---

## 3. Controle de Presença / Check-in (impacto alto)

Os horários têm `capacidade_maxima`, mas não existe registro de quem compareceu à aula.

**O que construir:**
- Tela de "chamada" por horário: lista de alunos matriculados na modalidade + checkbox de presença
- Histórico de frequência por aluno
- Alerta automático para alunos com baixa frequência (ex: 3 faltas seguidas)
- Percentual de ocupação por horário no dashboard

---

## 4. Portal do Aluno (impacto médio-alto)

Hoje tudo é visão do gestor/professor. O aluno não acessa própria situação.

**O que construir:**
- Login simplificado para alunos (acesso read-only)
- Visualização de mensalidades pendentes/pagas
- Próximos horários de aula
- Histórico de graduação
- Comunicados gerais

---

## 5. Pausar Contratos + Melhorias no Financeiro (impacto médio)

A função `pausarContrato` existe no backend, mas não há botão na interface.

**O que construir:**
- Ação "Pausar" e "Reativar" no cadastro do aluno, com motivo e data de pausa
- Ao pausar, suspender geração automática de mensalidades futuras
- Regra de "reajuste de mensalidade": ao reativar, permitir novo valor

---

## 6. Notificações Expandidas (impacto médio)

Hoje só existem lembretes de cobrança (D-7, D-3, D-0).

**O que construir:**
- Notificação de promoção de graduação ("Parabéns, você subiu de faixa!")
- Alerta de baixa frequência
- Comunicados gerais da academia (feriado, evento, mudança de horário)
- Envio via WhatsApp ou e-mail (quando houver)

---

## 7. Configurações da Academia (impacto médio)

A tela `/configuracoes` só permite trocar nome e senha. O título da aba ainda diz "CT Aquiles" (bug).

**O que construir:**
- Dados da academia: nome fantasia, CNPJ, endereço, telefone, logo
- Configurações de notificação: horário padrão de envio, habilitar/desabilitar lembretes
- Dados bancários para PIX (exibição no boleto/QR Code)

---

## 8. Pequenos Polimentos (impacto baixo, esforço baixo)

- Corrigir título da aba Configurações
- Verificar se `use-visitor-tracking` está realmente ativo no layout
- Adicionar busca/filtro no módulo de graduações
- Tema light: revisar contraste em badges de status (vermelho sobre fundo claro)

---

## Resumo de Prioridade

| Prioridade | Melhoria | Esforço estimado |
|---|---|---|
| 1 | Relatórios com filtros e gráficos | Médio |
| 2 | CRUD de Despesas | Baixo |
| 3 | Controle de Presença / Check-in | Médio |
| 4 | Portal do Aluno | Médio-Alto |
| 5 | Pausar contratos + ajustes financeiros | Baixo |
| 6 | Notificações expandidas | Médio |
| 7 | Configurações da academia | Baixo |
| 8 | Polimentos diversos | Muito baixo |

Se quiser, posso detalhar qualquer um desses itens ou criar um plano técnico completo para implementação.