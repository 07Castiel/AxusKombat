
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin', 'professor_kids');
CREATE TYPE public.categoria_aluno AS ENUM ('adulto', 'kids');
CREATE TYPE public.status_aluno AS ENUM ('ativo', 'inativo', 'pendente');
CREATE TYPE public.status_matricula AS ENUM ('ativa', 'vencida', 'cancelada', 'pendente');
CREATE TYPE public.duracao_plano AS ENUM ('mensal', 'trimestral', 'semestral', 'anual');
CREATE TYPE public.metodo_pagamento AS ENUM ('pix', 'dinheiro', 'cartao');
CREATE TYPE public.status_pagamento AS ENUM ('pago', 'pendente', 'atrasado', 'cancelado');
CREATE TYPE public.dia_semana AS ENUM ('segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo');
CREATE TYPE public.status_notificacao AS ENUM ('agendada', 'enviada', 'falhou', 'cancelada');

-- =========================
-- TENANTS (Academias)
-- =========================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- PROFILES (Usuarios)
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);

-- =========================
-- USER ROLES (separado para evitar privilege escalation)
-- =========================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

-- =========================
-- SECURITY DEFINER FUNCTIONS
-- =========================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_current_tenant()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

CREATE OR REPLACE FUNCTION public.is_professor_kids()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'professor_kids')
$$;

-- =========================
-- TRIGGER: updated_at
-- =========================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =========================
-- MODALIDADES
-- =========================
CREATE TABLE public.modalidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_modalidades_tenant ON public.modalidades(tenant_id);

-- =========================
-- HORARIOS
-- =========================
CREATE TABLE public.horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  modalidade_id UUID NOT NULL REFERENCES public.modalidades(id) ON DELETE RESTRICT,
  dia public.dia_semana NOT NULL,
  hora TIME NOT NULL,
  categoria public.categoria_aluno NOT NULL DEFAULT 'adulto',
  observacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_horarios_tenant ON public.horarios(tenant_id);

-- =========================
-- PLANOS
-- =========================
CREATE TABLE public.planos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria public.categoria_aluno NOT NULL DEFAULT 'adulto',
  frequencia_semanal INTEGER,
  modalidades TEXT[] NOT NULL DEFAULT '{}',
  duracao public.duracao_plano NOT NULL DEFAULT 'mensal',
  valor NUMERIC(10,2) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_planos_tenant ON public.planos(tenant_id);

