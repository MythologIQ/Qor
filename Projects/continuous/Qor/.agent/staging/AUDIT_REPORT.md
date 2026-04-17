# AUDIT REPORT — audit-v18-hexawars-scope-2-plan-a-v2

**Tribunal Date**: 2026-04-17T23:50:00Z
**Target**: `docs/plans/2026-04-17-hexawars-scope-2-plan-a-v2-identity-substrate.md`
**Blueprint Hash**: `sha256:hexawars-scope-2-plan-a-v2`
**Risk Grade**: **L2** (persistence + identity + auth token issuance + rate-limit)
**Auditor**: The QorLogic Judge
**Supersedes**: `audit-v17-hexawars-scope-2-plan-a` (VETO)

---

## VERDICT: ✅ **PASS**

---

### Executive Summary

Plan A v2 precisely remediates v17's two security violations without disturbing the Razor, Orphan, Ghost-UI, Dependency, or Macro-Architecture surfaces that v17 already passed. V5 is closed by declaring "who can invoke" for `POST /api/arena/operators` (open + rate-limit + handle-reservation) and naming the enforcement site (`arena/src/identity/rate-limit.ts`). V6 is closed by upgrading stored-token protection to `sha256(salt ‖ secret)` with a 16-byte per-row salt and an O(1) indexed `token_id` prefix lookup, verified via `crypto.timingSafeEqual` — firmly inside v16 Mandatory Guard's acceptable set `{bcrypt, argon2id, sha256+salt}`. The plan additionally introduces a Security Surface Summary table enumerating every endpoint's enforcement site, invocation stance, and token-at-rest scheme, and promotes `model_id` to a first-class NOT NULL CHECK-constrained column on `agent_versions` (closing a discretionary-data gap: no incognito agents). Current LOC independently verified (`router.ts=15L`, `server.ts=32L`, `shared/types.ts=60L`). Per-phase LOC arithmetic checks (router Δ 5+35+25=65, types Δ 20+15+5=40). All six tribunal passes clear.

### Audit Results

#### Pass 1 — Security (L2 Scrutiny)
**Result**: ✅ **PASS**

Bound guard (SHADOW_GENOME v16, 2026-04-17T19:56:00Z):
> *"Every write endpoint on a system that produces a public ranking has a declared authorization enforcement site, a declared auth-token hash algorithm, and a declared answer to 'who can invoke this'."*

Bound guard (SHADOW_GENOME v17, 2026-04-17T23:15:00Z): Open-Question defaults must not fall outside `{bcrypt, argon2id, sha256+salt}`; identity-issuance endpoints must name enforcement site + stance; salted-hash schemes must specify salt column, length, and lookup pattern.

| v16/v17 Guard Clause | v2 Satisfaction |
|---|---|
| Enforcement site for every write endpoint | `rate-limit.ts` (operators POST); per-route `getOperatorByToken()` (agent-versions POST) — both explicitly named in Security Surface Summary |
| Auth-token hash algorithm declared | `sha256(salt ‖ secret)`, 16-byte per-row salt — inside v16 acceptable set |
| "Who can invoke" stance declared | operators: open + rate-limit + handle-reservation; agent-versions: operator-token-authenticated |
| Salt column in schema DDL | `operators.token_salt BLOB NOT NULL`, explicitly added in Phase 1 schema.sql |
| Salt length | 16 bytes (`crypto.randomBytes(16)`) |
| Lookup pattern | O(1) indexed on `operators.token_id` (8-byte random prefix), then `crypto.timingSafeEqual` on hashed secret |
| Open-Question defaults safe | Q2 v2 is about rate-limit store durability, NOT auth-storage; auth-storage is locked (not an open question) |
| New identity-issuance modules listed in Razor Budget | `rate-limit.ts` added as Phase-2 NEW file, 55L, in budget table |

- No hardcoded credentials. ✅
- No placeholder auth stubs. ✅
- No `// security: disabled`. ✅
- No mock authentication returns. ✅
- Handle-reservation normalization (NFKC + lowercase + strip zero-width/control + unique index on `handle_normalized`) is a genuine defense in addition to `handle` uniqueness. ✅
- `model_id` is schema-enforced NOT NULL with `CHECK(LENGTH(model_id) BETWEEN 1 AND 128)` — registration-without-model cannot reach persistence. ✅

Note: the XFF-trust posture for rate-limit keying is documented (proxy-set header with remoteAddr fallback and `unknown` conservative bucket). Hardening the trust path (e.g., allowlist of upstream proxy IPs, `CF-Connecting-IP`, or TCP-remote-only) is an implementation tuning concern for `rate-limit.ts`, not a guard-level gap. No VETO trigger.

#### Pass 2 — Ghost UI
**Result**: ✅ **PASS**

Plan A v2 introduces **no UI**. All routes are HTTP/JSON; UI is explicitly deferred to Plan B/C.

#### Pass 3 — Section 4 Razor
**Result**: ✅ **PASS**

| Check | Limit | Blueprint Proposes | Status |
|---|---|---|---|
| Max function lines | 40 | 32 (highest stated per-file cap: `operator.ts`) | OK |
| Max file lines | 250 | 130 (largest: `match-store.ts`, 52% of ceiling) | OK |
| Max nesting depth | 3 | 2 (highest stated) | OK |
| Nested ternaries | 0 | 0 (not used) | OK |
| Budget table present | required | 10 rows, current+Δ+final+limits columns | OK |

