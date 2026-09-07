#!/bin/bash
set -e
export PATH=/usr/lib/postgresql/16/bin:$PATH
P="psql -h /tmp -p 5599 -U postgres -q -v ON_ERROR_STOP=1"
$P -c "DROP DATABASE IF EXISTS axus WITH (FORCE)" -c "CREATE DATABASE axus" >/dev/null 2>&1
$P -d axus -f "${DIR:-$(cd "$(dirname "$0")" && pwd)}"/00_bootstrap.sql -f "${DIR:-$(cd "$(dirname "$0")" && pwd)}"/00b_infra.sql >/dev/null
$P -d axus -c "CREATE OR REPLACE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS \$f\$ SELECT string_to_array(\$1,'/') \$f\$" >/dev/null
# re-copia do repo a cada rebuild: senao o harness testa um snapshot velho
rm -rf "${DIR:-$(cd "$(dirname "$0")" && pwd)}"/mig && mkdir -p "${DIR:-$(cd "$(dirname "$0")" && pwd)}"/mig
for f in "${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"/supabase/migrations/*.sql; do
  sed -E 's/^(CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net);)/-- [stub ambiente] \1/' "$f" > "${DIR:-$(cd "$(dirname "$0")" && pwd)}"/mig/$(basename $f)
done
for f in $(ls "${DIR:-$(cd "$(dirname "$0")" && pwd)}"/mig/*.sql | sort); do $P -d axus -f "$f" >/dev/null; done
# o trigger real de cadastro cria tenant por usuario; no fixture o tenant e explicito
$P -d axus -c "ALTER TABLE auth.users DISABLE TRIGGER USER" >/dev/null
$P -d axus -f "${DIR:-$(cd "$(dirname "$0")" && pwd)}"/10_seed.sql >/dev/null
for h in 4 7 10; do $P -d axus -f "${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"/supabase/HARDENING_${h}_APLICAR.sql >/dev/null 2>&1 || echo "  (HARDENING_${h} parcial)"; done
$P -d axus -f "${DIR:-$(cd "$(dirname "$0")" && pwd)}"/11_alunos.sql >/dev/null
$P -d axus -f "${DIR:-$(cd "$(dirname "$0")" && pwd)}"/12_tenantC.sql >/dev/null
$P -d axus -f "${DIR:-$(cd "$(dirname "$0")" && pwd)}"/assert.sql >/dev/null
echo "rebuild ok"
