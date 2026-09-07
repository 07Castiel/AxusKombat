-- Tenant C: grade TODO DIA. Isola a semantica de dias_sem_treinar do calendario.
INSERT INTO tenants (id,nome,slug,status,plan,plan_period,ativo,is_trial,onboarding_completed)
VALUES ('cccccccc-0000-0000-0000-00000000000c','Academia C','academia-c','active','pro','monthly',true,false,true);
INSERT INTO notification_settings (tenant_id,timezone) VALUES ('cccccccc-0000-0000-0000-00000000000c','UTC');
INSERT INTO auth.users (id,email) VALUES ('44444444-0000-0000-0000-000000000001','admin.c@t');
INSERT INTO profiles (id,tenant_id,nome_completo,email,permissions)
VALUES ('44444444-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-00000000000c','Admin C','admin.c@t','{}');
INSERT INTO user_roles (user_id,tenant_id,role) VALUES ('44444444-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-00000000000c','admin');
INSERT INTO modalidades (id,tenant_id,nome) VALUES ('0d000000-0000-0000-0000-0000000000cc','cccccccc-0000-0000-0000-00000000000c','Boxe');
INSERT INTO horarios (id,tenant_id,modalidade_id,dia,hora,categoria,ativo)
SELECT gen_random_uuid(),'cccccccc-0000-0000-0000-00000000000c','0d000000-0000-0000-0000-0000000000cc',d,'19:00','adulto',true
  FROM unnest(enum_range(NULL::dia_semana)) d;
INSERT INTO planos (id,tenant_id,nome,valor,frequencia_semanal,categoria,ativo)
VALUES ('0c000000-0000-0000-0000-0000000000cc','cccccccc-0000-0000-0000-00000000000c','2x C',150,2,'adulto',true);

DO $c$
DECLARE h date := (now() AT TIME ZONE 'UTC')::date; t uuid := 'cccccccc-0000-0000-0000-00000000000c';
        TODOS int[] := ARRAY[0,1,2,3,4,5,6];
BEGIN
  INSERT INTO alunos (id,tenant_id,nome_completo,categoria,status,data_entrada) VALUES
   ('c0000001-0000-0000-0000-000000000001',t,'C1 treinou HOJE','adulto','ativo',h-400),
   ('c0000002-0000-0000-0000-000000000002',t,'C2 treinou ONTEM','adulto','ativo',h-400),
   ('c0000003-0000-0000-0000-000000000003',t,'C3 treinou ha 2 DIAS','adulto','ativo',h-400),
   ('c0000004-0000-0000-0000-000000000004',t,'C4 NUNCA treinou (aluno antigo)','adulto','ativo',h-400),
   ('c0000005-0000-0000-0000-000000000005',t,'C5 novo HOJE, nunca treinou','adulto','ativo',h),
   ('c0000006-0000-0000-0000-000000000006',t,'C6 fora ha 10 dias','adulto','ativo',h-400),
   ('c00000ff-0000-0000-0000-0000000000ff',t,'C9 chamada garantida (treina todo dia)','adulto','ativo',h-400);
  PERFORM seed_pres(t,'c00000ff-0000-0000-0000-0000000000ff',TODOS,h-140,h);
  PERFORM seed_pres(t,'c0000001-0000-0000-0000-000000000001',TODOS,h-140,h);
  PERFORM seed_pres(t,'c0000002-0000-0000-0000-000000000002',TODOS,h-140,h-1);
  PERFORM seed_pres(t,'c0000003-0000-0000-0000-000000000003',TODOS,h-140,h-2);
  PERFORM seed_pres(t,'c0000006-0000-0000-0000-000000000006',TODOS,h-140,h-10);
END $c$;