Current-LOC verification (Judge independently measured):

| File | Plan Claims | Measured | Match? |
|---|---:|---:|:---:|
| `arena/src/router.ts` | 15 | 15 | ✅ |
| `arena/src/server.ts` | 32 | 32 | ✅ |
| `arena/src/shared/types.ts` | 60 | 60 | ✅ |

Per-phase arithmetic verification:

| File | Phase 1 Δ | Phase 2 Δ | Phase 3 Δ | Total | Plan Total | Match? |
|---|---:|---:|---:|---:|---:|:---:|
| `router.ts` | +5 | +35 | +25 | +65 | +65 | ✅ |
| `shared/types.ts` | +20 | +15 | +5 | +40 | +40 | ✅ |
| `server.ts` | +6 | 0 | 0 | +6 | +6 | ✅ |

v14 + v17 Mandatory Razor Guards satisfied.

#### Pass 4 — Dependency
**Result**: ✅ **PASS**

| Package | Justification | <10 Lines Vanilla? | Verdict |
|---|---|---|---|
| `bun:sqlite` | Phase-1 persistence; Bun first-party, no npm dep | No (full RDBMS) | PASS |
| `node:crypto` | `randomBytes`, `createHash('sha256')`, `timingSafeEqual` | Node built-in | PASS |
| (no new external deps) | rate-limit is in-memory `Map`; token hash is `node:crypto` | — | PASS |

Plan v2 explicitly declares `bun:sqlite` as the driver (closing the v17 "minor documentation gap"). No hallucinated packages. No `better-sqlite3`, no ORM, no JWT, no password-hash library, no rate-limit framework. The in-memory rate-limit bucket map is under 60 lines — well inside the `<10-lines-vanilla` heuristic's spirit for "don't import what you can inline."

#### Pass 5 — Orphan / Build Path
**Result**: ✅ **PASS**

| Proposed File | Entry Point Connection | Status |
|---|---|:---:|
| `arena/src/persistence/db.ts` | `server.ts` boot; `match-store.ts`; `operator.ts` (named) | Connected |
| `arena/src/persistence/schema.sql` | `db.ts:initDb` (named) | Connected |
| `arena/src/persistence/match-store.ts` | `router.ts` match routes (named) | Connected |
| `arena/src/identity/operator.ts` | `router.ts` operator + agent-version routes (named) | Connected |
| `arena/src/identity/fingerprint.ts` | `router.ts` agent-version handler (named) | Connected |
| `arena/src/identity/similarity.ts` | `router.ts` agent-version handler (named) | Connected |
| `arena/src/identity/rate-limit.ts` | `router.ts` POST `/api/arena/operators` handler (named) | Connected |
| `arena/src/router.ts` (MOD) | `server.ts:mount(app, db)` (named) | Connected |
| `arena/src/server.ts` (MOD) | entry point; listed in Phase-1 affected files | Connected |
| `arena/src/shared/types.ts` (MOD) | imported by all new files (named) | Connected |

No background/scheduled modules in Plan A v2 (those remain deferred to Plan B). v13 + v16 + v17 Mandatory Orphan Guards all satisfied.

#### Pass 6 — Macro-Level Architecture
**Result**: ✅ **PASS**

- [x] Clear module boundaries: `persistence/` owns DB + schema; `identity/` owns operators + fingerprint + similarity + rate-limit; `shared/types.ts` is sole shared-types site.
- [x] No cyclic dependencies: `identity/rate-limit.ts` imports nothing from `persistence/` (memory-only); `identity/operator.ts` imports `persistence/db.ts`; `persistence/` imports nothing from `identity/`.
- [x] Layering direction enforced: `server.ts` → `router.ts` → (`identity/*` | `persistence/*`) → `db.ts`. Unidirectional.
- [x] Single source of truth for shared types (`shared/types.ts`).
- [x] Cross-cutting concerns: rate-limit, auth, fingerprint, similarity each have a single named home module. Auth remains inline per-route (YAGNI, documented).
- [x] No duplicated domain logic: `fingerprint()` pure, single site; `similarity()` pure, single site; `RateLimiter.check()` single site; DB instance single, closure-injected.
- [x] Build path is intentional: single entry `server.ts`, closure-injected `db`, single `mount(app, db)` call.

Macro-architectural simplicity preserved from v1. Addition of `rate-limit.ts` to the `identity/` domain is the correct co-location (identity owns both the issuance gate and the issuance primitive).

---

### Violations Found

**None.** All six passes clear. v16 and v17 Mandatory Guards satisfied in full.

### Remediation

N/A — PASS.

### Authorizations

- Implementation may proceed on Plan A v2.
- Plan B drafting **MAY begin in parallel** once Plan A v2 Phase 1 is sealed, since Plan B's substrate dependency is Phase 1's schema + db.ts. Plan B audit will treat v2's persistence surface as fixed.
- Phase gate: each phase must seal via `/qor-substantiate` before the next phase's builder tasks are queued.

### Verdict Hash

This report sealed pre-write; chain hash computed by ledger entry.

**Content Hash**: `sha256:audit-v18-hexawars-scope-2-plan-a-v2`
**Previous Chain Hash**: `sha256:29ec432c102fa055cdb6bc77a3ee2b818f8e1800ac77bad172b20a728efd893f` (v17 VETO)

---
_This verdict is binding._
