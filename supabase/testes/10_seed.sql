-- ===========================================================================
-- Seed de auditoria: duas academias, papéis reais, casos matemáticos extremos
-- ===========================================================================
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''

INSERT INTO tenants (id,nome,slug,status,plan,plan_period,ativo,is_trial,onboarding_completed)
VALUES (:A::uuid,'Academia A','academia-a','active','pro','monthly',true,false,true),
       (:B::uuid,'Academia B','academia-b','active','pro','monthly',true,false,true);

-- Fuso: A em Sao Paulo (UTC-3), B em Manaus (UTC-4) -> datas podem divergir
INSERT INTO notification_settings (tenant_id,timezone) VALUES
  (:A::uuid,'America/Sao_Paulo'), (:B::uuid,'America/Manaus');

-- Usuarios e papeis
INSERT INTO auth.users (id,email) VALUES
  ('11111111-0000-0000-0000-000000000001','admin.a@t'),
  ('11111111-0000-0000-0000-000000000002','prof.adulto.a@t'),
  ('11111111-0000-0000-0000-000000000003','prof.kids.a@t'),
  ('11111111-0000-0000-0000-000000000004','recepcao.a@t'),
  ('11111111-0000-0000-0000-000000000005','financeiro.a@t'),
  ('11111111-0000-0000-0000-000000000006','sem.permissao.a@t'),
  ('22222222-0000-0000-0000-000000000001','admin.b@t'),
  ('33333333-0000-0000-0000-000000000001','sem.perfil@t');

INSERT INTO profiles (id,tenant_id,nome_completo,email,permissions) VALUES
  ('11111111-0000-0000-0000-000000000001',:A::uuid,'Admin A','admin.a@t','{}'),
  ('11111111-0000-0000-0000-000000000002',:A::uuid,'Prof Adulto A','prof.adulto.a@t','{}'),
  ('11111111-0000-0000-0000-000000000003',:A::uuid,'Prof Kids A','prof.kids.a@t','{}'),
  ('11111111-0000-0000-0000-000000000004',:A::uuid,'Recepcao A','recepcao.a@t','{}'),
  ('11111111-0000-0000-0000-000000000005',:A::uuid,'Financeiro A','financeiro.a@t','{}'),
  ('11111111-0000-0000-0000-000000000006',:A::uuid,'Sem Permissao A','sem.permissao.a@t',
     '{"alunos":{"ver":false,"editar":false}}'),
  ('22222222-0000-0000-0000-000000000001',:B::uuid,'Admin B','admin.b@t','{}');
-- 33333333 de proposito SEM profile: usuario sem tenant resolvido

INSERT INTO user_roles (user_id,tenant_id,role) VALUES
  ('11111111-0000-0000-0000-000000000001',:A::uuid,'admin'),
  ('11111111-0000-0000-0000-000000000002',:A::uuid,'professor_adulto'),
  ('11111111-0000-0000-0000-000000000003',:A::uuid,'professor_kids'),
  ('11111111-0000-0000-0000-000000000004',:A::uuid,'recepcao'),
  ('11111111-0000-0000-0000-000000000005',:A::uuid,'financeiro'),
  ('11111111-0000-0000-0000-000000000006',:A::uuid,'admin'),
  ('22222222-0000-0000-0000-000000000001',:B::uuid,'admin');

INSERT INTO modalidades (id,tenant_id,nome) VALUES
  ('0d000000-0000-0000-0000-0000000000aa'::uuid,:A::uuid,'Muay Thai'),
  ('0d000000-0000-0000-0000-0000000000bb'::uuid,:B::uuid,'Jiu-Jitsu');

-- Grade A: adulto seg-sex (5 dias), kids ter/qui (2 dias)
INSERT INTO horarios (id,tenant_id,modalidade_id,dia,hora,categoria,ativo)
SELECT gen_random_uuid(),:A::uuid,'0d000000-0000-0000-0000-0000000000aa'::uuid,d,'19:00','adulto',true
  FROM unnest(ARRAY['segunda','terca','quarta','quinta','sexta']::dia_semana[]) d;
-- segundo horario na segunda: permite duas presencas no MESMO dia (teste de duplicidade)
INSERT INTO horarios (id,tenant_id,modalidade_id,dia,hora,categoria,ativo)
VALUES (gen_random_uuid(),:A::uuid,'0d000000-0000-0000-0000-0000000000aa'::uuid,'segunda','21:00','adulto',true);
INSERT INTO horarios (id,tenant_id,modalidade_id,dia,hora,categoria,ativo)
SELECT gen_random_uuid(),:A::uuid,'0d000000-0000-0000-0000-0000000000aa'::uuid,d,'17:00','kids',true
  FROM unnest(ARRAY['terca','quinta']::dia_semana[]) d;
-- Grade B: seg/qua/sex
INSERT INTO horarios (id,tenant_id,modalidade_id,dia,hora,categoria,ativo)
SELECT gen_random_uuid(),:B::uuid,'0d000000-0000-0000-0000-0000000000bb'::uuid,d,'20:00','adulto',true
  FROM unnest(ARRAY['segunda','quarta','sexta']::dia_semana[]) d;

INSERT INTO planos (id,tenant_id,nome,valor,frequencia_semanal,categoria,ativo) VALUES
  ('01000000-0000-0000-0000-000000000001'::uuid,:A::uuid,'1x semana',100,1,'adulto',true),
  ('02000000-0000-0000-0000-000000000002'::uuid,:A::uuid,'2x semana',150,2,'adulto',true),
  ('03000000-0000-0000-0000-000000000003'::uuid,:A::uuid,'3x semana',180,3,'adulto',true),
  ('04000000-0000-0000-0000-000000000004'::uuid,:A::uuid,'4x semana',210,4,'adulto',true),
  ('02000000-0000-0000-0000-0000000000cc'::uuid,:A::uuid,'2x kids',120,2,'kids',true),
  ('0b000000-0000-0000-0000-0000000000bb'::uuid,:B::uuid,'3x B',200,3,'adulto',true);
