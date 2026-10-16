-- ============================================================================
-- POS-BACKUP 4 — PARAR COBRANCA DE QUEM NAO DEVIA SER COBRADO
--
-- RODE DEPOIS de aplicar supabase/migrations/20261011120000_cancela_fila_de_mensalidade_cancelada.sql.
-- Sem ela, cancelar a mensalidade (parte B) nao tira a cobranca da fila do
-- WhatsApp.
--
-- A geracao diaria (processar_mensalidades_diario) olha so contratos.status =
-- 'ativo'. Ela nao sabe se o aluno foi desativado nem se a academia tem dono.
-- No backup de 11/10/2026:
--
--   A) uma academia ativa sem nenhum usuario, com 1 aluno, contrato ativo,
--      mensalidades geradas ate jan/2027 e cobrancas na fila. Ninguem consegue
--      entrar nela para administrar.
--   B) um aluno inativo com contrato ativo e 3 mensalidades pendentes, que ja
--      recebeu cobranca.
--
-- A) e CONGELADA, nao apagada: contrato pausado, fila cancelada e academia
-- desativada, tudo marcado para poder desfazer (secao DESFAZER, no fim).
-- Apagar dados de aluno e decisao sua; o painel master tem a exclusao.
--
-- B) segue o que o botao "cancelar contrato" do app faz: contrato cancelado com
-- data_fim hoje e mensalidades pendentes a vencer canceladas. As vencidas
-- ficam como estao, porque sao divida real.
--
-- Cada PASSO e um comando so. Cole um de cada vez no editor SQL. Leia os nomes
-- no PASSO de VER antes de seguir: se algum nao deve ser tocado, pare.
-- ============================================================================


-- ============================================================================
-- A) ACADEMIA ATIVA SEM NENHUM USUARIO
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASSO A1 — VER quais academias entram. Nada e alterado aqui.
-- Esperado hoje: 1 linha.
-- ----------------------------------------------------------------------------
SELECT t.id, t.nome, t.created_at::date AS criada, (SELECT count(*) FROM public.alunos a WHERE a.tenant_id = t.id) AS alunos, (SELECT count(*) FROM public.contratos c WHERE c.tenant_id = t.id AND c.status = 'ativo') AS contratos_ativos, (SELECT count(*) FROM public.notificacoes n WHERE n.tenant_id = t.id AND n.status = 'agendada') AS na_fila FROM public.tenants t WHERE t.ativo AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.tenant_id = t.id) AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.tenant_id = t.id) AND EXISTS (SELECT 1 FROM public.alunos a WHERE a.tenant_id = t.id);


-- ----------------------------------------------------------------------------
-- PASSO A2 — CANCELAR a fila de WhatsApp dessas academias.
-- ----------------------------------------------------------------------------
UPDATE public.notificacoes n SET status = 'cancelada', motivo_cancelamento = 'Academia sem usuario: fila congelada em 2026-10-11', proxima_tentativa = NULL, updated_at = now() WHERE (n.status = 'agendada' OR (n.status = 'falhou' AND n.proxima_tentativa IS NOT NULL)) AND n.tenant_id IN (SELECT t.id FROM public.tenants t WHERE t.ativo AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.tenant_id = t.id) AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.tenant_id = t.id));


-- ----------------------------------------------------------------------------
-- PASSO A3 — PAUSAR os contratos ativos. Para de gerar mensalidade nova.
-- ----------------------------------------------------------------------------
UPDATE public.contratos c SET status = 'pausado', observacoes = concat_ws(' ', c.observacoes, '[pausado em 2026-10-11: academia sem usuario]') WHERE c.status = 'ativo' AND c.tenant_id IN (SELECT t.id FROM public.tenants t WHERE t.ativo AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.tenant_id = t.id) AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.tenant_id = t.id));


-- ----------------------------------------------------------------------------
-- PASSO A4 — DESATIVAR as academias. So entra quem teve contrato pausado no
-- PASSO A3, para nao desativar academia vazia que voce nao viu no PASSO A1.
-- ----------------------------------------------------------------------------
UPDATE public.tenants t SET ativo = false WHERE t.ativo AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.tenant_id = t.id) AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.tenant_id = t.id) AND EXISTS (SELECT 1 FROM public.contratos c WHERE c.tenant_id = t.id AND c.observacoes LIKE '%[pausado em 2026-10-11: academia sem usuario]%');


