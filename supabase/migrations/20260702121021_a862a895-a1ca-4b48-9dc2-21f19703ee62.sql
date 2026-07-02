
-- ============================================================================
-- NOTIFICATIONS V2 — event-driven scheduling
-- ============================================================================

-- 1) notification_settings ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  dias_antes_lembrete INT[] NOT NULL DEFAULT '{2}',
  enviar_no_vencimento BOOLEAN NOT NULL DEFAULT true,
  dias_apos_vencimento INT[] NOT NULL DEFAULT '{}',
  hora_inicio TIME NOT NULL DEFAULT '08:00',
  hora_fim TIME NOT NULL DEFAULT '20:00',
  hora_preferencial TIME NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  pix_chave TEXT,
  assinatura TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_settings_admin_select" ON public.notification_settings
  FOR SELECT TO authenticated
  USING (public.is_admin() AND tenant_id = public.get_current_tenant());
CREATE POLICY "notif_settings_admin_all" ON public.notification_settings
  FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.get_current_tenant())
  WITH CHECK (public.is_admin() AND tenant_id = public.get_current_tenant());

CREATE TRIGGER tg_notif_settings_updated
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- 2) notification_templates --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,           -- 'lembrete' | 'vencimento' | 'atraso' | 'boas_vindas' | 'manual'
  dias_offset INT NOT NULL DEFAULT 0, -- negativo=antes, 0=vencimento, positivo=depois
  mensagem TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo, dias_offset)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_templates TO authenticated;
GRANT ALL ON public.notification_templates TO service_role;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_tpl_admin_select" ON public.notification_templates
  FOR SELECT TO authenticated
  USING (public.is_admin() AND tenant_id = public.get_current_tenant());
CREATE POLICY "notif_tpl_admin_all" ON public.notification_templates
  FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.get_current_tenant())
  WITH CHECK (public.is_admin() AND tenant_id = public.get_current_tenant());

CREATE TRIGGER tg_notif_tpl_updated
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- 3) alter notificacoes ------------------------------------------------------
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT,
  ADD COLUMN IF NOT EXISTS dias_offset INT;

-- agendada_para já existe (timestamptz) — só garantir índice
CREATE INDEX IF NOT EXISTS ix_notif_dispatch
  ON public.notificacoes (status, agendada_para)
  WHERE status = 'agendada';

CREATE INDEX IF NOT EXISTS ix_notif_mensalidade
  ON public.notificacoes (mensalidade_id) WHERE mensalidade_id IS NOT NULL;


