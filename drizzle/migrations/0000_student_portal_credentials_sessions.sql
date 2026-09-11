CREATE TABLE public.aluno_credenciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id uuid NOT NULL UNIQUE REFERENCES public.alunos(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  matricula text NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  troca_senha_obrigatoria boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  tentativas_falhas integer NOT NULL DEFAULT 0,
  bloqueado_ate timestamptz,
  senha_alterada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aluno_credenciais_tentativas_validas CHECK (tentativas_falhas >= 0)
);
GRANT ALL ON public.aluno_credenciais TO service_role;
ALTER TABLE public.aluno_credenciais ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_aluno_credenciais_tenant ON public.aluno_credenciais(tenant_id);
CREATE INDEX idx_aluno_credenciais_matricula ON public.aluno_credenciais(matricula);

CREATE TABLE public.aluno_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credencial_id uuid NOT NULL REFERENCES public.aluno_credenciais(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.aluno_sessoes TO service_role;
ALTER TABLE public.aluno_sessoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_aluno_sessoes_credencial ON public.aluno_sessoes(credencial_id);
CREATE INDEX idx_aluno_sessoes_validade ON public.aluno_sessoes(expires_at) WHERE revoked_at IS NULL;

CREATE TRIGGER set_aluno_credenciais_updated_at
  BEFORE UPDATE ON public.aluno_credenciais
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

REVOKE EXECUTE ON FUNCTION public.portal_aluno_dados(text) FROM PUBLIC, anon, authenticated;