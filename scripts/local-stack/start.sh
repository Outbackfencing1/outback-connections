#!/usr/bin/env bash
# LOCAL STACK ONLY. Starts a throwaway Postgres 16 + PostgREST + a gateway that
# looks like the Supabase API, applies the digital-services DRAFT migrations,
# and writes app.env for `next build`/`next start`. Nothing hosted is touched;
# all keys are random per run. Usage:
#   POSTGREST_BIN=/path/to/postgrest scripts/local-stack/start.sh
#   scripts/local-stack/stop.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
STACK="${STACK_DIR:-/var/tmp/oc-local-stack}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT="${PGPORT:-5499}"
: "${POSTGREST_BIN:?set POSTGREST_BIN to a PostgREST v12 binary}"

rm -rf "$STACK" && mkdir -p "$STACK" && chmod 777 "$STACK"
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
as_pg "$PGBIN/initdb -D $STACK/data -A trust >/dev/null"
as_pg "$PGBIN/pg_ctl -D $STACK/data -o '-p $PGPORT -k $STACK' -l $STACK/pg.log start >/dev/null"
for i in $(seq 1 30); do psql -h 127.0.0.1 -p "$PGPORT" -U postgres -tAc "select 1" >/dev/null 2>&1 && break; sleep 0.5; done
PSQL="psql -h 127.0.0.1 -p $PGPORT -U postgres -q -v ON_ERROR_STOP=1"
$PSQL -f "$HERE/schema.sql"
$PSQL -f "$ROOT/supabase/migrations/_drafts/digital_services_enquiries.sql" 2>/dev/null
$PSQL -f "$ROOT/supabase/migrations/_drafts/digital_services_pilot.sql" 2>/dev/null
$PSQL -f "$ROOT/supabase/migrations/_drafts/digital_services_sales.sql" 2>/dev/null
$PSQL -c "insert into public.digital_services_settings (owner_user_id) values ('33333333-3333-4333-8333-333333333333')"

SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 48)"
cat > "$STACK/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:local-only@127.0.0.1:$PGPORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-host = "127.0.0.1"
server-port = 54329
CONF
nohup "$POSTGREST_BIN" "$STACK/postgrest.conf" >"$STACK/postgrest.log" 2>&1 &
echo $! >"$STACK/postgrest.pid"
LOCAL_JWT_SECRET="$SECRET" nohup node "$HERE/gateway.mjs" >"$STACK/gateway.log" 2>&1 &
echo $! >"$STACK/gateway.pid"
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:54321/rest/v1/ && break; sleep 0.25; done

ANON="$(cd "$HERE" && node -e "import('./jwt.mjs').then(m=>console.log(m.sign({role:'anon'},'$SECRET')))")"
SERVICE="$(cd "$HERE" && node -e "import('./jwt.mjs').then(m=>console.log(m.sign({role:'service_role'},'$SECRET')))")"
cat > "$STACK/app.env" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
LOCAL_JWT_SECRET=$SECRET
DIGITAL_SERVICES_PUBLIC=on
DIGITAL_SERVICES_OWNER_USER_ID=33333333-3333-4333-8333-333333333333
DIGITAL_SERVICES_ALERT_TO=owner-alerts@example.test
URL_SIGNING_SECRET=local-stack-placeholder
NEXT_PUBLIC_BASE_URL=http://localhost:3200
ENV
echo "local stack up: Postgres :$PGPORT, PostgREST :54329, gateway :54321; env in $STACK/app.env"
