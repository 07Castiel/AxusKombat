INSERT INTO tenants (id,nome,slug,status,plan,plan_period,ativo,is_trial,onboarding_completed)
VALUES ('dddddddd-0000-0000-0000-00000000000d','Academia Carga','academia-carga','active','pro','monthly',true,false,true);
INSERT INTO notification_settings (tenant_id,timezone) VALUES ('dddddddd-0000-0000-0000-00000000000d','UTC');
INSERT INTO auth.users (id,email) VALUES ('55555555-0000-0000-0000-000000000001','admin.l@t');
INSERT INTO profiles (id,tenant_id,nome_completo,email,permissions)
VALUES ('55555555-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-00000000000d','Admin L','admin.l@t','{}');
INSERT INTO user_roles (user_id,tenant_id,role) VALUES ('55555555-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-00000000000d','admin');
INSERT INTO modalidades (id,tenant_id,nome) VALUES ('0d000000-0000-0000-0000-0000000000dd','dddddddd-0000-0000-0000-00000000000d','Carga');
INSERT INTO horarios (id,tenant_id,modalidade_id,dia,hora,categoria,ativo)
SELECT gen_random_uuid(),'dddddddd-0000-0000-0000-00000000000d','0d000000-0000-0000-0000-0000000000dd',d,'19:00','adulto',true
  FROM unnest(enum_range(NULL::dia_semana)) d;
INSERT INTO planos (id,tenant_id,nome,valor,frequencia_semanal,categoria,ativo)
VALUES ('0e000000-0000-0000-0000-0000000000dd','dddddddd-0000-0000-0000-00000000000d','3x carga',150,3,'adulto',true);

-- adiciona N alunos com 16 semanas de historico (3x/semana) de uma vez so
CREATE OR REPLACE FUNCTION carga_add(n int) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE t uuid := 'dddddddd-0000-0000-0000-00000000000d'; h date := (now() AT TIME ZONE 'UTC')::date; ini int;
BEGIN
  SELECT count(*) INTO ini FROM alunos WHERE tenant_id=t;
  INSERT INTO alunos (id,tenant_id,nome_completo,categoria,status,data_entrada)
  SELECT gen_random_uuid(), t, 'Aluno '||i, 'adulto','ativo', h-400
    FROM generate_series(ini+1, ini+n) i;
  INSERT INTO contratos (tenant_id,aluno_id,plano_id,status,data_inicio,dia_vencimento,valor_mensalidade)
  SELECT t, a.id, '0e000000-0000-0000-0000-0000000000dd','ativo',h-400,5,150
    FROM alunos a WHERE a.tenant_id=t
      AND NOT EXISTS (SELECT 1 FROM contratos c WHERE c.aluno_id=a.id);
  INSERT INTO presencas (tenant_id,horario_id,aluno_id,data,presente)
  SELECT t, hh.id, a.id, g.d::date, true
    FROM alunos a
    CROSS JOIN generate_series(h-111, h, '1 day') g(d)
    JOIN horarios hh ON hh.tenant_id=t AND hh.dia=dow_dia(g.d::date) AND hh.hora='19:00'
   WHERE a.tenant_id=t AND extract(dow from g.d)::int = ANY(ARRAY[1,3,5])
     AND NOT EXISTS (SELECT 1 FROM presencas p WHERE p.aluno_id=a.id AND p.data=g.d::date)
  ON CONFLICT DO NOTHING;
  ANALYZE presencas; ANALYZE alunos; ANALYZE contratos;
END $f$;