-- =========================
-- GRADUACOES
-- =========================
CREATE TABLE public.graduacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  modalidade_id UUID REFERENCES public.modalidades(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  cor TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  categoria public.categoria_aluno NOT NULL DEFAULT 'adulto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_graduacoes_tenant ON public.graduacoes(tenant_id);

-- =========================
-- ALUNOS
-- =========================
CREATE TABLE public.alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  telefone TEXT,
  foto_url TEXT,
  data_nascimento DATE,
  responsavel_nome TEXT,
  responsavel_telefone TEXT,
  responsavel_cpf TEXT,
  contato_emergencia TEXT,
  observacoes_medicas TEXT,
  peso NUMERIC(5,2),
  altura NUMERIC(4,2),
  graduacao_atual_id UUID REFERENCES public.graduacoes(id) ON DELETE SET NULL,
  categoria public.categoria_aluno NOT NULL DEFAULT 'adulto',
  status public.status_aluno NOT NULL DEFAULT 'ativo',
  data_entrada DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alunos_tenant ON public.alunos(tenant_id);
CREATE INDEX idx_alunos_categoria ON public.alunos(categoria);
CREATE INDEX idx_alunos_status ON public.alunos(status);

-- =========================
-- MATRICULAS
-- =========================
CREATE TABLE public.matriculas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  plano_id UUID NOT NULL REFERENCES public.planos(id) ON DELETE RESTRICT,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL,
  desconto NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_final NUMERIC(10,2) NOT NULL,
  status public.status_matricula NOT NULL DEFAULT 'ativa',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_matriculas_tenant ON public.matriculas(tenant_id);
CREATE INDEX idx_matriculas_aluno ON public.matriculas(aluno_id);
CREATE INDEX idx_matriculas_status ON public.matriculas(status);

-- =========================
-- PAGAMENTOS
-- =========================
CREATE TABLE public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  matricula_id UUID NOT NULL REFERENCES public.matriculas(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  valor NUMERIC(10,2) NOT NULL,
  metodo public.metodo_pagamento NOT NULL DEFAULT 'pix',
  status public.status_pagamento NOT NULL DEFAULT 'pendente',
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  mercado_pago_id TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pagamentos_tenant ON public.pagamentos(tenant_id);
CREATE INDEX idx_pagamentos_status ON public.pagamentos(status);

-- =========================
-- HISTORICO GRADUACOES
-- =========================
CREATE TABLE public.historico_graduacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  graduacao_anterior_id UUID REFERENCES public.graduacoes(id) ON DELETE SET NULL,
  graduacao_nova_id UUID NOT NULL REFERENCES public.graduacoes(id) ON DELETE RESTRICT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hist_grad_tenant ON public.historico_graduacoes(tenant_id);
CREATE INDEX idx_hist_grad_aluno ON public.historico_graduacoes(aluno_id);

-- =========================
-- DESPESAS
-- =========================
CREATE TABLE public.despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  categoria TEXT,
  valor NUMERIC(10,2) NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_despesas_tenant ON public.despesas(tenant_id);

-- =========================
-- NOTIFICACOES
-- =========================
CREATE TABLE public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES public.alunos(id) ON DELETE CASCADE,
  matricula_id UUID REFERENCES public.matriculas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  canal TEXT NOT NULL DEFAULT 'whatsapp',
  destinatario TEXT,
  mensagem TEXT NOT NULL,
  status public.status_notificacao NOT NULL DEFAULT 'agendada',
  agendada_para TIMESTAMPTZ,
  enviada_em TIMESTAMPTZ,
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_tenant ON public.notificacoes(tenant_id);
CREATE INDEX idx_notif_status ON public.notificacoes(status);

-- =========================
-- updated_at triggers
-- =========================
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['tenants','profiles','modalidades','horarios','planos','graduacoes','alunos','matriculas','pagamentos','despesas','notificacoes']) LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()', t);
  END LOOP;
END $$;

-- =========================
-- TRIGGER: criar tenant + perfil + role + seed defaults no signup
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_tenant_nome TEXT;
  v_tenant_slug TEXT;
  v_modal_mt UUID;
  v_modal_boxe UUID;
BEGIN
  v_tenant_nome := COALESCE(NEW.raw_user_meta_data->>'tenant_nome', 'CT Aquiles Fight Team');
  v_tenant_slug := lower(regexp_replace(v_tenant_nome, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.tenants (nome, slug) VALUES (v_tenant_nome, v_tenant_slug) RETURNING id INTO v_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, nome_completo, email)
  VALUES (NEW.id, v_tenant_id, COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email), NEW.email);

  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (NEW.id, v_tenant_id, 'admin');

  -- Seed modalidades
  INSERT INTO public.modalidades (tenant_id, nome) VALUES (v_tenant_id, 'Muay Thai') RETURNING id INTO v_modal_mt;
  INSERT INTO public.modalidades (tenant_id, nome) VALUES (v_tenant_id, 'Boxe') RETURNING id INTO v_modal_boxe;

  -- Seed planos padrão
  INSERT INTO public.planos (tenant_id, nome, categoria, frequencia_semanal, modalidades, duracao, valor) VALUES
    (v_tenant_id, 'Muay Thai 1x semana', 'adulto', 1, ARRAY['Muay Thai'], 'mensal', 65),
    (v_tenant_id, 'Muay Thai 2x semana', 'adulto', 2, ARRAY['Muay Thai'], 'mensal', 85),
    (v_tenant_id, 'Muay Thai 3x semana', 'adulto', 3, ARRAY['Muay Thai'], 'mensal', 100),
    (v_tenant_id, 'Muay Thai 5x semana', 'adulto', 5, ARRAY['Muay Thai'], 'mensal', 120),
    (v_tenant_id, 'Combo Muay Thai + Boxe 3x semana', 'adulto', 3, ARRAY['Muay Thai','Boxe'], 'mensal', 150),
    (v_tenant_id, 'Muay Thai Kids 3x semana', 'kids', 3, ARRAY['Muay Thai'], 'mensal', 100);

  -- Seed horários (segunda como exemplo, demais dias o admin configura)
  INSERT INTO public.horarios (tenant_id, modalidade_id, dia, hora, categoria) VALUES
    (v_tenant_id, v_modal_mt, 'segunda', '10:00', 'adulto'),
    (v_tenant_id, v_modal_mt, 'segunda', '12:00', 'adulto'),
    (v_tenant_id, v_modal_mt, 'segunda', '14:00', 'adulto'),
    (v_tenant_id, v_modal_boxe, 'segunda', '17:00', 'adulto'),
    (v_tenant_id, v_modal_mt, 'segunda', '18:00', 'kids'),
    (v_tenant_id, v_modal_mt, 'segunda', '19:00', 'adulto'),
    (v_tenant_id, v_modal_mt, 'segunda', '20:00', 'adulto'),
    (v_tenant_id, v_modal_mt, 'segunda', '21:00', 'adulto'),
    (v_tenant_id, v_modal_boxe, 'terca', '06:30', 'adulto'),
    (v_tenant_id, v_modal_mt, 'terca', '08:00', 'adulto'),
    (v_tenant_id, v_modal_mt, 'terca', '10:00', 'adulto'),
    (v_tenant_id, v_modal_mt, 'terca', '12:00', 'adulto'),
    (v_tenant_id, v_modal_mt, 'terca', '14:00', 'adulto'),
    (v_tenant_id, v_modal_mt, 'terca', '17:00', 'adulto'),
    (v_tenant_id, v_modal_mt, 'terca', '18:00', 'kids'),
    (v_tenant_id, v_modal_boxe, 'terca', '19:00', 'adulto'),
    (v_tenant_id, v_modal_mt, 'terca', '20:00', 'adulto');

  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- ENABLE RLS
-- =========================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modalidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriculas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_graduacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- =========================
-- RLS POLICIES
-- =========================
-- Tenants: leitura para membros, update apenas admin
CREATE POLICY "tenants_select" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.get_current_tenant());
CREATE POLICY "tenants_update_admin" ON public.tenants FOR UPDATE TO authenticated
  USING (id = public.get_current_tenant() AND public.is_admin());

