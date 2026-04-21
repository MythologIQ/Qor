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

  cat >"$FIX/neo4j/bin/neo4j" <<EOF
#!/usr/bin/env bash
echo invoked > "$FIX/neo4j.sentinel"
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
    QOR_CRASHLOOP_MAX=99 \
    QOR_CRASHLOOP_FILE="$FIX/qor-crashloop" \
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
    QOR_CRASHLOOP_MAX=99 \
    QOR_CRASHLOOP_FILE="$FIX/qor-crashloop" \
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
    QOR_CRASHLOOP_MAX=99 \
    QOR_CRASHLOOP_FILE="$FIX/qor-crashloop" \
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

scenario_crashloop_cooldown () {
  make_fixture
  local seed_ts
  seed_ts=$(date +%s)
  printf 'failures=3\nwindowStart=%s\n' "$seed_ts" > "$FIX/qor-crashloop"
  local start_ts end_ts elapsed
  start_ts=$(date +%s)
  setsid env \
    QOR_TEST_STUB_MODE=prompt \
    NEO4J_HOME="$FIX/neo4j" \
    NEO4J_CONF_DIR="$FIX" \
    NEO4J_BOOT_TIMEOUT=5 \
    NEO4J_LIVENESS_INTERVAL=30 \
    QOR_CRASHLOOP_MAX=3 \
    QOR_CRASHLOOP_WINDOW=60 \
    QOR_CRASHLOOP_COOLDOWN=1 \
    QOR_CRASHLOOP_FILE="$FIX/qor-crashloop" \
    PATH="$FIX/bin:$PATH" \
    bash "$START" >/dev/null 2>&1 &
  local wrapper=$!
  for _ in $(seq 80); do
    [[ -f "$FIX/bun.sentinel" ]] && break
    sleep 0.1
  done
  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))
  local counter_failures=""
  [[ -r "$FIX/qor-crashloop" ]] && counter_failures=$(grep '^failures=' "$FIX/qor-crashloop" | cut -d= -f2)
  if [[ -f "$FIX/bun.sentinel" && $elapsed -ge 1 && "$counter_failures" == "0" ]]; then
    echo "  [OK] scenario_crashloop_cooldown (elapsed=${elapsed}s, failures=$counter_failures)"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] scenario_crashloop_cooldown: elapsed=${elapsed}s sentinel=$([[ -f "$FIX/bun.sentinel" ]] && echo yes || echo no) failures=$counter_failures"
    FAIL=$((FAIL+1))
  fi
  reap_group "$wrapper"
  rm -rf "$FIX"
}

scenario_crashloop_window_reset () {
  make_fixture
  local now past
  now=$(date +%s)
  past=$((now - 120))
  printf 'failures=3\nwindowStart=%s\n' "$past" > "$FIX/qor-crashloop"
  local start_ts end_ts elapsed
  start_ts=$(date +%s)
  setsid env \
    QOR_TEST_STUB_MODE=prompt \
    NEO4J_HOME="$FIX/neo4j" \
    NEO4J_CONF_DIR="$FIX" \
    NEO4J_BOOT_TIMEOUT=5 \
    NEO4J_LIVENESS_INTERVAL=30 \
    QOR_CRASHLOOP_MAX=3 \
    QOR_CRASHLOOP_WINDOW=60 \
    QOR_CRASHLOOP_COOLDOWN=60 \
    QOR_CRASHLOOP_FILE="$FIX/qor-crashloop" \
    PATH="$FIX/bin:$PATH" \
    bash "$START" >/dev/null 2>&1 &
  local wrapper=$!
  for _ in $(seq 60); do
    [[ -f "$FIX/bun.sentinel" ]] && break
    sleep 0.1
  done
  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))
  local counter_failures="" counter_window=""
  if [[ -r "$FIX/qor-crashloop" ]]; then
    counter_failures=$(grep '^failures=' "$FIX/qor-crashloop" | cut -d= -f2)
    counter_window=$(grep '^windowStart=' "$FIX/qor-crashloop" | cut -d= -f2)
  fi
  if [[ -f "$FIX/bun.sentinel" && $elapsed -lt 3 && "$counter_failures" == "1" && "$counter_window" != "$past" ]]; then
    echo "  [OK] scenario_crashloop_window_reset (elapsed=${elapsed}s, failures=$counter_failures)"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] scenario_crashloop_window_reset: elapsed=${elapsed}s failures=$counter_failures windowStart=$counter_window (past=$past)"
    FAIL=$((FAIL+1))
  fi
  reap_group "$wrapper"
  rm -rf "$FIX"
}

