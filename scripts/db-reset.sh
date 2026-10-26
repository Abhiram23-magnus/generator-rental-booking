#!/usr/bin/env bash
# Recreates a local test database that mimics Supabase's roles, then applies every migration.
# Usage: DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/db-reset.sh [dbname]
set -euo pipefail
DB="${1:-generator_test}"
ADMIN_URL="${DATABASE_URL:-postgres://postgres@localhost:5432/postgres}"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB with (force)" -c "create database $DB"
DB_URL="${ADMIN_URL%/*}/$DB"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
SQL
for f in "$(dirname "$0")"/../supabase/migrations/*.sql; do
  PGOPTIONS="-c client_min_messages=warning" psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "$DB_URL" -q -c "grant usage on schema extensions to anon, authenticated, service_role"
echo "Database $DB ready"
