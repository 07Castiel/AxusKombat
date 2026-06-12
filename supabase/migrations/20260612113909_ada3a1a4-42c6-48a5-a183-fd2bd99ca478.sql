-- visitor_logs
CREATE TABLE public.visitor_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  user_agent TEXT,
  browser TEXT,
  operating_system TEXT,
  device_type TEXT,
  screen_resolution TEXT,
  language TEXT,
  timezone TEXT,
  current_page TEXT,
  referrer TEXT,
  session_id TEXT,
  is_logged_user BOOLEAN NOT NULL DEFAULT FALSE,
  user_id UUID NULL
);

GRANT SELECT, DELETE ON public.visitor_logs TO authenticated;
GRANT ALL ON public.visitor_logs TO service_role;

ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read visitor logs"
  ON public.visitor_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete visitor logs"
  ON public.visitor_logs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_visitor_logs_created_at ON public.visitor_logs (created_at DESC);
CREATE INDEX idx_visitor_logs_session ON public.visitor_logs (session_id, current_page, created_at DESC);
CREATE INDEX idx_visitor_logs_country ON public.visitor_logs (country);
CREATE INDEX idx_visitor_logs_user_id ON public.visitor_logs (user_id) WHERE user_id IS NOT NULL;

-- system_logs
CREATE TABLE public.system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL DEFAULT 'error',
  source TEXT,
  message TEXT NOT NULL,
  context JSONB
);

GRANT SELECT, DELETE ON public.system_logs TO authenticated;
GRANT ALL ON public.system_logs TO service_role;

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read system logs"
  ON public.system_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete system logs"
  ON public.system_logs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_system_logs_created_at ON public.system_logs (created_at DESC);