-- Add recepcao and financeiro to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'recepcao';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'financeiro';

-- Add ativo + permissions to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Allow admin in same tenant to read profiles of their staff
DROP POLICY IF EXISTS "Admin reads tenant profiles" ON public.profiles;
CREATE POLICY "Admin reads tenant profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_current_tenant()
    AND public.is_admin()
  );