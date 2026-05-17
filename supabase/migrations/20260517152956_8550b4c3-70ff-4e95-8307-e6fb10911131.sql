
-- 1. Tenants: dados do responsável
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS responsavel_nome TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_email TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS cnpj_cpf TEXT;

-- 2. Alunos: campos adicionais
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS endereco TEXT;

-- 3. Horarios: extras
ALTER TABLE public.horarios
  ADD COLUMN IF NOT EXISTS hora_fim TIME,
  ADD COLUMN IF NOT EXISTS professor TEXT,
  ADD COLUMN IF NOT EXISTS capacidade_maxima INTEGER;

-- 4. Pagamentos: matricula opcional (modo manual)
ALTER TABLE public.pagamentos
  ALTER COLUMN matricula_id DROP NOT NULL;

-- 5. Políticas DELETE para admin
CREATE POLICY alunos_delete ON public.alunos FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant() AND is_admin());

CREATE POLICY matriculas_delete ON public.matriculas FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant() AND is_admin());

CREATE POLICY horarios_delete ON public.horarios FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant() AND is_admin());

CREATE POLICY graduacoes_delete ON public.graduacoes FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant() AND is_admin());

CREATE POLICY pagamentos_delete ON public.pagamentos FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant() AND is_admin());

CREATE POLICY hist_grad_delete ON public.historico_graduacoes FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant() AND is_admin());

CREATE POLICY hist_grad_update ON public.historico_graduacoes FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant() AND is_admin());

-- 6. Atualizar handle_new_user para gravar dados do responsável
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_tenant_nome TEXT;
  v_tenant_slug TEXT;
  v_nome_responsavel TEXT;
  v_telefone TEXT;
  v_cnpj_cpf TEXT;
  v_modal_mt UUID;
  v_modal_boxe UUID;
BEGIN
  v_tenant_nome := COALESCE(NEW.raw_user_meta_data->>'tenant_nome', 'CT Aquiles Fight Team');
  v_nome_responsavel := COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email);
  v_telefone := NEW.raw_user_meta_data->>'telefone';
  v_cnpj_cpf := NEW.raw_user_meta_data->>'cnpj_cpf';
  v_tenant_slug := lower(regexp_replace(v_tenant_nome, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.tenants (nome, slug, responsavel_nome, responsavel_email, telefone, cnpj_cpf)
  VALUES (v_tenant_nome, v_tenant_slug, v_nome_responsavel, NEW.email, v_telefone, v_cnpj_cpf)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, nome_completo, email, telefone)
  VALUES (NEW.id, v_tenant_id, v_nome_responsavel, NEW.email, v_telefone);

  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (NEW.id, v_tenant_id, 'admin');

  INSERT INTO public.modalidades (tenant_id, nome) VALUES (v_tenant_id, 'Muay Thai') RETURNING id INTO v_modal_mt;
  INSERT INTO public.modalidades (tenant_id, nome) VALUES (v_tenant_id, 'Boxe') RETURNING id INTO v_modal_boxe;

  INSERT INTO public.planos (tenant_id, nome, categoria, frequencia_semanal, modalidades, duracao, valor) VALUES
    (v_tenant_id, 'Muay Thai 1x semana', 'adulto', 1, ARRAY['Muay Thai'], 'mensal', 65),
    (v_tenant_id, 'Muay Thai 2x semana', 'adulto', 2, ARRAY['Muay Thai'], 'mensal', 85),
    (v_tenant_id, 'Muay Thai 3x semana', 'adulto', 3, ARRAY['Muay Thai'], 'mensal', 100),
    (v_tenant_id, 'Muay Thai 5x semana', 'adulto', 5, ARRAY['Muay Thai'], 'mensal', 120),
    (v_tenant_id, 'Combo Muay Thai + Boxe 3x semana', 'adulto', 3, ARRAY['Muay Thai','Boxe'], 'mensal', 150),
    (v_tenant_id, 'Muay Thai Kids 3x semana', 'kids', 3, ARRAY['Muay Thai'], 'mensal', 100);

  RETURN NEW;
END $function$;

-- Garantir trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
