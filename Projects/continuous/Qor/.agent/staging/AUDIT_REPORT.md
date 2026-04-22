# Gate Tribunal — Phase 3 Cutover v5.1 §Phase 2

**Plan:** `docs/plans/2026-04-21-qor-phase3-cutover-v5.1.md` §Phase 2 (atomic service swap + canary, D1 remediation)
**Content hash:** `33deccdfc5713b9fdc45a3be39694a967e257b3923f350d30d0875dbc7dbbb1a`
**Prior chain (v5 VETO):** `b19d4da856aeee32788c809600296b980af5661f5a9f0c57fd52867529bef531`
**Chain hash:** `cc6f127eacd0dccd879d0e0de04f90f7127b0d1284c6b59b4f65960e0e812ee2`
**Verdict:** ✅ **PASS**
**Risk Grade:** L2 (operational service cutover)

## Scope

v5.1 delta vs. v5: **single-line swap** of canary assertion 4 Bolt probe primitive — `nc -z 127.0.0.1 7687` → `(exec 3<>/dev/tcp/127.0.0.1/7687) 2>/dev/null && exec 3<&- 3>&-`. All other v5 design (atomic service swap, env_vars, IPC deferral, rollback, MCP runbook step, canary assertions 1–3, 5–6) inherited verbatim under v5's PASS chain `b6792654…`. Phase 1 start.sh hardening sealed under v5 at `e15f8b67…` — not re-audited.

## Live-State Reconnaissance

| Probe | Result |
|---|---|
| `bash --version` | GNU bash 5.2.15 |
| `bash --help \| grep disable-net-redirections` | absent (net-redirections compiled in) |
| `(exec 3<>/dev/tcp/127.0.0.1/3088) 2>/dev/null` | succeeds on bound port |
| `(exec 3<>/dev/tcp/127.0.0.1/65535) 2>/dev/null` | fails (connection refused) |
| `(exec 3<>/dev/tcp/127.0.0.1/7687) 2>/dev/null` | fails (Neo4j not yet running — expected pre-cutover) |
| Subshell fd isolation verified | fd 3 not leaked to parent (`ls /proc/$$/fd/ \| grep ' 3 '` empty) |
| `start.sh` uses same idiom | 3 call sites (lines 40, 49, 70) sealed at `e15f8b67…` |
| `qor/qor-live-canary.sh` exists? | No — implementation artifact for Phase 2 |

Primitive is provably discriminating, leak-free, and already validated under Phase 1 seal.

## Adversarial Audit

### Security Audit
- [x] No placeholder auth logic. *(v5.1 changes bash idiom only.)*
- [x] No new hardcoded credentials. *(NEO4J_PASS inline inherited from v5 PASS chain.)*
- [x] No bypassed security checks.
- [x] No mock authentication returns.
- [x] No security disablement comments.

**Verdict: PASS**

### Ghost UI Audit
- [x] N/A — bash canary has no UI surface.

**Verdict: PASS**

### Simplicity Razor Audit

| Check | Limit | v5.1 Proposes | Status |
|---|---|---|---|
| Max function lines | 40 | Canary unchanged structure; single assertion line | OK |
| Max file lines | 250 | `qor-live-canary.sh` ~60L estimated | OK |
| Max nesting depth | 3 | Flat bash asserts | OK |
| Nested ternaries | 0 | 0 | OK |

**Verdict: PASS**

### Dependency Audit

| Package | Justification | <10 Lines Vanilla? | Verdict |
|---|---|---|---|
| `nc` (netcat) | **REMOVED** in v5.1 | N/A | PASS (regression closed) |
| `bash` `/dev/tcp` | Kernel-level non-blocking TCP connect, bash builtin | N/A (builtin, 0 lines) | PASS |

v5.1 is strictly dependency-reducing. Primitive already used 3× in Phase 1 sealed `start.sh`.

**Verdict: PASS**

### Macro-Level Architecture Audit
- [x] Module boundaries unchanged from v5.
- [x] No cyclic dependencies introduced.
- [x] Layering direction preserved.
- [x] No cross-cutting concern drift.
- [x] Primitive choice consistent with Phase 1 (single source of truth for Bolt probe idiom in this repo).

**Verdict: PASS**

### Build Path / Orphan Audit

| Proposed File | Entry Point Connection | Status |
|---|---|---|
| `qor/qor-live-canary.sh` | `bash qor/qor-live-canary.sh` from operational runbook (same invocation pattern as v5) | Connected |

**Verdict: PASS**

### Residual Sweep (v5.1-specific adversarial probes)

1. **fd-leak claim** — plan asserts `exec 3<&- 3>&-` "closes both halves of fd 3 cleanly after a successful probe so the canary does not leak descriptors." Empirical verification: subshell-scoped `/dev/tcp` does NOT propagate fd 3 to parent, so the parent-shell close is a no-op on an unopened fd (exit 0). Code is functionally correct. Plan rationale is slightly over-stated (cleanup is redundant, not load-bearing), but this is a cosmetic documentation issue — not a functional defect. **No VETO.**

2. **Half-open / TIME_WAIT masking** — acknowledged in v5.1 Risk Ledger; mitigated by assertion 3 (`/api/continuum/stats` 200 requires live Cypher round-trip, which would fail before assertion 4 even runs if Bolt is half-open). Defense-in-depth preserved.

3. **bash `--disable-net-redirections` future regression** — acknowledged in v5.1 Risk Ledger; Phase 1 `start.sh` already depends on this feature across 3 call sites, so regression surfaces pre-canary at start-sh seal level. Fail-fast domain matches.

4. **Idiom consistency with Phase 1** — plan's primitive exactly matches Phase 1 idiom (verified via `grep`). Zero cognitive drift.

## Verdict Rationale

v5.1 closes D1 with a minimal, in-repo-validated, dependency-reducing change. All prior v5 PASS findings hold. Live-state recon confirms the primitive works on this host. No new findings surface.

**Verdict: ✅ PASS.**

## Next Action

`/qor-implement` — Phase 2 of v5.1. Create `qor/qor-live-canary.sh` with 6 assertions using the bash `/dev/tcp` idiom for assertion 4. Execute cutover sequence (delete stale services, register `qor`), run canary, record MCP config-layer env_var assertions in Phase 2 seal evidence.
