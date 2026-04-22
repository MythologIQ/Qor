#!/usr/bin/env bash
# qor/qor-live-canary.sh — post-cutover live canary.
# 6 assertions validate qor service health + env_var correctness at runtime.
# Exit 0 iff all pass. Each assertion emits PASS/FAIL line and bumps counter.
set -uo pipefail

: "${QOR_HEALTH_URL:=http://localhost:4100/health}"
: "${QOR_PUBLIC_HEALTH_URL:=https://qor-frostwulf.zocomputer.io/health}"
: "${QOR_STATS_URL:=http://localhost:4100/api/continuum/stats}"
: "${QOR_BOLT_HOST:=127.0.0.1}"
: "${QOR_BOLT_PORT:=7687}"
: "${QOR_IPC_SOCKET_PATHS:=/tmp/qor.sock /tmp/continuum.sock}"

failures=0

pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s: %s\n' "$1" "$2" >&2; failures=$((failures + 1)); }

if curl -fsS -o /dev/null "$QOR_HEALTH_URL"; then
  pass "liveness (localhost:4100/health 200)"
else
  fail "liveness (localhost:4100/health)" "curl non-200 or unreachable"
fi

if curl -fsS -o /dev/null "$QOR_PUBLIC_HEALTH_URL"; then
  pass "public route ($QOR_PUBLIC_HEALTH_URL 200)"
else
  fail "public route ($QOR_PUBLIC_HEALTH_URL)" "curl non-200 or unreachable"
fi

stats_body=$(curl -fsS "$QOR_STATS_URL" 2>/dev/null || true)
if [[ -n "$stats_body" ]] && echo "$stats_body" | python3 -c 'import sys,json; json.loads(sys.stdin.read())' 2>/dev/null; then
  pass "neo4j-backed route ($QOR_STATS_URL 200 with JSON)"
else
  fail "neo4j-backed route ($QOR_STATS_URL)" "non-200, non-JSON, or unreachable — NEO4J_* env_vars or driver handshake issue"
fi

if (exec 3<>/dev/tcp/"$QOR_BOLT_HOST"/"$QOR_BOLT_PORT") 2>/dev/null && exec 3<&- 3>&-; then
  pass "bolt liveness ($QOR_BOLT_HOST:$QOR_BOLT_PORT bound)"
else
  fail "bolt liveness ($QOR_BOLT_HOST:$QOR_BOLT_PORT)" "connect refused — neo4j not up under qor lifecycle"
fi

for sock in $QOR_IPC_SOCKET_PATHS; do
  if [[ ! -e "$sock" ]]; then
    pass "ipc socket absent ($sock)"
  else
    fail "ipc socket absent ($sock)" "socket exists — IPC not deferred"
  fi
done

if (( failures == 0 )); then
  printf '\nqor-live-canary: OK (6/6 assertions passed)\n'
  exit 0
else
  printf '\nqor-live-canary: FAIL (%d assertion(s) failed)\n' "$failures" >&2
  exit 1
fi
