
ALTER TYPE duracao_plano ADD VALUE IF NOT EXISTS 'personalizado';

ALTER TABLE public.modalidades
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS termo_graduacao text NOT NULL DEFAULT 'Graduação';

ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS dias_personalizado integer;

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
BEGIN
  v_tenant_nome := COALESCE(NEW.raw_user_meta_data->>'tenant_nome', 'Minha Academia');
  v_nome_responsavel := COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email);
  v_telefone := NEW.raw_user_meta_data->>'telefone';
  v_tenant_slug := lower(regexp_replace(v_tenant_nome, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.tenants (nome, slug, responsavel_nome, responsavel_email, telefone)
  VALUES (v_tenant_nome, v_tenant_slug, v_nome_responsavel, NEW.email, v_telefone)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, nome_completo, email, telefone)
  VALUES (NEW.id, v_tenant_id, v_nome_responsavel, NEW.email, v_telefone);

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, v_tenant_id, 'admin');

  RETURN NEW;
END $function$;
