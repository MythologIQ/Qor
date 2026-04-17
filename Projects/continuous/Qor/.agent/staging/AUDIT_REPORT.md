# AUDIT REPORT — audit-v16-hexawars-scope-2

**Tribunal Date**: 2026-04-17T19:56:00Z
**Target**: `docs/plans/2026-04-17-hexawars-scope-2-depth-expansion.md`
**Blueprint Hash**: `sha256:5fd9c751b527f70d22fb700deb8b705c7363e81f10624ef25e1b5cd75b96d473`
**Risk Grade**: **L2** (architecture change + ranked-competitive write surface)
**Auditor**: The QorLogic Judge
**Supersedes**: `audit-v15-continuum-memory-ipc-v3` (PASS)

---

## VERDICT: ❌ **VETO**

---

### Executive Summary

The blueprint proposes three-phase depth expansion for HexaWars (identity + matchmaking + ranking) with a coherent simple-made-easy decomposition and well-scoped test coverage. However, it fails two of this project's standing Mandatory Guards (v13 and v14 shadow genome entries) by omitting the Razor Budget Summary table and by naming three existing files for modification without stating their current line counts. It further introduces three new runtime modules with no named caller in any phase's affected-files list, and its ranked-competitive write endpoints define no authorization model. These are load-bearing defects in a ranked system whose ledger must be credible; the plan cannot proceed to implementation until remediated.

### Audit Results

#### Pass 1 — Security (L2 Scrutiny)
**Result**: ❌ **FAIL**

- **V4 trigger**: Write endpoints `POST /api/arena/operators`, `POST /api/arena/agent-versions`, `POST /api/arena/tournaments`, `POST /api/arena/tournaments/:id/signup` have no declared authorization model. Who can create an operator — any anonymous HTTP client, or does registration require a signed ticket? Can any operator create a tournament, or is that admin-gated? A ranked-competitive system's ledger credibility depends on answering these.
- No hardcoded credentials. ✅
- No placeholder auth stubs. ✅
- No `// security: disabled`. ✅
- Auth token generation path stated (generated on create, shown once, stored hashed) — ✅ concept — but hash algorithm, iteration count, and enforcement site (middleware vs per-route check) are unspecified.

#### Pass 2 — Ghost UI
**Result**: ✅ PASS

Every zo.space route in Phase 3 connects to a named arena API endpoint. Replay scrubber is a client-side control over server-streamed `match_events` — data path is defined. No "coming soon" or placeholder UI. Tournament signup is API-only for Scope-2 (no UI in this plan), which is a product-scope decision, not a ghost path.

#### Pass 3 — Section 4 Razor
**Result**: ❌ **FAIL**

- **V1 trigger**: No Razor Budget Summary table exists anywhere in the plan. v14 Mandatory Guard: *"The Razor Budget Summary table enumerates every file the plan modifies, not only files it creates."*
- **V2 trigger**: Current line counts for files named for modification are not stated. Actual (verified now): `arena/src/router.ts` = 15L, `arena/src/shared/types.ts` = 60L, `arena/src/server.ts` = 32L. v14 Mandatory Guard: *"Every existing file named for modification has a current-line-count fact stated in the plan (not inferred)."*
- Per-file projected sizes for the ~17 new files are absent. "Pure functions," "single transaction" prose is not a size target.
- No file is at-ceiling today, so V-RAZOR-GUARD-2 (decomposition-before-addition) does not itself fire — but the absence of the budget table means the auditor cannot verify that it won't fire after Phase 3 (router.ts absorbs ~12 new route dispatches across three phases and is modified in every phase).

| Razor Check | Limit | Blueprint States | Status |
|---|---|---|---|
| Max function lines | 40 | not stated per-fn | FAIL |
| Max file lines | 250 | not stated per-file | FAIL |
| Max nesting depth | 3 | not stated | FAIL |
| Nested ternaries | 0 | not stated | FAIL |
| Budget table present | required | absent | FAIL |

#### Pass 4 — Dependency
**Result**: ✅ PASS

- SQLite: Bun has first-party `bun:sqlite`. No new package required. Plan does not explicitly state this — a minor documentation gap but not a dependency violation.
- No hallucinated packages. No packages proposed whose capability is < 10 lines of vanilla code.
- All new logic (ELO, Swiss pairing, knockout, fingerprint normalization, Jaccard similarity) is in-tree, no library pulls.

| Package | Justification | < 10 Lines Vanilla? | Verdict |
|---|---|---|---|
| `bun:sqlite` | Phase-1 persistence | No (full RDBMS) | PASS |
| (no new external deps) | — | — | PASS |

#### Pass 5 — Orphan / Build Path
**Result**: ❌ **FAIL**

- **V3 trigger**: Three new runtime modules have no **named** caller in their phase's affected-files list:

| Proposed File | Declared Role | Named Caller | Status |
|---|---|---|---|
| `arena/src/matchmaking/ladder-loop.ts` | "runs every 30s" | none (server.ts not in affected files) | ORPHAN |
| `arena/src/tournaments/scheduler.ts` | "cron-style check every 60s" | none (server.ts not in affected files) | ORPHAN |
| `arena/src/rank/apply.ts` | "the only place that writes rank" | none — match-completion caller unnamed | ORPHAN |
| `arena/src/persistence/db.ts` | repo wiring | (router handlers, implicitly) | Connected (indirect) |
| `arena/src/persistence/match-store.ts` | match CRUD | router handlers (listed) | Connected |
| `arena/src/identity/*` | identity ops | router handlers (listed) | Connected |
| `arena/src/matchmaking/presence.ts` | WS-presence registry | gateway (named) | Connected |
| `arena/src/matchmaking/pairing.ts` | pure pairing fn | `ladder-loop.ts` (itself orphan) | Transitive orphan |
| `arena/src/tournaments/swiss.ts` | pure pairing fn | `runner.ts` | Connected |
| `arena/src/tournaments/knockout.ts` | pure pairing fn | `runner.ts` | Connected |
| `arena/src/tournaments/runner.ts` | orchestrator | `scheduler.ts` (itself orphan) | Transitive orphan |

