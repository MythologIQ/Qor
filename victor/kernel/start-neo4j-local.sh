#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/workspace/Projects/continuous/Victor/kernel/.runtime"
VERSION="5.26.6"
ARCHIVE="neo4j-community-${VERSION}-unix.tar.gz"
URL="https://dist.neo4j.org/${ARCHIVE}"
HOME_DIR="${ROOT}/neo4j-community-${VERSION}"
LOG_FILE="/dev/shm/victor-neo4j.log"
TTY_LOG="/dev/shm/victor-neo4j.typescript"

mkdir -p "${ROOT}"

if [[ ! -d "${HOME_DIR}" ]]; then
  cd "${ROOT}"
  curl -L "${URL}" -o "${ARCHIVE}"
  tar -xzf "${ARCHIVE}"
fi

if curl -fsS http://127.0.0.1:7474 >/dev/null 2>&1; then
  echo "Neo4j already responding on http://127.0.0.1:7474"
  exit 0
fi

cd "${HOME_DIR}"

if [[ ! -f data/dbms/auth.ini ]]; then
  NEO4J_ALLOW_RUN_AS_ROOT=true bin/neo4j-admin dbms set-initial-password victor-memory-dev
fi

nohup script -q -c 'export NEO4J_ALLOW_RUN_AS_ROOT=true HEAP_SIZE=512m; bin/neo4j console' "${TTY_LOG}" >"${LOG_FILE}" 2>&1 &

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:7474 >/dev/null 2>&1; then
    echo "Neo4j started at http://127.0.0.1:7474"
    exit 0
  fi
  sleep 1
done

echo "Neo4j did not become ready. Check ${LOG_FILE} and ${HOME_DIR}/logs/neo4j.log" >&2
exit 1