-- ============================================================================
-- B) ALUNO INATIVO OU ARQUIVADO COM CONTRATO ATIVO
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASSO B1 — VER quem entra. Nada e alterado aqui. Esperado hoje: 1 linha.
-- ----------------------------------------------------------------------------
SELECT a.nome_completo, a.status AS aluno, t.nome AS academia, c.id AS contrato_id, (SELECT count(*) FROM public.mensalidades m WHERE m.contrato_id = c.id AND m.status = 'pendente' AND m.data_vencimento >= current_date) AS pendentes_a_vencer FROM public.contratos c JOIN public.alunos a ON a.id = c.aluno_id JOIN public.tenants t ON t.id = c.tenant_id WHERE c.status = 'ativo' AND a.status IN ('inativo', 'arquivado');


-- ----------------------------------------------------------------------------
-- PASSO B2 — CANCELAR as mensalidades pendentes a vencer desses contratos.
-- Com a migration 20261011120000 aplicada, a fila do WhatsApp dessas
-- mensalidades e cancelada junto, pelo gatilho.
-- ----------------------------------------------------------------------------
UPDATE public.mensalidades m SET status = 'cancelado' FROM public.contratos c JOIN public.alunos a ON a.id = c.aluno_id WHERE m.contrato_id = c.id AND c.status = 'ativo' AND a.status IN ('inativo', 'arquivado') AND m.status = 'pendente' AND m.data_vencimento >= current_date;


-- ----------------------------------------------------------------------------
-- PASSO B3 — CANCELAR os contratos.
-- ----------------------------------------------------------------------------
UPDATE public.contratos c SET status = 'cancelado', data_fim = current_date FROM public.alunos a WHERE a.id = c.aluno_id AND c.status = 'ativo' AND a.status IN ('inativo', 'arquivado');


-- ============================================================================
-- CONFERIR (A e B). Esperado: as tres colunas = 0.
-- Se fila_de_aluno_inativo vier > 0, a migration 20261011120000 nao foi
-- aplicada antes do PASSO B2.
-- ============================================================================
SELECT (SELECT count(*) FROM public.contratos c JOIN public.alunos a ON a.id = c.aluno_id WHERE c.status = 'ativo' AND a.status IN ('inativo', 'arquivado')) AS contrato_ativo_de_aluno_inativo, (SELECT count(*) FROM public.notificacoes n JOIN public.alunos a ON a.id = n.aluno_id WHERE a.status IN ('inativo', 'arquivado') AND n.status = 'agendada') AS fila_de_aluno_inativo, (SELECT count(*) FROM public.contratos c JOIN public.tenants t ON t.id = c.tenant_id WHERE c.status = 'ativo' AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.tenant_id = t.id)) AS contrato_ativo_sem_dono;


-- ============================================================================
-- DESFAZER A) — so se a academia congelada tiver dono afinal. Um por vez.
-- (B nao tem desfazer automatico: para o aluno voltar, cadastre um contrato
-- novo pelo app, que gera as mensalidades certas a partir de hoje.)
-- ============================================================================
-- UPDATE public.tenants t SET ativo = true WHERE EXISTS (SELECT 1 FROM public.contratos c WHERE c.tenant_id = t.id AND c.observacoes LIKE '%[pausado em 2026-10-11: academia sem usuario]%');
-- UPDATE public.contratos SET status = 'ativo', observacoes = nullif(trim(replace(observacoes, '[pausado em 2026-10-11: academia sem usuario]', '')), '') WHERE status = 'pausado' AND observacoes LIKE '%[pausado em 2026-10-11: academia sem usuario]%';
-- UPDATE public.notificacoes SET status = 'agendada', motivo_cancelamento = NULL, updated_at = now() WHERE motivo_cancelamento = 'Academia sem usuario: fila congelada em 2026-10-11' AND agendada_para > now();
