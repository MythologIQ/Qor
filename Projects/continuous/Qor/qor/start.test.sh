#!/usr/bin/env bash
# qor/start.test.sh — scenario harness for qor/start.sh.
# Stubs Neo4j + Bun via $PATH shim + $NEO4J_HOME redirect.
# Runs each wrapper via setsid so we can reap the whole process group between scenarios.
set -eo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
START="$HERE/start.sh"
PASS=0
FAIL=0

make_fixture () {
  FIX="$(mktemp -d)"
  mkdir -p "$FIX/bin" "$FIX/neo4j/bin"

  cat >"$FIX/bin/bun" <<EOF
#!/usr/bin/env bash
echo started > "$FIX/bun.sentinel"
exec sleep 60
EOF
  chmod +x "$FIX/bin/bun"

  cat >"$FIX/neo4j/bin/neo4j" <<'EOF'
#!/usr/bin/env bash
exec python3 -u -c '
import os, socket, sys, time
mode = os.environ.get("QOR_TEST_STUB_MODE", "prompt")
if mode == "never":
    time.sleep(60); sys.exit(0)
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", 7687))
s.listen(1)
if mode == "die_after_boot":
    time.sleep(2); sys.exit(0)
while True:
    time.sleep(60)
'
EOF
  chmod +x "$FIX/neo4j/bin/neo4j"
}

reap_group () {
  local pid="$1"
  local pgid
  pgid=$(ps -o pgid= "$pid" 2>/dev/null | tr -d ' ' || true)
  [[ -n "$pgid" ]] && kill -TERM -"$pgid" 2>/dev/null || true
  sleep 0.3
  [[ -n "$pgid" ]] && kill -KILL -"$pgid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

scenario_boot_gate_pass () {
  make_fixture
  setsid env \
    QOR_TEST_STUB_MODE=prompt \
    NEO4J_HOME="$FIX/neo4j" \
    NEO4J_CONF_DIR="$FIX" \
    NEO4J_BOOT_TIMEOUT=5 \
    NEO4J_LIVENESS_INTERVAL=30 \
    PATH="$FIX/bin:$PATH" \
    bash "$START" >/dev/null 2>&1 &
  local wrapper=$!
  for _ in $(seq 60); do
    [[ -f "$FIX/bun.sentinel" ]] && break
    sleep 0.1
  done
  if [[ -f "$FIX/bun.sentinel" ]]; then
    echo "  [OK] scenario_boot_gate_pass"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] scenario_boot_gate_pass: sentinel never written"
    FAIL=$((FAIL+1))
  fi
  reap_group "$wrapper"
  rm -rf "$FIX"
}

scenario_boot_gate_timeout () {
  make_fixture
  local start_ts end_ts elapsed rc
  start_ts=$(date +%s)
  set +e
  setsid env \
    QOR_TEST_STUB_MODE=never \
    NEO4J_HOME="$FIX/neo4j" \
    NEO4J_CONF_DIR="$FIX" \
    NEO4J_BOOT_TIMEOUT=2 \
    NEO4J_LIVENESS_INTERVAL=30 \
    PATH="$FIX/bin:$PATH" \
    bash "$START" >/dev/null 2>&1 &
  local wrapper=$!
  wait "$wrapper"
  rc=$?
  set -e
  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))
  reap_group "$wrapper"
  if [[ $rc -ne 0 && $elapsed -ge 2 && $elapsed -le 8 && ! -f "$FIX/bun.sentinel" ]]; then
    echo "  [OK] scenario_boot_gate_timeout (exit=$rc, elapsed=${elapsed}s)"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] scenario_boot_gate_timeout: exit=$rc elapsed=${elapsed}s sentinel=$([[ -f "$FIX/bun.sentinel" ]] && echo yes || echo no)"
    FAIL=$((FAIL+1))
  fi
  rm -rf "$FIX"
}

scenario_liveness_kill () {
  make_fixture
  setsid env \
    QOR_TEST_STUB_MODE=die_after_boot \
    NEO4J_HOME="$FIX/neo4j" \
    NEO4J_CONF_DIR="$FIX" \
    NEO4J_BOOT_TIMEOUT=5 \
    NEO4J_LIVENESS_INTERVAL=2 \
    PATH="$FIX/bin:$PATH" \
    bash "$START" >/dev/null 2>&1 &
  local wrapper=$!
  for _ in $(seq 60); do
    [[ -f "$FIX/bun.sentinel" ]] && break
    sleep 0.1
  done
  if [[ ! -f "$FIX/bun.sentinel" ]]; then
    echo "  [FAIL] scenario_liveness_kill: boot gate never passed"
    FAIL=$((FAIL+1))
    reap_group "$wrapper"
    rm -rf "$FIX"
    return
  fi
  for _ in $(seq 80); do
    kill -0 "$wrapper" 2>/dev/null || break
    sleep 0.1
  done
  if ! kill -0 "$wrapper" 2>/dev/null; then
    echo "  [OK] scenario_liveness_kill"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] scenario_liveness_kill: wrapper still alive after 8s"
    FAIL=$((FAIL+1))
  fi
  reap_group "$wrapper"
  rm -rf "$FIX"
}

echo "qor/start.test.sh — 3 scenarios"
scenario_boot_gate_pass
scenario_boot_gate_timeout
scenario_liveness_kill

echo ""
echo "Results: ${PASS} pass, ${FAIL} fail"
[[ $FAIL -eq 0 ]] || exit 1
