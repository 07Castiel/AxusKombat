
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS endereco TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_cnpj_cpf_unique ON public.tenants (cnpj_cpf) WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf <> '';