-- Profiles
CREATE POLICY "profiles_select_own_tenant" ON public.profiles FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant());
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR (tenant_id = public.get_current_tenant() AND public.is_admin()));

-- User Roles
CREATE POLICY "roles_select_own_tenant" ON public.user_roles FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant());
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

-- Modalidades: todos do tenant veem, só admin altera
CREATE POLICY "modalidades_select" ON public.modalidades FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant());
CREATE POLICY "modalidades_admin_all" ON public.modalidades FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

-- Horarios: professor_kids vê só kids
CREATE POLICY "horarios_select" ON public.horarios FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant()
    AND (public.is_admin() OR categoria = 'kids'));
CREATE POLICY "horarios_admin_all" ON public.horarios FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

-- Planos
CREATE POLICY "planos_select" ON public.planos FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant()
    AND (public.is_admin() OR categoria = 'kids'));
CREATE POLICY "planos_admin_all" ON public.planos FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

-- Graduacoes
CREATE POLICY "grad_select" ON public.graduacoes FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant()
    AND (public.is_admin() OR categoria = 'kids'));
CREATE POLICY "grad_admin_all" ON public.graduacoes FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

-- Alunos: admin tudo; professor_kids só kids
CREATE POLICY "alunos_select" ON public.alunos FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant()
    AND (public.is_admin() OR categoria = 'kids'));
CREATE POLICY "alunos_insert" ON public.alunos FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant()
    AND (public.is_admin() OR (public.is_professor_kids() AND categoria = 'kids')));
CREATE POLICY "alunos_update" ON public.alunos FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant()
    AND (public.is_admin() OR (public.is_professor_kids() AND categoria = 'kids')));
-- sem delete (soft delete via status)

-- Matriculas
CREATE POLICY "matriculas_select" ON public.matriculas FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant()
    AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = aluno_id AND a.categoria = 'kids')));
CREATE POLICY "matriculas_insert" ON public.matriculas FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant()
    AND (public.is_admin() OR (public.is_professor_kids() AND EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = aluno_id AND a.categoria = 'kids'))));
CREATE POLICY "matriculas_update" ON public.matriculas FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant()
    AND (public.is_admin() OR (public.is_professor_kids() AND EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = aluno_id AND a.categoria = 'kids'))));

-- Pagamentos: apenas admin
CREATE POLICY "pag_admin_all" ON public.pagamentos FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

-- Historico graduacoes
CREATE POLICY "hist_grad_select" ON public.historico_graduacoes FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant()
    AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = aluno_id AND a.categoria = 'kids')));
CREATE POLICY "hist_grad_insert" ON public.historico_graduacoes FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant()
    AND (public.is_admin() OR (public.is_professor_kids() AND EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = aluno_id AND a.categoria = 'kids'))));

-- Despesas: admin only
CREATE POLICY "despesas_admin_all" ON public.despesas FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

-- Notificacoes: admin
CREATE POLICY "notif_admin_all" ON public.notificacoes FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

-- =========================
-- STORAGE BUCKET
-- =========================
INSERT INTO storage.buckets (id, name, public) VALUES ('fotos-alunos', 'fotos-alunos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "fotos_alunos_read_public" ON storage.objects FOR SELECT
  USING (bucket_id = 'fotos-alunos');
CREATE POLICY "fotos_alunos_upload_auth" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fotos-alunos');
CREATE POLICY "fotos_alunos_update_auth" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fotos-alunos');
CREATE POLICY "fotos_alunos_delete_auth" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fotos-alunos');
