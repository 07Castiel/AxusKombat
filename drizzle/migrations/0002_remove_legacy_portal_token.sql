-- Encerra o modelo antigo do portal: link publico por token e credencial com senha.
-- O acesso do aluno passa a ser exclusivamente por matricula ativa em
-- public.aluno_credenciais, validada em /portal.

DROP FUNCTION IF EXISTS public.portal_aluno_dados(text);

ALTER TABLE public.alunos
  DROP COLUMN IF EXISTS portal_token;

-- A matricula virou o unico segredo de acesso: nao ha mais senha para guardar,
-- nem troca obrigatoria no primeiro acesso. O bloqueio por tentativas
-- (tentativas_falhas, bloqueado_ate) continua valendo.
ALTER TABLE public.aluno_credenciais
  DROP COLUMN IF EXISTS senha_hash,
  DROP COLUMN IF EXISTS troca_senha_obrigatoria,
  DROP COLUMN IF EXISTS senha_alterada_em;
