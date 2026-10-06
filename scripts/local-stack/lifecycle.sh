#!/usr/bin/env bash
# LOCAL STACK ONLY. Runs lifecycle.spec.ts in three phases and restarts the
# app server between them, so each unfinished state has to survive a restart.
# Needs the stack running (start.sh) and a build made with its app.env:
#   set -a; source /var/tmp/oc-local-stack/app.env; set +a; npm run build
#   scripts/local-stack/lifecycle.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
STACK="${STACK_DIR:-/var/tmp/oc-local-stack}"
PORT="${LOCAL_APP_PORT:-3200}"
set -a; source "$STACK/app.env"; set +a
export LIFECYCLE_STATE="$STACK/lifecycle.json"
export LIFECYCLE_SHOTS="${LIFECYCLE_SHOTS:-$STACK/shots}"
mkdir -p "$LIFECYCLE_SHOTS"

listener() { fuser "$PORT/tcp" 2>/dev/null | awk '{print $1}' || true; }
stop_app() {
  # Stop whatever listens on the port (npx's child next-server included), and
  # wait until the port is free, so the next phase really gets a new process.
  local pid; pid="$(listener)"
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  if [ -f "$STACK/app.pid" ]; then kill "$(cat "$STACK/app.pid")" 2>/dev/null || true; rm -f "$STACK/app.pid"; fi
  for i in $(seq 1 60); do [ -z "$(listener)" ] && return 0; sleep 0.25; done
  echo "port $PORT still in use" >&2; exit 1
}
start_app() {
  (cd "$ROOT" && nohup npx next start -p "$PORT" >"$STACK/app.log" 2>&1 & echo $! >"$STACK/app.pid")
  for i in $(seq 1 120); do curl -s -o /dev/null "http://localhost:$PORT/" && return 0; sleep 0.5; done
  echo "app didn't start" >&2; exit 1
}
trap stop_app EXIT

for phase in 1 2 3; do
  stop_app
  start_app
  pid="$(listener)"
  if [ -n "${previous:-}" ] && [ "$pid" = "$previous" ]; then echo "server wasn't restarted" >&2; exit 1; fi
  previous="$pid"
  echo "[lifecycle.sh] phase $phase on a freshly started server (listener pid $pid, started $(ps -o lstart= -p "$pid"))"
  LIFECYCLE_PHASE=$phase npx playwright test -c "$HERE/playwright.local.config.ts" "$HERE/lifecycle.spec.ts"
done
echo "[lifecycle.sh] all three phases passed with restarts between them; screenshots in $LIFECYCLE_SHOTS"
