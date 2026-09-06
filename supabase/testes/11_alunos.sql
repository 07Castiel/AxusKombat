\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''

CREATE OR REPLACE FUNCTION dia_de(d date) RETURNS dia_semana LANGUAGE sql IMMUTABLE AS
$f$ SELECT (ARRAY['domingo','terca','quarta','quinta','sexta','sabado']::dia_semana[])[1] $f$;
CREATE OR REPLACE FUNCTION dow_dia(d date) RETURNS dia_semana LANGUAGE sql IMMUTABLE AS
$f$ SELECT (ARRAY['domingo','segunda','terca','quarta','quinta','sexta','sabado']::dia_semana[])[extract(dow from d)::int+1] $f$;

-- Gera presencas para um aluno nos dias-da-semana pedidos
CREATE OR REPLACE FUNCTION seed_pres(p_tenant uuid, p_aluno uuid, p_dows int[],
                                     p_de date, p_ate date, p_hora time DEFAULT '19:00')
RETURNS integer LANGUAGE plpgsql AS $f$
DECLARE n integer;
BEGIN
  INSERT INTO presencas (tenant_id,horario_id,aluno_id,data,presente)
  SELECT p_tenant, h.id, p_aluno, g.d::date, true
    FROM generate_series(p_de, p_ate, '1 day') g(d)
    JOIN horarios h ON h.tenant_id = p_tenant AND h.ativo
                   AND h.dia = dow_dia(g.d::date) AND h.hora = p_hora
                   AND h.categoria = (SELECT categoria FROM alunos WHERE id = p_aluno)
   WHERE extract(dow from g.d)::int = ANY(p_dows)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $f$;

DO $seed$
DECLARE
  hA date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;   -- hoje na Academia A
  hB date := (now() AT TIME ZONE 'America/Manaus')::date;      -- hoje na Academia B
  ini date; base_ini date;
  tA uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  tB uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  SEG_SEX int[] := ARRAY[1,2,3,4,5];
