ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proxima_tentativa timestamptz,
  ADD COLUMN IF NOT EXISTS erro_codigo text;

CREATE INDEX IF NOT EXISTS idx_notificacoes_retry
  ON public.notificacoes (tenant_id, status, proxima_tentativa);

-- dedupe templates (mantém o mais recente por tenant/tipo/offset)
DELETE FROM public.notification_templates t
USING public.notification_templates t2
WHERE t.tenant_id = t2.tenant_id
  AND t.tipo = t2.tipo
  AND t.dias_offset = t2.dias_offset
  AND (t.created_at, t.id) < (t2.created_at, t2.id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_templates_tenant_tipo_offset
  ON public.notification_templates (tenant_id, tipo, dias_offset);

CREATE TABLE IF NOT EXISTS public.notification_worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  scanned integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_worker_runs TO authenticated;
GRANT ALL ON public.notification_worker_runs TO service_role;

ALTER TABLE public.notification_worker_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem ver execucoes do worker" ON public.notification_worker_runs;
CREATE POLICY "Admins podem ver execucoes do worker"
  ON public.notification_worker_runs FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_worker_runs_started
  ON public.notification_worker_runs (started_at DESC);