-- 4) helper: cancelar notificações de uma mensalidade -----------------------
CREATE OR REPLACE FUNCTION public.cancelar_notificacoes_mensalidade(
  p_mensalidade_id UUID,
  p_motivo TEXT
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.notificacoes
     SET status = 'cancelada',
         motivo_cancelamento = p_motivo,
         updated_at = now()
   WHERE mensalidade_id = p_mensalidade_id
     AND status = 'agendada';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;


-- 5) helper: agendar notificações de uma mensalidade ------------------------
CREATE OR REPLACE FUNCTION public.agendar_notificacoes_mensalidade(
  p_mensalidade_id UUID
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m RECORD;
  s RECORD;
  v_offset INT;
  v_agendada TIMESTAMPTZ;
  v_inserted INT := 0;
BEGIN
  SELECT * INTO m FROM public.mensalidades WHERE id = p_mensalidade_id;
  IF m IS NULL OR m.status <> 'pendente' THEN RETURN 0; END IF;

  SELECT * INTO s FROM public.notification_settings WHERE tenant_id = m.tenant_id;
  IF s IS NULL THEN
    INSERT INTO public.notification_settings (tenant_id) VALUES (m.tenant_id)
    RETURNING * INTO s;
  END IF;

  -- offsets: dias_antes negativos, vencimento 0, dias_apos positivos
  FOR v_offset IN
    SELECT -x FROM unnest(s.dias_antes_lembrete) AS x
    UNION SELECT 0 WHERE s.enviar_no_vencimento
    UNION SELECT x FROM unnest(s.dias_apos_vencimento) AS x
  LOOP
    v_agendada := ((m.data_vencimento + v_offset) + s.hora_preferencial) AT TIME ZONE s.timezone;

    -- não agendar no passado
    IF v_agendada < now() - interval '1 hour' THEN CONTINUE; END IF;

    INSERT INTO public.notificacoes (
      tenant_id, aluno_id, mensalidade_id, tipo, canal,
      destinatario, mensagem, status, agendada_para, dias_offset
    ) VALUES (
      m.tenant_id, m.aluno_id, m.id,
      CASE WHEN v_offset < 0 THEN 'lembrete'
           WHEN v_offset = 0 THEN 'vencimento'
           ELSE 'atraso' END,
      'whatsapp',
      NULL, '', 'agendada', v_agendada, v_offset
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END $$;


-- 6) triggers em mensalidades -----------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_mensalidade_notificacoes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pendente' THEN
      PERFORM public.agendar_notificacoes_mensalidade(NEW.id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento THEN
      PERFORM public.cancelar_notificacoes_mensalidade(
        NEW.id, 'O vencimento foi alterado. As notificações antigas foram removidas.'
      );
      IF NEW.status = 'pendente' THEN
        PERFORM public.agendar_notificacoes_mensalidade(NEW.id);
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'pago' THEN
        PERFORM public.cancelar_notificacoes_mensalidade(NEW.id, 'Mensalidade paga.');
      ELSIF OLD.status = 'pago' AND NEW.status = 'pendente' THEN
        PERFORM public.agendar_notificacoes_mensalidade(NEW.id);
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.cancelar_notificacoes_mensalidade(OLD.id, 'Mensalidade removida.');
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tg_mensalidade_notificacoes_iud ON public.mensalidades;
CREATE TRIGGER tg_mensalidade_notificacoes_iud
  AFTER INSERT OR UPDATE OR DELETE ON public.mensalidades
  FOR EACH ROW EXECUTE FUNCTION public.tg_mensalidade_notificacoes();


-- 7) bootstrap: settings + templates default por tenant existente -----------
INSERT INTO public.notification_settings (tenant_id)
SELECT t.id FROM public.tenants t
WHERE NOT EXISTS (SELECT 1 FROM public.notification_settings s WHERE s.tenant_id = t.id);

-- Migração dos templates atuais em whatsapp_config → notification_templates
INSERT INTO public.notification_templates (tenant_id, tipo, dias_offset, mensagem)
SELECT wc.tenant_id, 'lembrete', -2,
  COALESCE(wc.template_3_dias,
    'Olá {primeiro_nome}, sua mensalidade na {academia} vence em {dias_restantes} dias ({vencimento} — R$ {valor}). Se já pagou, ignore esta mensagem.')
FROM public.whatsapp_config wc
ON CONFLICT (tenant_id, tipo, dias_offset) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, tipo, dias_offset, mensagem)
SELECT wc.tenant_id, 'vencimento', 0,
  COALESCE(wc.template_vencimento,
    'Olá {primeiro_nome}, sua mensalidade na {academia} vence hoje ({vencimento} — R$ {valor}). Se já pagou, ignore esta mensagem.')
FROM public.whatsapp_config wc
ON CONFLICT (tenant_id, tipo, dias_offset) DO NOTHING;

-- Para tenants sem whatsapp_config, cria defaults
INSERT INTO public.notification_templates (tenant_id, tipo, dias_offset, mensagem)
SELECT t.id, 'lembrete', -2,
  'Olá {primeiro_nome}, sua mensalidade na {academia} vence em {dias_restantes} dias ({vencimento} — R$ {valor}). Se já pagou, ignore esta mensagem.'
FROM public.tenants t
ON CONFLICT (tenant_id, tipo, dias_offset) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, tipo, dias_offset, mensagem)
SELECT t.id, 'vencimento', 0,
  'Olá {primeiro_nome}, sua mensalidade na {academia} vence hoje ({vencimento} — R$ {valor}). Se já pagou, ignore esta mensagem.'
FROM public.tenants t
ON CONFLICT (tenant_id, tipo, dias_offset) DO NOTHING;

-- 8) Agendar notificações para mensalidades pendentes futuras existentes -----
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.mensalidades
     WHERE status = 'pendente' AND data_vencimento >= CURRENT_DATE
  LOOP
    PERFORM public.agendar_notificacoes_mensalidade(r.id);
  END LOOP;
END $$;
