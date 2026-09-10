ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS aquecimento_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS numero_ativo_desde date,
  ADD COLUMN IF NOT EXISTS limite_diario integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS intervalo_min_seg integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS intervalo_max_seg integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS variacao_texto boolean NOT NULL DEFAULT true;

ALTER TABLE public.notification_settings
  ADD CONSTRAINT notification_settings_intervalo_chk
  CHECK (intervalo_min_seg >= 0 AND intervalo_max_seg >= intervalo_min_seg AND intervalo_max_seg <= 300);

ALTER TABLE public.notification_settings
  ADD CONSTRAINT notification_settings_limite_chk
  CHECK (limite_diario > 0 AND limite_diario <= 2000);