BEGIN
  ini      := hA - 27;        -- janela de 28 dias
  base_ini := ini - 84;       -- linha de base (3x a janela)

  -- ---- alunos da Academia A -------------------------------------------------
  INSERT INTO alunos (id,tenant_id,nome_completo,categoria,status,data_entrada) VALUES
   ('a0000001-0000-0000-0000-000000000001',tA,'01 acima da meta (2x, treina 4x)','adulto','ativo',hA-400),
   ('a0000002-0000-0000-0000-000000000002',tA,'02 exatamente na meta (2x)','adulto','ativo',hA-400),
   ('a0000003-0000-0000-0000-000000000003',tA,'03 abaixo da meta (4x, treina 2x)','adulto','ativo',hA-400),
   ('a0000004-0000-0000-0000-000000000004',tA,'04 zero treinos de sempre','adulto','ativo',hA-400),
   ('a0000005-0000-0000-0000-000000000005',tA,'05 meta 1x','adulto','ativo',hA-400),
   ('a0000006-0000-0000-0000-000000000006',tA,'06 meta 3x','adulto','ativo',hA-400),
   ('a0000007-0000-0000-0000-000000000007',tA,'07 meta 4x','adulto','ativo',hA-400),
   ('a0000008-0000-0000-0000-000000000008',tA,'08 novo hoje','adulto','ativo',hA),
   ('a0000009-0000-0000-0000-000000000009',tA,'09 novo ha 5 dias','adulto','ativo',hA-5),
   ('a000000a-0000-0000-0000-00000000000a',tA,'10 duas aulas no mesmo dia','adulto','ativo',hA-400),
   ('a000000b-0000-0000-0000-00000000000b',tA,'11 sem contrato com historico','adulto','ativo',hA-400),
   ('a000000c-0000-0000-0000-00000000000c',tA,'12 sem contrato sem historico','adulto','ativo',hA-400),
   ('a000000d-0000-0000-0000-00000000000d',tA,'13 frequencia contratada alterada','adulto','ativo',hA-400),
   ('a000000e-0000-0000-0000-00000000000e',tA,'14 treinou hoje','adulto','ativo',hA-400),
   ('a000000f-0000-0000-0000-00000000000f',tA,'15 fora ha varios dias','adulto','ativo',hA-400),
   ('a0000010-0000-0000-0000-000000000010',tA,'16 kids na meta (2x)','kids','ativo',hA-400),
   ('a0000011-0000-0000-0000-000000000011',tA,'17 inativo (nao deve aparecer)','adulto','inativo',hA-400);

  INSERT INTO contratos (tenant_id,aluno_id,plano_id,status,data_inicio,dia_vencimento,valor_mensalidade) VALUES
   (tA,'a0000001-0000-0000-0000-000000000001','02000000-0000-0000-0000-000000000002','ativo',hA-400,5,150),
   (tA,'a0000002-0000-0000-0000-000000000002','02000000-0000-0000-0000-000000000002','ativo',hA-400,5,150),
   (tA,'a0000003-0000-0000-0000-000000000003','04000000-0000-0000-0000-000000000004','ativo',hA-400,5,210),
   (tA,'a0000004-0000-0000-0000-000000000004','02000000-0000-0000-0000-000000000002','ativo',hA-400,5,150),
   (tA,'a0000005-0000-0000-0000-000000000005','01000000-0000-0000-0000-000000000001','ativo',hA-400,5,100),
   (tA,'a0000006-0000-0000-0000-000000000006','03000000-0000-0000-0000-000000000003','ativo',hA-400,5,180),
   (tA,'a0000007-0000-0000-0000-000000000007','04000000-0000-0000-0000-000000000004','ativo',hA-400,5,210),
   (tA,'a000000a-0000-0000-0000-00000000000a','02000000-0000-0000-0000-000000000002','ativo',hA-400,5,150),
   (tA,'a000000e-0000-0000-0000-00000000000e','02000000-0000-0000-0000-000000000002','ativo',hA-400,5,150),
   (tA,'a000000f-0000-0000-0000-00000000000f','02000000-0000-0000-0000-000000000002','ativo',hA-400,5,150),
   (tA,'a0000010-0000-0000-0000-000000000010','02000000-0000-0000-0000-0000000000cc','ativo',hA-400,5,120),
   (tA,'a0000011-0000-0000-0000-000000000011','02000000-0000-0000-0000-000000000002','ativo',hA-400,5,150),
   -- 13: contrato antigo 4x CANCELADO + contrato novo 2x ATIVO
   (tA,'a000000d-0000-0000-0000-00000000000d','04000000-0000-0000-0000-000000000004','cancelado',hA-400,5,210),
   (tA,'a000000d-0000-0000-0000-00000000000d','02000000-0000-0000-0000-000000000002','ativo',hA-60,5,150);

  -- Fabio-like: um aluno que treina todo dia util garante chamada em todos os dias
  INSERT INTO alunos (id,tenant_id,nome_completo,categoria,status,data_entrada)
  VALUES ('a00000ff-0000-0000-0000-0000000000ff',tA,'99 presenca total (garante chamada)','adulto','ativo',hA-400);
  PERFORM seed_pres(tA,'a00000ff-0000-0000-0000-0000000000ff',SEG_SEX,base_ini,hA);

  PERFORM seed_pres(tA,'a0000001-0000-0000-0000-000000000001',ARRAY[1,2,4,5],base_ini,hA);  -- 4x
  PERFORM seed_pres(tA,'a0000002-0000-0000-0000-000000000002',ARRAY[1,5],   base_ini,hA);  -- 2x
  PERFORM seed_pres(tA,'a0000003-0000-0000-0000-000000000003',ARRAY[1,5],   base_ini,hA);  -- 2x c/ meta 4
  -- 04: nenhuma presenca
  PERFORM seed_pres(tA,'a0000005-0000-0000-0000-000000000005',ARRAY[3],     base_ini,hA);  -- 1x
  PERFORM seed_pres(tA,'a0000006-0000-0000-0000-000000000006',ARRAY[1,3,5], base_ini,hA);  -- 3x
  PERFORM seed_pres(tA,'a0000007-0000-0000-0000-000000000007',ARRAY[1,2,4,5],base_ini,hA); -- 4x
  PERFORM seed_pres(tA,'a0000008-0000-0000-0000-000000000008',ARRAY[0,1,2,3,4,5,6],hA,hA); -- novo, treinou hoje
  PERFORM seed_pres(tA,'a0000009-0000-0000-0000-000000000009',ARRAY[0,1,2,3,4,5,6],hA-4,hA-4);
  -- 10: duas aulas no MESMO dia (19h e 21h de segunda)
  PERFORM seed_pres(tA,'a000000a-0000-0000-0000-00000000000a',ARRAY[1],base_ini,hA,'19:00');
  PERFORM seed_pres(tA,'a000000a-0000-0000-0000-00000000000a',ARRAY[1],base_ini,hA,'21:00');
  PERFORM seed_pres(tA,'a000000b-0000-0000-0000-00000000000b',ARRAY[1,3,5],base_ini,hA);   -- historico 3x
  PERFORM seed_pres(tA,'a000000c-0000-0000-0000-00000000000c',ARRAY[0,1,2,3,4,5,6],hA-3,hA-3); -- 1 treino so
  PERFORM seed_pres(tA,'a000000d-0000-0000-0000-00000000000d',ARRAY[1,5],base_ini,hA);
  PERFORM seed_pres(tA,'a000000e-0000-0000-0000-00000000000e',ARRAY[1,2,3,4,5],hA,hA);      -- treinou hoje
  PERFORM seed_pres(tA,'a000000f-0000-0000-0000-00000000000f',ARRAY[1,5],base_ini,hA-20);   -- sumiu
  PERFORM seed_pres(tA,'a0000010-0000-0000-0000-000000000010',ARRAY[2,4],base_ini,hA,'17:00'); -- kids ter/qui
  PERFORM seed_pres(tA,'a0000011-0000-0000-0000-000000000011',ARRAY[1,5],base_ini,hA);      -- inativo

  -- ---- Academia B (isolamento) ---------------------------------------------
  INSERT INTO alunos (id,tenant_id,nome_completo,categoria,status,data_entrada) VALUES
   ('b0000001-0000-0000-0000-000000000001',tB,'B1 aluno da academia B','adulto','ativo',hB-400),
   ('b0000002-0000-0000-0000-000000000002',tB,'B2 aluno da academia B','adulto','ativo',hB-400);
  INSERT INTO contratos (tenant_id,aluno_id,plano_id,status,data_inicio,dia_vencimento,valor_mensalidade) VALUES
   (tB,'b0000001-0000-0000-0000-000000000001','0b000000-0000-0000-0000-0000000000bb','ativo',hB-400,5,200);
  PERFORM seed_pres(tB,'b0000001-0000-0000-0000-000000000001',ARRAY[1,3,5],hB-111,hB,'20:00');
  PERFORM seed_pres(tB,'b0000002-0000-0000-0000-000000000002',ARRAY[1],hB-111,hB,'20:00');
END $seed$;
