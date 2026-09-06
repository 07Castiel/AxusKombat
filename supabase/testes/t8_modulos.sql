\echo '### ITEM 8 — impacto nos outros modulos'
\echo '-- 8.1 policy reescrita devolve EXATAMENTE o mesmo conjunto de linhas, papel a papel'
-- guarda o que cada papel enxerga com a policy NOVA
CREATE TEMP TABLE visao_nova AS SELECT NULL::text papel, NULL::uuid id WHERE false;
GRANT ALL ON visao_nova TO authenticated;
DO $d$
DECLARE u record;
BEGIN
  FOR u IN SELECT unnest(ARRAY['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002',
                               '11111111-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000004',
                               '11111111-0000-0000-0000-000000000005','22222222-0000-0000-0000-000000000001']) AS uid
  LOOP
    EXECUTE format('SET request.jwt.claim.sub = %L', u.uid);
    SET LOCAL ROLE authenticated;
    EXECUTE format('INSERT INTO visao_nova SELECT %L, id FROM presencas', u.uid);
    RESET ROLE;
  END LOOP;
END $d$;

-- restaura a policy ORIGINAL de 20260701033153 e compara
BEGIN;
DROP POLICY presencas_select ON public.presencas;
CREATE POLICY presencas_select ON public.presencas FOR SELECT TO authenticated
USING (
  tenant_id = public.get_current_tenant() AND (
    public.is_admin() OR public.is_recepcao()
    OR EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = presencas.aluno_id
      AND ((public.is_professor_kids() AND a.categoria='kids')
        OR (public.is_professor_adulto() AND a.categoria='adulto')))
  ));
CREATE TEMP TABLE visao_velha AS SELECT NULL::text papel, NULL::uuid id WHERE false;
GRANT ALL ON visao_velha TO authenticated;
DO $d$
DECLARE u record;
BEGIN
  FOR u IN SELECT unnest(ARRAY['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002',
                               '11111111-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000004',
                               '11111111-0000-0000-0000-000000000005','22222222-0000-0000-0000-000000000001']) AS uid
  LOOP
    EXECUTE format('SET request.jwt.claim.sub = %L', u.uid);
    SET LOCAL ROLE authenticated;
    EXECUTE format('INSERT INTO visao_velha SELECT %L, id FROM presencas', u.uid);
    RESET ROLE;
  END LOOP;
END $d$;
SELECT t_ok('8.1 conjunto de linhas visiveis IDENTICO nos 6 papeis (policy antiga vs nova)',
  NOT EXISTS (SELECT papel,id FROM visao_velha EXCEPT SELECT papel,id FROM visao_nova)
  AND NOT EXISTS (SELECT papel,id FROM visao_nova EXCEPT SELECT papel,id FROM visao_velha),
  (SELECT string_agg(papel_curto||'='||n, '  ' ORDER BY papel_curto) FROM
    (SELECT right(papel,4) papel_curto, count(*) n FROM visao_nova GROUP BY 1) x));
ROLLBACK;

\echo '-- 8.2 a tela /presencas continua funcionando (consulta que ela faz de verdade)'
SET request.jwt.claim.sub='11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT t_ok('8.2 chamada do dia (horario_id + data) continua retornando linhas',
  count(*) > 0, 'linhas='||count(*))
  FROM presencas p
 WHERE (p.horario_id, p.data) IN (
   SELECT horario_id, data FROM presencas
    WHERE tenant_id='aaaaaaaa-0000-0000-0000-00000000000a' ORDER BY data DESC LIMIT 1);
SELECT t_ok('8.2 dashboard_resumo continua respondendo (nao foi tocado)',
  dashboard_resumo() IS NOT NULL, 'alunos_ativos='||(dashboard_resumo()->'alunos'->>'ativos'));
SELECT t_ok('8.2 relatorio_periodo continua respondendo',
  relatorio_periodo((now()-interval '30 days')::date, now()::date) IS NOT NULL);
SELECT t_ok('8.2 portal_aluno_dados nao foi afetado (nao le presencas)',
  portal_aluno_dados('token-inexistente') IS NULL);
RESET ROLE;

\echo '-- 8.3 escrita de presenca (togglePresenca) nao regrediu com os 2 indices novos'
SET request.jwt.claim.sub='11111111-0000-0000-0000-000000000001'; SET ROLE authenticated;
BEGIN;
INSERT INTO presencas (tenant_id,horario_id,aluno_id,data,presente)
SELECT 'aaaaaaaa-0000-0000-0000-00000000000a', h.id,'a0000004-0000-0000-0000-000000000004',
       (now() AT TIME ZONE 'America/Sao_Paulo')::date, true
  FROM horarios h WHERE h.tenant_id='aaaaaaaa-0000-0000-0000-00000000000a' LIMIT 1
ON CONFLICT (horario_id,aluno_id,data) DO UPDATE SET presente=EXCLUDED.presente;
SELECT t_ok('8.3 upsert de presenca funciona (mesma clausula de togglePresenca)', true);
ROLLBACK;
RESET ROLE;
