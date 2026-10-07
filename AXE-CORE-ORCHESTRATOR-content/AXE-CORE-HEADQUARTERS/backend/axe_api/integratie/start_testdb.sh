#!/usr/bin/env bash
# Lokale integratie-omgeving: Postgres 16 + PostgREST + de echte migraties.
# Daarna: source de uitgeprinte exports en draai
#   python3 -m pytest integratie/test_bewijs.py -v
# Vereist: postgresql-16 (initdb/pg_ctl), een PostgREST-binary (PGRST=pad), python3 met pyjwt.
set -euo pipefail

HIER="$(cd "$(dirname "$0")" && pwd)"
MIG="$HIER/../../../supabase/migrations"
DATA="${AXE_TESTDB_DIR:-/var/lib/axe-pg}"
POORT="${AXE_TESTDB_PORT:-5433}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGRST="${PGRST:-/opt/postgrest/postgrest}"
GEHEIM="axe-integratie-geheim-dat-lang-genoeg-is-32+"

if [ ! -d "$DATA/data" ]; then
  mkdir -p "$DATA" && chown postgres "$DATA"
  su postgres -c "$PGBIN/initdb -D $DATA/data -A trust >/dev/null"
fi
su postgres -c "$PGBIN/pg_ctl -D $DATA/data -o '-p $POORT -k $DATA -c listen_addresses=*' -l $DATA/log start" || true
sleep 2
P="psql -h $DATA -p $POORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists axe_test" -c "create database axe_test"
for f in "$HIER/supabase_stub.sql" \
         "$MIG/20260707125030_axe_core_system_state.sql" \
         "$MIG/20260708_axe_core_control_plane.sql" \
         "$MIG/20260727_axe_core_trust_levels.sql" \
         "$MIG/20260816_durable_task_kernel.sql" \
         "$MIG/20260901_computer_use.sql" \
         "$MIG/20260915_core_tasks_dicht_voor_anon.sql" \
         "$MIG/20261007120000_missies_en_dax.sql"; do
  $P -d axe_test -f "$f" 2>&1 | grep -v NOTICE || true
done

cat > "$DATA/pgrst.conf" <<CONF
db-uri = "postgres://authenticator@127.0.0.1:$POORT/axe_test"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$GEHEIM"
server-port = 3300
CONF
pkill -f "postgrest $DATA/pgrst.conf" 2>/dev/null || true
nohup "$PGRST" "$DATA/pgrst.conf" > "$DATA/pgrst.log" 2>&1 &
sleep 2

KEY=$(python3 -c "import jwt,time;print(jwt.encode({'role':'service_role','exp':int(time.time())+30*86400},'$GEHEIM',algorithm='HS256'))")
echo "export AXE_INTEGRATIE_PGRST=http://127.0.0.1:3300"
echo "export AXE_INTEGRATIE_KEY=$KEY"
echo "export AXE_INTEGRATIE_PSQL=\"psql -h $DATA -p $POORT -U postgres -d axe_test\""
