# Auditoria de Segurança — Axus Kombat

Relatório de auditoria de segurança do repositório, focado em cinco categorias
adaptadas à stack (TanStack Start + Supabase/PostgreSQL com RLS + Cloudflare
Workers + Stripe + Evolution API):

1. Isolamento de inquilino (RLS / tenant)
2. Permissão definida no navegador
3. IDOR
4. Chaves e segredos expostos / defaults inseguros
5. Inputs sem tratamento (XSS)

## Arquivos

- `relatorio-auditoria-seguranca.pdf` — o relatório (capa, resumo executivo com
  gráficos, pontos fortes/fracos, achados detalhados, recomendações priorizadas
  e a seção "Issues para o GitHub").
- `achados.py` — dados da auditoria (fonte única de verdade: achados,
  pontos fortes, recomendações e agrupamento de issues).
- `gerar_relatorio.py` — gerador do PDF (reportlab + matplotlib).

## Regerar o PDF

Sem instalação global; ambiente isolado:

```bash
python3 -m venv venv
./venv/bin/pip install reportlab matplotlib
./venv/bin/python gerar_relatorio.py
```

O PDF é reescrito em `relatorio-auditoria-seguranca.pdf`. Para editar um achado,
altere `achados.py` e regere.

> Metodologia: os achados críticos foram reproduzidos em uma instância
> PostgreSQL 16 local, montada a partir das migrações reais do repositório
> (`supabase/migrations` + `drizzle/migrations`), com o harness de
> `supabase/testes`.
