# Plano de Implementação — CT Aquiles SaaS v2

Este é um lote grande (10 áreas). Vou implementar tudo em sequência, sem quebrar o que já existe. Abaixo o que será feito em cada bloco.

---

## 1. Banco de Dados (migration única)

**Novas colunas:**
- `tenants`: `responsavel_nome`, `telefone`, `cnpj_cpf`
- `alunos`: `email`, `cpf`, `endereco`
- `horarios`: `hora_fim`, `professor`, `capacidade_maxima`
- `historico_graduacoes`: já existe (será usado para atribuição/ranking)

**Permitir DELETE** em `alunos`, `matriculas`, `horarios`, `graduacoes`, `pagamentos`, `historico_graduacoes` (políticas RLS de DELETE para admin).

**Atualizar `handle_new_user`** para gravar `responsavel_nome`, `telefone`, `cnpj_cpf` no tenant a partir de `raw_user_meta_data`.

**Atualizar política de SELECT em `tenants`** para permitir que o service role (Admin Mestre) leia tudo — na verdade service role já bypassa RLS, então OK.

---

## 2. Admin Mestre (super admin do SaaS)

- Secrets: `MASTER_ADMIN_EMAIL`, `MASTER_ADMIN_PASSWORD` (vou solicitar via `add_secret`).
- Server functions (`src/lib/master.functions.ts`) usando `supabaseAdmin` (bypass RLS):
  - `masterLogin({email, password})` → valida contra secrets, retorna token JWT simples assinado com `MASTER_ADMIN_PASSWORD` como segredo, válido por 12h.
  - `masterListTenants({token})` → lista todos tenants + contagem alunos + responsável.
  - `masterGetTenantDetails({token, tenantId})` → alunos, matrículas, pagamentos, horários, graduações.
- Rotas (públicas, sem `_app`):
  - `/admin-master` → login
  - `/admin-master/dashboard` → listagem + busca + totais
  - `/admin-master/tenant/$id` → detalhes da academia
- Token salvo em `sessionStorage` (`master_token`).

---

## 3. Signup completo (self-registration)

Refatorar `src/routes/signup.tsx`:
- Campos: responsável, academia, email, telefone, CNPJ/CPF, senha (min 8) + confirmação.
- Validação com Zod, mensagens amigáveis (e-mail já cadastrado, senha não confere).
- Toggle olhinho nos dois campos de senha.
- Passar `tenant_nome`, `nome_completo`, `telefone`, `cnpj_cpf` em `raw_user_meta_data`.
- Habilitar `auto_confirm_email` para login automático sem confirmação por e-mail.
- Após signup, fazer signIn automático e redirect para `/`.

---

## 4. Componente PasswordInput reutilizável

Criar `src/components/PasswordInput.tsx` com toggle Eye/EyeOff. Aplicar em login, signup, alteração de senha.

---

## 5. Configurações — alterar senha (somente admin)

Reformular `src/routes/_app/configuracoes.tsx`:
- Mostrar info do perfil (já existe).
- Card "Alterar senha" condicional a `isAdmin`:
  - Senha atual, nova senha, confirmar (todos com PasswordInput).
  - Validar senha atual via `signInWithPassword` antes de `updateUser({password})`.
- Permitir editar `nome_completo` do perfil (afeta o "Bem-vindo, X" do dashboard).

---

## 6. Dashboard — saudação por nome

Em `src/routes/_app/index.tsx`, header passa de e-mail → `profile.nome_completo`.

---

## 7. CRUD Alunos completo

Refatorar `src/routes/_app/alunos.tsx`:
- Tabela com colunas + 3 ações: editar (lápis), ativar/desativar, deletar (lixeira).
- Modal "Editar aluno" (reaproveita o form de criação, pré-preenchido).
- AlertDialog de confirmação para delete (com nome do aluno).
- Novos campos: email, cpf, endereco, observações.

---

## 8. CRUD Matrículas completo

Refatorar `src/routes/_app/matriculas.tsx`:
- 3 ícones de ação: editar, cancelar/reativar, deletar.
- Modal de edição (aluno, plano, datas, valor, observações).
- Confirmação de delete.

---

## 9. Pagamentos — modo manual

Refatorar `src/routes/_app/pagamentos.tsx`:
- Botão "Registrar pagamento" abrindo modal (aluno, valor, vencimento, pago em, método, status, observações). Sem `matricula_id` obrigatório (vou tornar nullable na migration).
- Lista com filtros (status, mês/ano, aluno).
- Edição (lápis) e deleção (lixeira).
- Status "atrasado" calculado automaticamente quando `data_vencimento < hoje && status='pendente'` (visualização — não muda o registro).
- Badges coloridos.

Migration extra: `pagamentos.matricula_id` → nullable.

---

## 10. CRUD Horários completo

Refatorar `src/routes/_app/horarios.tsx`:
- Novos campos: `hora_fim`, `professor`, `capacidade_maxima`.
- Form com checkboxes para múltiplos dias da semana (cria N registros).
- Lista em tabela com editar + deletar.
- Confirmação de delete.

---

## 11. Graduações — 3 módulos

Tabs em `src/routes/_app/graduacoes.tsx`:
- **Tab 1 — Faixas**: CRUD (criar/editar/deletar) com nome, cor, ordem, categoria.
- **Tab 2 — Atribuir**: dropdown aluno + dropdown graduação + data + observações. Insere em `historico_graduacoes` e atualiza `alunos.graduacao_atual_id`.
- **Tab 3 — Ranking**: lista alunos ordenados por `graduacoes.ordem DESC`. Top 3 com troféu (Trophy icon dourado/prata/bronze). Sem graduação → final da lista.

---

## 12. Outros

- `auto_confirm_email = true` no Supabase Auth.
- Toasts sonner em todas operações (já presente).
- Loading states em botões de submit.
- Responsividade mantida.

---

## Ordem de execução

1. **Solicitar secrets** `MASTER_ADMIN_EMAIL` + `MASTER_ADMIN_PASSWORD`.
2. Migration SQL.
3. `auto_confirm_email`.
4. `PasswordInput` + refatorar login/signup.
5. Admin Mestre (server fns + rotas).
6. Configurações + dashboard saudação.
7. CRUDs (Alunos, Matrículas, Pagamentos, Horários).
8. Graduações com tabs e ranking.

---

## Observação técnica

- Senha mestre será comparada via `timingSafeEqual` no servidor; token assinado com HMAC-SHA256.
- Para o admin mestre acessar dados de outros tenants, todas as queries usam `supabaseAdmin` (bypass RLS) — só executáveis depois de validar o token mestre.
- Nenhuma alteração será feita em arquivos protegidos (`client.ts`, `types.ts`, `.env`).

Posso prosseguir?
