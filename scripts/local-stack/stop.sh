#!/usr/bin/env bash
# Stops the local stack started by start.sh and deletes its data.
STACK="${STACK_DIR:-/var/tmp/oc-local-stack}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
for f in postgrest gateway; do [ -f "$STACK/$f.pid" ] && kill "$(cat "$STACK/$f.pid")" 2>/dev/null; done
if [ -d "$STACK/data" ]; then
  if [ "$(id -u)" = 0 ]; then su postgres -c "$PGBIN/pg_ctl -D $STACK/data stop -m fast" >/dev/null 2>&1; else "$PGBIN/pg_ctl" -D "$STACK/data" stop -m fast >/dev/null 2>&1; fi
fi
rm -rf "$STACK"
echo "local stack stopped"
