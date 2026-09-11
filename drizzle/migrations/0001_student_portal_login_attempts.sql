CREATE TABLE public.aluno_login_tentativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  matricula_hash text NOT NULL,
  sucesso boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.aluno_login_tentativas TO service_role;
ALTER TABLE public.aluno_login_tentativas ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_aluno_login_tentativas_ip_data ON public.aluno_login_tentativas(ip_hash, created_at DESC);
CREATE INDEX idx_aluno_login_tentativas_matricula_data ON public.aluno_login_tentativas(matricula_hash, created_at DESC);