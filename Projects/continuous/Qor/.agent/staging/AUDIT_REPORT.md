# Gate Tribunal — Phase 3 Cutover v5

**Plan:** `docs/plans/2026-04-20-qor-phase3-cutover-v5.md`
**Content hash:** `b929b2314acc5ad7586ac2ee537e0f2ef228943414909fdba8a23219ec5cac1d`
**Prior chain (v4 VETO):** `5b58f8a920f1a5ef8407a2987d5860dd02a84fe4e4eca5c82e88979118dd082f`
**Chain hash:** `b6792654d0fe59712fc48d09b3d87a08513360c6b75ddd0d2495bbfab40cfd1e`
**Risk Grade:** L2 (service infra — lifecycle, credentials, atomic swap)
**Verdict:** ✅ **PASS**

---

## Audit Passes

### Security (L3)

- No placeholder auth. Inline `NEO4J_PASS=victor-memory-dev` is documented dev-grade secret, accepted under Q1=A.
- v5 delta is single-line endpoint swap; no new secrets, no new auth surface.
- No bypassed checks; no mock auth returns.

**PASS.**

### Ghost UI

N/A — plan introduces no UI.

**PASS.**

### Section 4 Razor

| Check | Limit | v5 Delta | Status |
|---|---|---|---|
| Max function lines | 40 | single-line URL change | OK |
| Max file lines | 250 | canary script unchanged shell | OK |
| Max nesting depth | 3 | unchanged | OK |
| Nested ternaries | 0 | 0 | OK |

**PASS.**

### Dependency

No new dependencies introduced by v5.

**PASS.**

### Macro-Level Architecture

- Module boundaries clean (canary is bash ops script).
- No cyclic deps; layering intact.
- `/api/continuum/stats` is canonical Neo4j-read health endpoint (single source of truth).
- `getDriver()` is sole driver owner (verified Phase 1 sealed).

**PASS.**

### Build-Path / Orphan

| Proposed File | Entry Connection | Status |
|---|---|---|
| `qor/start.sh` | Zo `qor` service entrypoint | Connected |
| `qor/start.test.sh` | `bash qor/start.test.sh` (Phase 1 SC §1) | Connected |
| `qor/qor-live-canary.sh` | `bash qor/qor-live-canary.sh` (Phase 2 SC §2, runbook) | Connected |
| `AGENTS.md` (root + project) | Workspace memory | Connected |
| `docs/SYSTEM_STATE.md` | Runbook reference | Connected |
| `docs/plans/…-v5.md` | Governance blueprint | Connected |

**N1 closure verified against source:**

- `/api/continuum/stats` IS registered at `continuum/src/service/server.ts:72-74` inside `handleGraphRoutes`.
- `handleGraphRoutes` IS wired to `Bun.serve` at server.ts:138-143 via `route(req, handleGraphRoutes, handleLayerRoutes)`.
- `getGraphStats()` at `continuum/src/service/graph-api.ts:72-80` executes two Cypher queries via `queryGraph()` which opens `getDriver().session()`.
- Full chain confirmed: `/api/continuum/stats` → `getGraphStats()` → `queryGraph()` → `getDriver().session().run(cypher)` → Neo4j Bolt 7687.
- HTTP 200 with JSON body discriminates four concerns: router wiring + NEO4J_URI/USER/PASS resolution + Bolt handshake + Cypher read. Any NEO4J_* misconfig collapses assertion to 500 or connection error.

**PASS.**

---

## Closure Matrix

| Finding | Source | v5 Remediation | Status |
|---|---|---|---|
| N1 — orphan `/api/continuum/memory?limit=1` | v4 `5b58f8a9…` | Swapped to registered `/api/continuum/stats` | ✅ CLOSED |
| T1r — orphan TS canary path | v3 (closed v4) | Bash canary `qor/qor-live-canary.sh` | ✅ INHERITED |
| X1 — config-layer MCP assertion | v3 (closed v4) | Runbook manual `list_user_services` step | ✅ INHERITED |
| T1 — TS/Bash mismatch | v2 (closed v3) | Extend bash harness in-place | ✅ INHERITED |
| C2 — vacuous IPC 404 | v2 (closed v3) | Socket absence probes (assertions 5+6) | ✅ INHERITED |
| R1/R2/R3/R4 runtime proofs | v1 VETO | Bash canary assertions 1–6 | ✅ INHERITED |

---

## Next Action

`prompt Skills/qor-implement/SKILL.md` — Phase 1 (start.sh hardening + harness scenarios 4–7) then Phase 2 (atomic service swap + canary). Phase 1 is prerequisite for Phase 2's crashloop/watchdog guarantees.

**Tribunal status:** GATE PASSED. Implementation unlocked.
