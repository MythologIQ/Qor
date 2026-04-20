#!/usr/bin/env bash
# qor/start.sh — mono-service entrypoint.
# Owns Neo4j lifecycle; boots the Bun IPC+HTTP service only after Bolt is reachable.
# kill -TERM 0 on liveness loss signals the whole process group so supervisor restarts clean.
set -eo pipefail

: "${NEO4J_BOOT_TIMEOUT:=90}"
: "${NEO4J_LIVENESS_INTERVAL:=30}"
: "${NEO4J_HOME:=/opt/neo4j}"
: "${NEO4J_CONF_DIR:=$(dirname "$0")}"
export NEO4J_HOME NEO4J_CONF_DIR

"$NEO4J_HOME/bin/neo4j" console &
NEO4J_PID=$!

deadline=$(( $(date +%s) + NEO4J_BOOT_TIMEOUT ))
until exec 3<>/dev/tcp/127.0.0.1/7687 2>/dev/null; do
  if [[ $(date +%s) -gt $deadline ]]; then
    echo "qor: neo4j boot timeout after ${NEO4J_BOOT_TIMEOUT}s" >&2
    kill "$NEO4J_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done
exec 3<&-

(
  while true; do
    sleep "$NEO4J_LIVENESS_INTERVAL"
    if ! kill -0 "$NEO4J_PID" 2>/dev/null; then
      echo "qor: neo4j pid dead" >&2
      kill -TERM 0
      exit 1
    fi
    if ! exec 3<>/dev/tcp/127.0.0.1/7687 2>/dev/null; then
      echo "qor: bolt unreachable" >&2
      kill -TERM 0
      exit 1
    fi
    exec 3<&-
  done
) &

cd "$(dirname "$0")/.."
exec bun run continuum/src/service/server.ts
