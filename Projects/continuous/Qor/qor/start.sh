#!/usr/bin/env bash
# qor/start.sh — mono-service entrypoint.
# Owns Neo4j + Bun lifecycle; boots HTTP only after Bolt is reachable.
# kill -TERM 0 on liveness loss signals the whole process group for supervisor restart.
set -eo pipefail

: "${NEO4J_BOOT_TIMEOUT:=90}"
: "${NEO4J_LIVENESS_INTERVAL:=30}"
: "${NEO4J_HOME:=/opt/neo4j}"
: "${NEO4J_CONF_DIR:=$(dirname "$0")}"
: "${QOR_CRASHLOOP_MAX:=3}"
: "${QOR_CRASHLOOP_WINDOW:=60}"
: "${QOR_CRASHLOOP_COOLDOWN:=60}"
: "${QOR_CRASHLOOP_FILE:=/dev/shm/qor-crashloop}"
export NEO4J_HOME NEO4J_CONF_DIR

now=$(date +%s)
failures=0
windowStart=$now
if [[ -r "$QOR_CRASHLOOP_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$QOR_CRASHLOOP_FILE" 2>/dev/null || true
  [[ "$failures" =~ ^[0-9]+$ ]] || failures=0
  [[ "$windowStart" =~ ^[0-9]+$ ]] || windowStart=$now
fi
if (( now - windowStart > QOR_CRASHLOOP_WINDOW )); then
  failures=0
  windowStart=$now
fi
if (( failures >= QOR_CRASHLOOP_MAX )); then
  echo "qor: crashloop cooldown ${QOR_CRASHLOOP_COOLDOWN}s (failures=$failures)" >&2
  sleep "$QOR_CRASHLOOP_COOLDOWN"
  failures=0
  windowStart=$(date +%s)
else
  failures=$((failures + 1))
fi
printf 'failures=%s\nwindowStart=%s\n' "$failures" "$windowStart" > "$QOR_CRASHLOOP_FILE"

if (exec 3<>/dev/tcp/127.0.0.1/7687) 2>/dev/null; then
  echo "qor: port 7687 already bound; refusing to launch neo4j (orphan suspected)" >&2
  exit 1
fi

"$NEO4J_HOME/bin/neo4j" console &
NEO4J_PID=$!

deadline=$(( $(date +%s) + NEO4J_BOOT_TIMEOUT ))
until (exec 3<>/dev/tcp/127.0.0.1/7687) 2>/dev/null; do
  if [[ $(date +%s) -gt $deadline ]]; then
    echo "qor: neo4j boot timeout after ${NEO4J_BOOT_TIMEOUT}s" >&2
    kill "$NEO4J_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 0.2
done

cd "$(dirname "$0")/.."
bun run continuum/src/service/server.ts &
BUN_PID=$!

(
  while true; do
    sleep "$NEO4J_LIVENESS_INTERVAL"
    if ! kill -0 "$NEO4J_PID" 2>/dev/null; then
      echo "qor: neo4j pid dead" >&2
      kill -TERM 0
      exit 1
    fi
    if ! (exec 3<>/dev/tcp/127.0.0.1/7687) 2>/dev/null; then
      echo "qor: bolt unreachable" >&2
      kill -TERM 0
      exit 1
    fi
    if ! kill -0 "$BUN_PID" 2>/dev/null; then
      echo "qor: bun pid dead" >&2
      kill -TERM 0
      exit 1
    fi
  done
) &

set +e
wait "$BUN_PID"
BUN_EXIT=$?
set -e
if [[ $BUN_EXIT -ne 0 ]]; then
  echo "qor: bun pid dead (exit=$BUN_EXIT)" >&2
fi
if [[ $BUN_EXIT -eq 0 ]]; then
  rm -f "$QOR_CRASHLOOP_FILE"
fi
exit "$BUN_EXIT"