scenario_preflight_port_probe () {
  make_fixture
  python3 -u -c '
import socket, sys, time
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", 7687))
s.listen(1)
sys.stdout.flush()
time.sleep(30)
' >/dev/null 2>&1 &
  local orphan_bg=$!
  local bound=no
  for _ in $(seq 40); do
    if exec 3<>/dev/tcp/127.0.0.1/7687 2>/dev/null; then
      exec 3<&-
      bound=yes
      break
    fi
    sleep 0.1
  done
  if [[ "$bound" != "yes" ]]; then
    echo "  [FAIL] scenario_preflight_port_probe: orphan listener never bound 7687"
    FAIL=$((FAIL+1))
    kill "$orphan_bg" 2>/dev/null || true
    wait "$orphan_bg" 2>/dev/null || true
    rm -rf "$FIX"
    return
  fi

  local rc
  set +e
  setsid env \
    QOR_TEST_STUB_MODE=prompt \
    NEO4J_HOME="$FIX/neo4j" \
    NEO4J_CONF_DIR="$FIX" \
    NEO4J_BOOT_TIMEOUT=5 \
    NEO4J_LIVENESS_INTERVAL=30 \
    QOR_CRASHLOOP_MAX=99 \
    QOR_CRASHLOOP_FILE="$FIX/qor-crashloop" \
    PATH="$FIX/bin:$PATH" \
    bash "$START" >/dev/null 2>"$FIX/stderr.log"
  rc=$?
  set -e

  kill "$orphan_bg" 2>/dev/null || true
  wait "$orphan_bg" 2>/dev/null || true

  local stderr_has_msg=no neo4j_not_invoked=no
  grep -q "port 7687 already bound" "$FIX/stderr.log" 2>/dev/null && stderr_has_msg=yes
  [[ ! -f "$FIX/neo4j.sentinel" ]] && neo4j_not_invoked=yes

  if [[ $rc -eq 1 && "$stderr_has_msg" == "yes" && "$neo4j_not_invoked" == "yes" ]]; then
    echo "  [OK] scenario_preflight_port_probe"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] scenario_preflight_port_probe: rc=$rc msg=$stderr_has_msg neo4j_absent=$neo4j_not_invoked"
    FAIL=$((FAIL+1))
  fi
  rm -rf "$FIX"
}

scenario_bun_watchdog () {
  make_fixture
  cat >"$FIX/bin/bun" <<EOF
#!/usr/bin/env bash
echo started > "$FIX/bun.sentinel"
sleep 0.5
exit 42
EOF
  chmod +x "$FIX/bin/bun"

  local rc start_ts end_ts elapsed_ms
  start_ts=$(date +%s%N)
  set +e
  setsid env \
    QOR_TEST_STUB_MODE=prompt \
    NEO4J_HOME="$FIX/neo4j" \
    NEO4J_CONF_DIR="$FIX" \
    NEO4J_BOOT_TIMEOUT=5 \
    NEO4J_LIVENESS_INTERVAL=1 \
    QOR_CRASHLOOP_MAX=99 \
    QOR_CRASHLOOP_FILE="$FIX/qor-crashloop" \
    PATH="$FIX/bin:$PATH" \
    bash "$START" >/dev/null 2>"$FIX/stderr.log"
  rc=$?
  set -e
  end_ts=$(date +%s%N)
  elapsed_ms=$(( (end_ts - start_ts) / 1000000 ))

  local trace_has_msg=no
  grep -qE 'bun pid dead' "$FIX/stderr.log" 2>/dev/null && trace_has_msg=yes

  if [[ $rc -ne 0 && $elapsed_ms -le 3500 && "$trace_has_msg" == "yes" ]]; then
    echo "  [OK] scenario_bun_watchdog (rc=$rc, elapsed=${elapsed_ms}ms, trace=$trace_has_msg)"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] scenario_bun_watchdog: rc=$rc elapsed=${elapsed_ms}ms trace=$trace_has_msg"
    FAIL=$((FAIL+1))
  fi
  rm -rf "$FIX"
}

echo "qor/start.test.sh — 7 scenarios"
scenario_boot_gate_pass
scenario_boot_gate_timeout
scenario_liveness_kill
scenario_crashloop_cooldown
scenario_crashloop_window_reset
scenario_preflight_port_probe
scenario_bun_watchdog

echo ""
echo "Results: ${PASS} pass, ${FAIL} fail"
[[ $FAIL -eq 0 ]] || exit 1
