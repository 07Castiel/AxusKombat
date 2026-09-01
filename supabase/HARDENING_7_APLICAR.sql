-- ============================================================================
-- HARDENING — ETAPA 3
--
-- Rode depois da ETAPA 2. Fecha A4 e M12, e ensina o trigger de cadastro a
-- honrar o convite de equipe (M5).
--
-- Um BEGIN, um COMMIT. Nenhum comando altera linha de dado de negocio.
-- Desfazer: HARDENING_8_ROLLBACK.sql   Conferir: HARDENING_9_VERIFICAR.sql
-- ============================================================================

BEGIN;


-- ============================================================================
-- A4 — agregacao no Postgres
--
-- O painel buscava TODAS as mensalidades, alunos e despesas sem limite e somava
-- no navegador. O PostgREST corta a resposta no max-rows (1000 por padrao) sem
-- erro nenhum: passando disso, receita, inadimplencia e lucro ficam errados em
-- silencio. Hoje sao 271 mensalidades — com 4 por contrato por rodada e nada
-- arquivado, e questao de meses.
--
-- DECISAO DE SEGURANCA: estas funcoes NAO sao SECURITY DEFINER.
--
-- Elas rodam com o papel de quem chama, entao o RLS continua valendo dentro
-- delas. Isso e o que preserva o comportamento atual: um professor ja via zeros
-- no financeiro porque as policies cortavam as linhas. Com SECURITY DEFINER a
-- funcao ignoraria RLS e passaria a devolver o faturamento inteiro da academia
-- para qualquer papel — trocariamos um bug de exatidao por um vazamento.
--
-- O filtro explicito por tenant_id e redundante com o RLS, mas ajuda o planner
-- a usar os indices idx_mensalidades_tenant_status e idx_alunos_tenant.
--
-- Datas em CURRENT_DATE (UTC no Supabase), igual ao que o cliente fazia com
-- toISOString(). Manter a mesma semantica de propósito: corrigir o fuso e uma
-- mudanca de comportamento e merece decisao separada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dashboard_resumo()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.get_current_tenant();
  v_mes    date := date_trunc('month', CURRENT_DATE)::date;
  v_alunos jsonb;
  v_fin    jsonb;
  v_desp   numeric;
  v_serie  jsonb;
  v_prox   jsonb;
  v_aniv   jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'ativos',   count(*) FILTER (WHERE status = 'ativo'),
    'inativos', count(*) FILTER (WHERE status = 'inativo'),
    'total',    count(*)
  )
  INTO v_alunos
  FROM alunos
  WHERE tenant_id = v_tenant;

  SELECT jsonb_build_object(
    'receita_recebida', coalesce(sum(valor_final) FILTER (
        WHERE status = 'pago'
          AND data_pagamento IS NOT NULL
          AND date_trunc('month', data_pagamento)::date = v_mes), 0),
    'receita_prevista', coalesce(sum(valor_final) FILTER (
        WHERE date_trunc('month', competencia)::date = v_mes
          AND status <> 'cancelado'), 0),
    'total_vencidas',   coalesce(sum(valor_final) FILTER (WHERE status = 'vencido'), 0),
    'qtd_vencidas',     count(*) FILTER (WHERE status = 'vencido'),
    'qtd_pendentes',    count(*) FILTER (WHERE status = 'pendente'),
    'inadimplentes',    count(DISTINCT aluno_id) FILTER (WHERE status = 'vencido')
  )
  INTO v_fin
  FROM mensalidades
  WHERE tenant_id = v_tenant;

  SELECT coalesce(sum(valor), 0)
  INTO v_desp
  FROM despesas
  WHERE tenant_id = v_tenant
    AND date_trunc('month', data)::date = v_mes;

  -- Seis meses de receita recebida, inclusive os meses sem nenhum pagamento:
  -- o generate_series garante que o grafico nao pule barras.
  SELECT coalesce(jsonb_agg(
           jsonb_build_object('mes', to_char(g.mes, 'YYYY-MM'),
                              'receita', coalesce(r.total, 0))
           ORDER BY g.mes), '[]'::jsonb)
  INTO v_serie
  FROM generate_series(v_mes - interval '5 months', v_mes, interval '1 month') AS g(mes)
  LEFT JOIN (
    SELECT date_trunc('month', data_pagamento)::date AS mes,
           sum(valor_final) AS total
    FROM mensalidades
    WHERE tenant_id = v_tenant
      AND status = 'pago'
      AND data_pagamento IS NOT NULL
    GROUP BY 1
  ) r ON r.mes = g.mes::date;

  SELECT coalesce(jsonb_agg(t.linha ORDER BY t.data_vencimento), '[]'::jsonb)
  INTO v_prox
  FROM (
    SELECT m.data_vencimento,
           jsonb_build_object(
             'id', m.id,
             'aluno', a.nome_completo,
             'data_vencimento', m.data_vencimento,
             'valor', m.valor_final
           ) AS linha
    FROM mensalidades m
    JOIN alunos a ON a.id = m.aluno_id
    WHERE m.tenant_id = v_tenant
      AND m.status = 'pendente'
      AND m.data_vencimento >= CURRENT_DATE
      AND m.data_vencimento <= CURRENT_DATE + 7
    ORDER BY m.data_vencimento
    LIMIT 8
  ) t;

  SELECT coalesce(jsonb_agg(
           jsonb_build_object('id', id,
                              'nome_completo', nome_completo,
                              'data_nascimento', data_nascimento)
           ORDER BY extract(day FROM data_nascimento)), '[]'::jsonb)
  INTO v_aniv
  FROM alunos
  WHERE tenant_id = v_tenant
    AND data_nascimento IS NOT NULL
    AND extract(month FROM data_nascimento) = extract(month FROM CURRENT_DATE);

  RETURN jsonb_build_object(
    'alunos',          v_alunos,
    'financeiro',      v_fin,
    'despesas_mes',    v_desp,
    'lucro_mes',       (v_fin->>'receita_recebida')::numeric - v_desp,
    'serie_receita',   v_serie,
    'proximos_vencimentos', v_prox,
    'aniversariantes', v_aniv
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_resumo() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.dashboard_resumo() TO authenticated;


CREATE OR REPLACE FUNCTION public.relatorio_periodo(p_de date, p_ate date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.get_current_tenant();
  v_tot    jsonb;
  v_mensal jsonb;
  v_rank   jsonb;
  v_cat    jsonb;
  v_comp   jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de THEN
    RAISE EXCEPTION 'Período inválido: a data final não pode ser anterior à inicial';
  END IF;

  SELECT jsonb_build_object(
    'recebido', coalesce(sum(valor_final) FILTER (WHERE status = 'pago'), 0),
    'vencido',  coalesce(sum(valor_final) FILTER (WHERE status = 'vencido'), 0),
    'pendente', coalesce(sum(valor_final) FILTER (WHERE status = 'pendente'), 0)
  )
  INTO v_tot
  FROM mensalidades
  WHERE tenant_id = v_tenant
    AND data_vencimento BETWEEN p_de AND p_ate;

  -- Receita e despesa lado a lado, mes a mes. O FULL JOIN garante que um mes
  -- que so tem despesa (ou so receita) ainda apareca na serie.
  SELECT coalesce(jsonb_agg(
           jsonb_build_object('mes', mes,
                              'receita', coalesce(receita, 0),
                              'despesa', coalesce(despesa, 0))
           ORDER BY mes), '[]'::jsonb)
  INTO v_mensal
  FROM (
    SELECT coalesce(r.mes, d.mes) AS mes, r.receita, d.despesa
    FROM (
      SELECT to_char(data_pagamento, 'YYYY-MM') AS mes, sum(valor_final) AS receita
      FROM mensalidades
      WHERE tenant_id = v_tenant AND status = 'pago' AND data_pagamento IS NOT NULL
        AND data_vencimento BETWEEN p_de AND p_ate
      GROUP BY 1
    ) r
    FULL JOIN (
      SELECT to_char(data, 'YYYY-MM') AS mes, sum(valor) AS despesa
      FROM despesas
      WHERE tenant_id = v_tenant AND data BETWEEN p_de AND p_ate
      GROUP BY 1
    ) d ON d.mes = r.mes
  ) s;

  SELECT coalesce(jsonb_agg(t.linha ORDER BY t.atrasadas DESC, t.total DESC), '[]'::jsonb)
  INTO v_rank
  FROM (
    SELECT count(*) AS atrasadas,
           sum(m.valor_final) AS total,
           jsonb_build_object(
             'nome', a.nome_completo,
             'atrasadas', count(*),
             'total', sum(m.valor_final)
           ) AS linha
    FROM mensalidades m
    JOIN alunos a ON a.id = m.aluno_id
    WHERE m.tenant_id = v_tenant
      AND m.status = 'vencido'
      AND m.data_vencimento BETWEEN p_de AND p_ate
    GROUP BY a.id, a.nome_completo
    ORDER BY 1 DESC, 2 DESC
    LIMIT 10
  ) t;

  SELECT coalesce(jsonb_agg(
           jsonb_build_object('categoria', categoria, 'total', total)
           ORDER BY total DESC), '[]'::jsonb)
  INTO v_cat
  FROM (
    SELECT coalesce(categoria, 'Outros') AS categoria, sum(valor) AS total
    FROM despesas
    WHERE tenant_id = v_tenant AND data BETWEEN p_de AND p_ate
    GROUP BY 1
  ) c;

  SELECT jsonb_build_object(
    'adulto', count(*) FILTER (WHERE categoria = 'adulto'),
    'kids',   count(*) FILTER (WHERE categoria = 'kids'),
    'ativos', count(*) FILTER (WHERE status = 'ativo'),
    'total',  count(*)
  )
  INTO v_comp
  FROM alunos
  WHERE tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'totais',    v_tot,
    'despesas',  coalesce((SELECT sum(valor) FROM despesas
                           WHERE tenant_id = v_tenant AND data BETWEEN p_de AND p_ate), 0),
    'mensal',    v_mensal,
    'inadimplentes', v_rank,
    'despesas_por_categoria', v_cat,
    'composicao_alunos', v_comp
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.relatorio_periodo(date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.relatorio_periodo(date, date) TO authenticated;


-- ============================================================================
-- M12 — exclusao de academia em uma transacao
--
-- masterDeleteTenant apagava onze tabelas em sequencia, depois os usuarios do
-- Auth, depois o tenant — cada passo com throw proprio. Uma falha no meio
-- deixava a academia pela metade, com usuarios que ainda logavam e dados ja
-- removidos.
--
-- O corpo de uma funcao e uma transacao: ou apaga tudo, ou nao apaga nada.
--
-- A ORDEM IMPORTA e nao e decorativa. Tres FKs sao ON DELETE RESTRICT:
--   horarios.modalidade_id            -> modalidades
--   historico_graduacoes.graduacao_nova_id -> graduacoes
-- (a terceira, matriculas.plano_id, morreu com a tabela em 10/06)
-- Como o RESTRICT e checado na hora, deixar o cascade de `tenants` resolver
-- sozinho pode falhar dependendo da ordem em que o Postgres processa. Por isso
-- as dependentes saem antes, explicitamente.
--
-- Os usuarios do Auth NAO sao removidos aqui: auth.users nao esta ao alcance
-- desta funcao. A funcao devolve os ids e quem chama remove depois do commit.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.master_excluir_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_users uuid[];
  v_nome  text;
BEGIN
  SELECT nome INTO v_nome FROM tenants WHERE id = p_tenant_id;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Academia % não encontrada', p_tenant_id;
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_users
  FROM profiles WHERE tenant_id = p_tenant_id;

  -- Dependentes de RESTRICT primeiro.
  DELETE FROM historico_graduacoes WHERE tenant_id = p_tenant_id;
  DELETE FROM horarios             WHERE tenant_id = p_tenant_id;

  -- Demais tabelas do tenant. Redundante com o cascade de `tenants`, mas
  -- explicito: se uma tabela nova esquecer o ON DELETE CASCADE, isto falha
  -- alto em vez de deixar lixo para tras.
  DELETE FROM presencas              WHERE tenant_id = p_tenant_id;
  DELETE FROM notificacoes           WHERE tenant_id = p_tenant_id;
  DELETE FROM notification_templates WHERE tenant_id = p_tenant_id;
  DELETE FROM notification_settings  WHERE tenant_id = p_tenant_id;
  DELETE FROM mensalidades           WHERE tenant_id = p_tenant_id;
  DELETE FROM contratos              WHERE tenant_id = p_tenant_id;
  DELETE FROM despesas               WHERE tenant_id = p_tenant_id;
  DELETE FROM graduacoes             WHERE tenant_id = p_tenant_id;
  DELETE FROM alunos                 WHERE tenant_id = p_tenant_id;
  DELETE FROM modalidades            WHERE tenant_id = p_tenant_id;
  DELETE FROM planos                 WHERE tenant_id = p_tenant_id;
  DELETE FROM whatsapp_connections   WHERE tenant_id = p_tenant_id;
  DELETE FROM whatsapp_config        WHERE tenant_id = p_tenant_id;
  DELETE FROM user_roles             WHERE tenant_id = p_tenant_id;
  DELETE FROM profiles               WHERE tenant_id = p_tenant_id;
  DELETE FROM tenants                WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'nome', v_nome,
    'usuarios', to_jsonb(v_users)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.master_excluir_tenant(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.master_excluir_tenant(uuid) TO service_role;


-- ============================================================================
-- M5 — trigger de cadastro passa a honrar o convite de equipe
--
-- createStaff cria o usuario pelo Auth e o trigger criava uma academia inteira
-- para ele, que o codigo apagava logo depois sem conferir o erro. Qualquer
-- falha parcial deixava tenants orfaos no painel mestre e nas contagens.
--
-- Agora o convite manda skip_tenant: true no metadata e o trigger nao cria
-- nada — quem monta perfil e papel e o createStaff, que ja tem o tenant certo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tenant_id UUID;
  v_tenant_nome TEXT;
  v_tenant_slug TEXT;
  v_nome_responsavel TEXT;
  v_telefone TEXT;
  v_plan TEXT;
  v_plan_period TEXT;
  v_is_trial BOOLEAN;
  v_status TEXT;
  v_onboarding_completed BOOLEAN;
BEGIN
  -- Convite de equipe: o cadastro e feito por createStaff, que aponta o perfil
  -- para uma academia existente. Criar uma aqui so geraria lixo.
  IF COALESCE((NEW.raw_user_meta_data->>'skip_tenant')::boolean, false) THEN
    RETURN NEW;
  END IF;

  v_tenant_nome := COALESCE(NEW.raw_user_meta_data->>'tenant_nome', 'Minha Academia');
  v_nome_responsavel := COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email);
  v_telefone := NEW.raw_user_meta_data->>'telefone';
  v_plan := NEW.raw_user_meta_data->>'plan';
  v_plan_period := NEW.raw_user_meta_data->>'plan_period';
  v_is_trial := COALESCE((NEW.raw_user_meta_data->>'is_trial')::boolean, false);

  IF v_plan IS NOT NULL THEN
    v_status := 'pending';
    v_onboarding_completed := false;
  ELSE
    v_status := 'active';
    v_onboarding_completed := true;
  END IF;

  v_tenant_slug := lower(regexp_replace(v_tenant_nome, '[^a-zA-Z0-9]+', '-', 'g'))
                   || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.tenants (
    nome, slug, responsavel_nome, responsavel_email, telefone,
    status, plan, plan_period, is_trial, onboarding_completed
  )
  VALUES (
    v_tenant_nome, v_tenant_slug, v_nome_responsavel, NEW.email, v_telefone,
    v_status, v_plan, v_plan_period, v_is_trial, v_onboarding_completed
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, nome_completo, email, telefone)
  VALUES (NEW.id, v_tenant_id, v_nome_responsavel, NEW.email, v_telefone);

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, v_tenant_id, 'admin');

  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


COMMIT;
