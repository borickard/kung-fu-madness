#!/usr/bin/env bash
# Apply the migrations and the seed to a throwaway Postgres cluster, then run
# the SQL tests in supabase/tests. Needs Postgres 15+ binaries; no Docker and
# no Supabase CLI. `pnpm supabase db reset` is still the way to move the real
# local database — this is the fast check that the schema and its policies
# hold up.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${KFM_PG_PORT:-55432}"
work="$(mktemp -d /var/tmp/kfm-pg.XXXXXX)"
bin="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}"
[ -n "$bin" ] && [ -d "$bin" ] || bin="$(dirname "$(command -v initdb)")"

# Postgres refuses to run as root, so borrow the postgres account when we are.
if [ "$(id -u)" = 0 ]; then
  as_pg() { su postgres -c "$1"; }
  chown -R postgres:postgres "$work"
  chmod -R a+rX "$root/supabase"
else
  as_pg() { bash -c "$1"; }
fi

cleanup() {
  as_pg "$bin/pg_ctl -D $work/data -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "› cluster in $work"
as_pg "$bin/initdb -D $work/data -U postgres --auth=trust" >/dev/null
mkdir -p "$work/run"
[ "$(id -u)" = 0 ] && chown postgres:postgres "$work/run"
as_pg "$bin/pg_ctl -D $work/data -o \"-p $port -k $work/run -c listen_addresses=''\" -l $work/pg.log start" >/dev/null
as_pg "psql -h $work/run -p $port -U postgres -q -c 'create database kfm'"

psql_run() { as_pg "psql -h $work/run -p $port -U postgres -d kfm -v ON_ERROR_STOP=1 -q -f $1"; }

echo "› auth shim"
psql_run "$root/supabase/tests/shim_auth.sql" >/dev/null

for migration in "$root"/supabase/migrations/*.sql; do
  echo "› $(basename "$migration")"
  psql_run "$migration" >/dev/null
done

echo "› seed"
psql_run "$root/supabase/seed.sql" >/dev/null

failed=0
for test in "$root"/supabase/tests/*_test.sql; do
  echo "› $(basename "$test")"
  if as_pg "psql -h $work/run -p $port -U postgres -d kfm -v ON_ERROR_STOP=1 -q -f $test" >"$work/out" 2>&1; then
    grep -v '^[[:space:]]*$' "$work/out" || true
  else
    cat "$work/out"
    failed=1
  fi
done

[ "$failed" = 0 ] || { echo "FAILED"; exit 1; }

echo "all green"