v13 Mandatory Guard: *"Every new runtime module has at least one **named** caller in the plan's affected-files list."* "Implicit server bootstrap" does not satisfy.

#### Pass 6 — Macro-Level Architecture
**Result**: ✅ PASS (with note)

- Layering is clean and unidirectional: zo.space UI → arena HTTP/WS → repo → SQLite. No reverse imports implied.
- Shared types centralized in `arena/src/shared/types.ts`. ✅
- No cyclic dependency graph implied by the import topology.
- One-ELO-stream discipline with origin-tagged matches is a genuine simple-made-easy win (single rank writer).
- Fingerprint is pure and deterministic. ✅
- **Note (not a VETO)**: cross-cutting auth is not centralized — Pass 1's finding means there is no named auth middleware or per-route check pattern. Pass 6 would flag this if the plan proposed per-route ad-hoc auth; since auth is entirely unspecified, the failure lives in Pass 1.

---

### Violations Found

| ID | Category | Location | Description |
|---|---|---|---|
| **V1** | V-RAZOR-GUARD-3 | Plan-wide | No Razor Budget Summary table. Mandatory per v14 shadow genome guard. |
| **V2** | V-RAZOR-GUARD-1 | Phase 1/2/3 modify of `arena/src/router.ts`; Phase 1 modify of `arena/src/shared/types.ts`; Phase 2 modify of `arena/src/persistence/schema.sql` | Current line counts for files named for modification are not stated in plan. Actual verified: router.ts=15L, shared/types.ts=60L, server.ts=32L. Mandatory per v14 shadow genome guard. |
| **V3** | V-ORPHAN (v13) | Phase 2 `matchmaking/ladder-loop.ts`, `tournaments/scheduler.ts`; Phase 3 `rank/apply.ts` | New runtime modules have no named caller in affected-files list. v13 Mandatory Guard requires named caller. Transitive: `pairing.ts` and `runner.ts` are reached only through orphaned modules. |
| **V4** | V-SECURITY-L2 | Phase 1 routes `POST /api/arena/operators`, `POST /api/arena/agent-versions`; Phase 2 routes `POST /api/arena/tournaments`, `POST /api/arena/tournaments/:id/signup` | Write endpoints on a ranked-competitive system define no authorization model. Who can register, who can create tournaments, how operator-token-authenticated requests are enforced (middleware vs per-route) is unspecified. Hash algorithm for stored auth tokens is unspecified. |

### Required Remediation (to re-submit for PASS)

1. **Add Razor Budget Summary table** enumerating every file the plan creates or modifies, with current-line-count (for modifies; 0 for creates) and projected-size-at-phase-exit. Include at minimum:
   - `arena/src/router.ts` — current 15L, projected ≤ X L after Phase 3 additions of ~12 route dispatches.
   - `arena/src/shared/types.ts` — current 60L, projected ≤ X L after new type exports.
   - `arena/src/server.ts` — current 32L, projected ≤ X L after mounting loops (see V3 remediation).
   - `arena/src/persistence/schema.sql` — 0L Phase 1, projected ≤ X L after Phase 2 tournament tables.
   - Each of the ~17 new files with a projected ≤ X L target under the 250L ceiling.

2. **State current line counts in-line in each Phase's Affected Files section** for every modified file, not only in the summary table.

3. **Name the caller of every orphaned module explicitly:**
   - Add `arena/src/server.ts` to Phase-2 affected files and spec the modification: "mount ladder loop via `startLadderLoop(registry, store)` at boot; mount tournament scheduler via `startTournamentScheduler(store)` at boot." State current 32L and projected size.
   - Add the match-completion caller for `rank/apply.ts`. Either `arena/src/engine/match.ts` or the ladder/tournament runner must name `applyMatchResult(matchRecord)` as its post-match hook — list that file in Phase-3 affected files with its modification described.
   - `pairing.ts` becomes non-orphan once `ladder-loop.ts` has a named caller. `runner.ts` becomes non-orphan once `scheduler.ts` does.

4. **Specify the authorization model for every write endpoint.** At minimum:
   - Operator registration: either (a) open with aggressive rate-limit and handle-reservation policy, (b) admin-bootstrap only with signed invite tickets, or (c) captcha/challenge-gated. Pick one and state the enforcement site (middleware name, route-level check, or external gate).
   - Agent-version registration: must require the operator's auth token; specify the header (`Authorization: Bearer <token>`) and the verification module (e.g., `identity/auth-middleware.ts`).
   - Tournament creation: admin-only vs operator-self-service. If admin-only, state how admins are designated (env var handle list, separate table, etc.).
   - Tournament signup: operator-token authenticated; specify enforcement site.
   - Auth token hash: state algorithm (e.g., bcrypt cost=12, argon2id default params, or sha256 with per-row salt). SHA256-without-salt is unacceptable for L2.
   - List `arena/src/identity/auth-middleware.ts` (or equivalent) as a new Phase-1 file if the enforcement site is middleware.

### Verdict Hash

This report sealed pre-write; chain hash computed by ledger entry.

---
_This verdict is binding._
