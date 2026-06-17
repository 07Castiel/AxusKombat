
CREATE TABLE public.whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'desconectado',
  connected BOOLEAN NOT NULL DEFAULT false,
  last_connection TIMESTAMPTZ,
  last_qr_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id),
  UNIQUE (instance_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.whatsapp_connections TO service_role;

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own tenant whatsapp connection"
ON public.whatsapp_connections
FOR ALL
TO authenticated
USING (tenant_id = public.get_current_tenant() AND public.is_admin())
WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

CREATE TRIGGER trg_whatsapp_connections_updated_at
BEFORE UPDATE ON public.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
