-- Extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- WhatsApp config + templates per tenant
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'evolution',
  instance_name TEXT,
  api_url TEXT,
  api_token TEXT,
  sender_number TEXT,
  connection_status TEXT NOT NULL DEFAULT 'desconectado',
  enabled BOOLEAN NOT NULL DEFAULT false,
  template_7_dias TEXT NOT NULL DEFAULT 'Olá {nome}, sua matrícula na {academia} vence em {vencimento} (valor R$ {valor}). Caso já tenha pago, desconsidere esta mensagem.',
  template_3_dias TEXT NOT NULL DEFAULT 'Olá {nome}, faltam 3 dias para o vencimento da sua matrícula na {academia} ({vencimento} — R$ {valor}). Já pagou? Pode ignorar.',
  template_vencimento TEXT NOT NULL DEFAULT 'Olá {nome}, sua matrícula na {academia} vence hoje ({vencimento} — R$ {valor}). Se já efetuou o pagamento, ignore esta mensagem.',
  last_test_at TIMESTAMPTZ,
  last_test_result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_config TO authenticated;
GRANT ALL ON public.whatsapp_config TO service_role;

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin lê config WhatsApp da própria academia" ON public.whatsapp_config
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin());

CREATE POLICY "Admin gerencia config WhatsApp da própria academia" ON public.whatsapp_config
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());

CREATE TRIGGER tg_whatsapp_config_updated
  BEFORE UPDATE ON public.whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Prevent duplicate scheduled notifications per matricula+tipo (only for auto-renewal alerts)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notificacoes_matricula_tipo_aviso
  ON public.notificacoes (matricula_id, tipo)
  WHERE tipo IN ('AVISO_7_DIAS','AVISO_3_DIAS','AVISO_VENCIMENTO');

-- Index to speed up history queries
CREATE INDEX IF NOT EXISTS idx_notificacoes_tenant_created
  ON public.notificacoes (tenant_id, created_at DESC);