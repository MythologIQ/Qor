#!/usr/bin/env bash
# qor/qor-live-canary.sh — post-cutover live canary.
# 8 assertions validate qor service health + IPC + env_var correctness at runtime.
# Exit 0 iff all pass. Each assertion emits PASS/FAIL line and bumps counter.
set -uo pipefail

: "${QOR_HEALTH_URL:=http://localhost:4100/health}"
: "${QOR_PUBLIC_HEALTH_URL:=https://qor-frostwulf.zocomputer.io/health}"
: "${QOR_STATS_URL:=http://localhost:4100/api/continuum/stats}"
: "${QOR_BOLT_HOST:=127.0.0.1}"
: "${QOR_BOLT_PORT:=7687}"

failures=0

pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s: %s\n' "$1" "$2" >&2; failures=$((failures + 1)); }

# 1. Liveness
if curl -fsS -o /dev/null "$QOR_HEALTH_URL"; then
  pass "liveness (localhost:4100/health 200)"
else
  fail "liveness (localhost:4100/health)" "curl non-200 or unreachable"
fi

# 2. Public route
if curl -fsS -o /dev/null "$QOR_PUBLIC_HEALTH_URL"; then
  pass "public route ($QOR_PUBLIC_HEALTH_URL 200)"
else
  fail "public route ($QOR_PUBLIC_HEALTH_URL)" "curl non-200 or unreachable"
fi

# 3. Neo4j-backed route
stats_body=$(curl -fsS "$QOR_STATS_URL" 2>/dev/null || true)
if [[ -n "$stats_body" ]] && echo "$stats_body" | python3 -c 'import sys,json; json.loads(sys.stdin.read())' 2>/dev/null; then
  pass "neo4j-backed route ($QOR_STATS_URL 200 with JSON)"
else
  fail "neo4j-backed route ($QOR_STATS_URL)" "non-200, non-JSON, or unreachable"
fi

# 4. Bolt liveness
if (exec 3<>/dev/tcp/"$QOR_BOLT_HOST"/"$QOR_BOLT_PORT") 2>/dev/null && exec 3<&- 3>&-; then
  pass "bolt liveness ($QOR_BOLT_HOST:$QOR_BOLT_PORT bound)"
else
  fail "bolt liveness ($QOR_BOLT_HOST:$QOR_BOLT_PORT)" "connect refused"
fi

# 5. Legacy IPC socket absent
if [[ ! -e "/tmp/continuum.sock" ]]; then
  pass "legacy ipc absent (/tmp/continuum.sock)"
else
  fail "legacy ipc absent (/tmp/continuum.sock)" "legacy socket exists"
fi

# 6. Active IPC socket present (Phase 1 #37)
if [[ -e "/tmp/qor.sock" ]]; then
  pass "ipc socket present (/tmp/qor.sock)"
else
  fail "ipc socket present (/tmp/qor.sock)" "socket missing — IPC not started"
fi

# 7. Ghost sockets absent (no stale IPC files from prior runs)
if [[ ! -e "/tmp/qor.sock.old" ]] && [[ ! -e "/tmp/continuum.sock.old" ]]; then
  pass "no ghost ipc sockets"
else
  fail "no ghost ipc sockets" "stale .old socket files found"
fi

# 8. Victor IPC roundtrip via events.execution.query
CANARY_TOKEN=$(python3 -c 'import json;print(json.load(open("/home/workspace/Projects/continuous/Qor/.secrets/ipc-agents.json"))["victor"])')
CANARY_RESULT=$(VICTOR_KERNEL_TOKEN="$CANARY_TOKEN" QOR_IPC_SOCKET=/tmp/qor.sock bun run /home/workspace/Projects/continuous/Qor/scripts/ipc-canary-victor.ts 2>&1)
if [[ "$CANARY_RESULT" == PASS* ]]; then
  pass "victor ipc roundtrip (events.execution.query)"
else
  fail "victor ipc roundtrip (events.execution.query)" "$CANARY_RESULT"
fi

if (( failures == 0 )); then
  printf '\nqor-live-canary: OK (8/8 assertions passed)\n'
  exit 0
else
  printf '\nqor-live-canary: FAIL (%d assertion(s) failed)\n' "$failures" >&2
  exit 1
fi
