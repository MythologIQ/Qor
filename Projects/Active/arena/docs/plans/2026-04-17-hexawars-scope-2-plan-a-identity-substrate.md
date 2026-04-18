# Plan A: HexaWars Scope-2 — Identity Substrate

**Plan ID**: `hexawars-scope-2-plan-a-v1`
**Created**: 2026-04-17T20:40:00-04:00
**Planner**: Claude Opus 4.6 (interactive, qor-plan skill)
**Predecessor**: `2026-04-17-hexawars-scope-2-depth-expansion.md` (vetoed v16; this plan splits it)
**Successor**: `2026-04-17-hexawars-scope-2-plan-b-matchmaking-rank.md` (to be written after Plan A seals)
**Governance**: QorLogic S.H.I.E.L.D. cycle; advisory gates; META_LEDGER sealed
**v14 Mandatory Razor Guard**: see Razor Budget Summary at top of this plan

---

## Razor Budget Summary

All limits per QoreLogic Section-4 Razor (max function = 40L, max file = 250L, max nesting = 3, no nested ternaries).

| File | Type | Current LOC | Δ LOC | Final LOC | Max File | Max Fn | Max Depth | Status |
|------|------|------------:|------:|----------:|---------:|-------:|----------:|--------|
| `arena/src/persistence/db.ts` | NEW | 0 | +75 | 75 | 250 | 30 | 2 | OK |
| `arena/src/persistence/schema.sql` | NEW | 0 | +60 | 60 | 250 | n/a | n/a | OK |
| `arena/src/persistence/match-store.ts` | NEW | 0 | +130 | 130 | 250 | 30 | 2 | OK |
| `arena/src/identity/operator.ts` | NEW | 0 | +90 | 90 | 250 | 28 | 2 | OK |
| `arena/src/identity/fingerprint.ts` | NEW | 0 | +85 | 85 | 250 | 25 | 2 | OK |
| `arena/src/identity/similarity.ts` | NEW | 0 | +80 | 80 | 250 | 30 | 2 | OK |
| `arena/src/router.ts` | MOD | 15 | +60 | 75 | 250 | 12 | 2 | OK |
| `arena/src/shared/types.ts` | MOD | 60 | +35 | 95 | 250 | n/a | n/a | OK |
| `arena/src/server.ts` | MOD | 32 | +6 | 38 | 250 | 10 | 2 | OK |

**Razor Verdict (self-check)**: All files under file-LOC, fn-LOC, and depth limits. No nested ternaries. No file projected to exceed 60% of the 250-line ceiling. Estimates derived from operation count + interface surface; refined during implementation.

---

## Intent

Build the **durable substrate** the rest of Scope-2 will sit on: persistent operator identities, agent-version records, match records, replay events, fingerprint computation, similarity scoring. **No matchmaking. No ranking. No tournaments. No spectator UI.** Plan A is "we can persist the truth." Plan B is "we pair, score, and surface it."

This split is a direct response to v16's audit veto — the original plan complected persistence (a value-oriented data layer) with lifecycle (loops, schedulers, presence). Plan A is values-only: pure functions over data, repos over a single SQLite file, all wired through `router.ts` to `server.ts`. Zero background loops introduced in this plan.

## Decisions Inherited from Scope-2 Dialogue

| # | Decision | Source |
|---|----------|--------|
| 1 | Goal = depth expansion (not new games) | Scope-2 Q2 → B |
| 2 | External-only BYOA (arena is referee, not host) | Scope-2 Q3 → A |
| 3 | One persistent operator identity, one ELO; agent fingerprint recorded per match | Scope-2 Q4 → D |
| 4 | Fingerprint = `sha256(normalize(code) ‖ normalize(config) ‖ model_id ‖ normalize(prompt_template))`; similarity is advisory-only | Scope-2 Q4 follow-up |
| 5 | Persistence engine = SQLite, file-backed at `.arena/state.db`, WAL mode | Scope-2 Q1 (default lock) |

## Open Questions

- **Q1**: Fingerprint normalization — strip *all* comments and collapse *all* whitespace, or preserve string literals verbatim? *(Plan assumes: strip line/block comments, collapse runs of whitespace to single space, preserve string literal contents byte-exact. Identifier renames are NOT normalized away — that's similarity's job.)*
- **Q2**: Auth token format — opaque random 32-byte URL-safe, or signed JWT with operator id? *(Plan assumes opaque random; stored as `sha256(token)` server-side; no JWT machinery introduced in Plan A.)*
- **Q3**: Similarity n-gram size — 5-gram, 7-gram, or both? *(Plan assumes 5-gram only for v1; 7-gram is a Plan-C tuning candidate.)*

---

## Phase 1 — Persistence Skeleton

**Goal**: A SQLite file exists, has the v1 schema applied idempotently, and can be opened by a typed repo. No domain logic yet.

### Affected Files

- `arena/src/persistence/db.ts` (NEW, 75 LOC) — exports `openDb(path?: string): Database` and `initDb(db: Database): void`. `initDb` reads `schema.sql` and applies it inside a transaction; safe to re-run. WAL mode enabled. **Caller**: `arena/src/server.ts` (boot path), `arena/src/persistence/match-store.ts`, `arena/src/identity/operator.ts`.
- `arena/src/persistence/schema.sql` (NEW, 60 LOC) — DDL for `operators`, `agent_versions`, `matches`, `match_events`. Foreign keys `ON DELETE RESTRICT`. Indexes on `operators.handle` (unique), `agent_versions.operator_id`, `matches.created_at`, `match_events.match_id`. **Caller**: read by `db.ts:initDb`.
- `arena/src/server.ts` (MOD, +6 LOC) — import `openDb`/`initDb`; call once at boot before `mount(app)`; pass `db` instance into `mount` so router handlers receive it via closure.
- `arena/src/router.ts` (MOD, +5 LOC for signature change) — accept `db: Database` parameter; expose `db` to handlers added in Phase 2/3 of this plan.
- `arena/src/shared/types.ts` (MOD, +20 LOC) — add interfaces: `Operator`, `AgentVersion`, `MatchRecord`, `MatchEvent`, `Fingerprint` (branded string).

### Changes

- One DB instance per process, initialized at boot. No singletons; passed via closure into the router. This is the simplest dependency injection — values, not globals.
- `schema.sql` is the single source of truth for table shape. No ORM, no migrations framework. Schema evolution = new SQL file with a version number; out of scope for Plan A.
- `initDb` is idempotent: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. No destructive DDL ever runs at boot.

### Unit Tests

- `arena/tests/persistence/db.test.ts` — `openDb(":memory:")` returns a usable handle; `initDb` is idempotent (two calls produce identical schema); WAL mode is enabled on file-backed DBs; schema matches expected DDL via `PRAGMA table_info`.
- `arena/tests/persistence/schema.test.ts` — every foreign key has matching parent table; every declared index resolves; no `WITHOUT ROWID` tables (kept simple for v1).

### Phase 1 Exit Criteria

- `bun test arena/tests/persistence/` green.
- Booting the arena service creates `.arena/state.db` if absent; restart leaves it intact.
- `sqlite3 .arena/state.db ".schema"` lists exactly the four Phase-1 tables.

---

## Phase 2 — Identity & Fingerprint

**Goal**: Operators can be created, authenticated, and have agent versions registered. Each agent version carries a deterministic fingerprint and an advisory similarity score against existing fingerprints.

### Affected Files

- `arena/src/identity/operator.ts` (NEW, 90 LOC) — exports `createOperator(db, handle): { operator, token }`, `getOperatorByHandle(db, handle)`, `getOperatorByTokenHash(db, hash)`, `rotateToken(db, operatorId)`. Token = 32 bytes from `crypto.randomBytes`, hex-encoded; stored as `sha256(token)`. **Caller**: `arena/src/router.ts` operator routes.
- `arena/src/identity/fingerprint.ts` (NEW, 85 LOC) — exports `fingerprint(input: AgentBuildInput): Fingerprint` (pure). Internal helpers: `normalizeCode`, `normalizeConfig`, `normalizePromptTemplate`, `digest`. Normalization spec is documented at top of file; rules listed in Open Question Q1. **Caller**: `arena/src/identity/operator.ts` (when registering agent version), `arena/src/router.ts` (POST agent-version handler).
- `arena/src/identity/similarity.ts` (NEW, 80 LOC) — exports `similarity(a: NormalizedTokens, b: NormalizedTokens): number` (5-gram Jaccard, 0..1) and `flagAgainst(db, fingerprint, normalizedTokens, threshold = 0.85): SimilarityFlag`. `flagAgainst` queries existing agent versions, scores, returns up to top-5 neighbors above threshold without modifying state. **Caller**: `arena/src/router.ts` (POST agent-version handler invokes after fingerprint).
- `arena/src/shared/types.ts` (MOD, +15 LOC) — add `AgentBuildInput`, `NormalizedTokens` (branded), `SimilarityFlag`, `OperatorAuth`.
- `arena/src/router.ts` (MOD, +30 LOC) — add `POST /api/arena/operators` (handle → `{ operator, token }`, token returned ONCE), `POST /api/arena/agent-versions` (auth-bearer token → fingerprint + similarity flags returned, persisted to DB).

### Changes

- Fingerprint is a **pure function over normalized inputs**. No I/O, no time, no randomness inside `fingerprint()`. This is the central value of Plan A: same inputs → same hex forever.
- Normalization is intentionally lossy in known, documented ways. The spec lives in `fingerprint.ts` itself so a future scheme version is observable in a diff.
- Similarity is advisory: `flagAgainst` reads neighbors but never writes. Persisting flags to `agent_versions.similarity_flags_json` is the router handler's job, after a fingerprint write succeeds. This keeps similarity itself a pure function over inputs.
- Auth is bearer-token middleware-free for Plan A: handlers parse the `Authorization: Bearer …` header inline using `getOperatorByTokenHash`. Middleware abstraction is YAGNI until Plan B introduces more authed routes.

### Unit Tests

- `arena/tests/identity/operator.test.ts` — create + get-by-handle roundtrip; duplicate handle rejected; token returned once and is unrecoverable from DB; `getOperatorByTokenHash` finds operator by raw token (after hashing); `rotateToken` invalidates the prior token.
- `arena/tests/identity/fingerprint.test.ts` — determinism (10 iterations same input → same hex); whitespace-only diff → identical fingerprint; comment-only diff → identical fingerprint; one-character identifier rename → DIFFERENT fingerprint (similarity catches the near-dup, not fingerprint); model_id change → different fingerprint.
- `arena/tests/identity/similarity.test.ts` — `similarity(x, x) === 1`; `similarity(disjoint_a, disjoint_b) === 0`; renamed-identifier fixture (real-world plagiarism shape) ≥ 0.85; unrelated agents < 0.30 on a 20-agent corpus.

### Phase 2 Exit Criteria

- `bun test arena/tests/identity/` green.
- Manual curl: `POST /api/arena/operators {handle}` returns `{operator, token}` once; second `POST` with same handle 409s; `POST /api/arena/agent-versions` with bearer token writes a row and returns `{fingerprint, similarity_flags}`.

---

## Phase 3 — Match Records & Replay Substrate

**Goal**: A match record (no matchmaking yet) and its event stream can be persisted and read back. This is the storage side of replay; the streaming API and spectator UI are Plan-B/Plan-C concerns.

### Affected Files

- `arena/src/persistence/match-store.ts` (NEW, 130 LOC) — exports `saveMatch(db, record: MatchRecord): void`, `appendEvents(db, matchId, events: MatchEvent[]): void`, `getMatch(db, id): MatchRecord | null`, `listMatchesByOperator(db, operatorId, limit = 50): MatchRecord[]`, `streamEvents(db, matchId): IterableIterator<MatchEvent>`. All writes wrapped in `db.transaction(...)`. **Caller**: `arena/src/router.ts` (match read routes); a synthetic write helper in tests; Plan B's runners.
- `arena/src/shared/types.ts` (MOD, no LOC delta — types added in Phase 2 already cover this) — re-exports for ergonomics.
- `arena/src/router.ts` (MOD, +25 LOC) — add `GET /api/arena/matches/:id` (returns record + counts, public), `GET /api/arena/matches/:id/events` (returns full event stream as JSON array, public for replay), `GET /api/arena/operators/:handle/matches` (last-50 by recency, public).
- `arena/src/server.ts` (no further change beyond Phase 1) — already wires `db` into `mount`.

### Changes

- `MatchRecord` includes `originTag: string` (e.g., `"synthetic"`, later `"ladder"`, `"tournament:<id>"`) so Plan B's two pairing paths share this exact storage without code-path divergence.
- Event stream is append-only; `streamEvents` is a generator (iterator), not a buffered array, so large matches don't blow memory. The JSON-array endpoint is the convenience surface; an SSE endpoint is Plan-B if we need it.
- No "match runner" in Plan A. Routes only **read** matches and **persist** synthetic test fixtures via the test helper. Plan B introduces the writers.

### Unit Tests

- `arena/tests/persistence/match-store.test.ts` — roundtrip: save + appendEvents(50) + getMatch + count(events) === 50; foreign-key error if operator id missing; `listMatchesByOperator` orders by `created_at DESC` and respects limit; `streamEvents` yields all events in insertion order without holding all in memory (asserted via lazy-iteration test).
- `arena/tests/persistence/transactions.test.ts` — partial-failure inside `appendEvents` rolls back (asserted with a forced-throw fixture); concurrent `saveMatch` calls don't corrupt FK relationships.
- `arena/tests/router/matches-routes.test.ts` — GET unknown id → 404; GET valid id → record JSON; events endpoint returns JSON array of correct length; operator-match-history pagination correct.

### Phase 3 Exit Criteria

- `bun test arena/tests/persistence/ arena/tests/router/matches-routes.test.ts` green.
- End-to-end manual test: create operator → register agent version → write synthetic match (via test helper) → GET match → GET events → GET operator history.
- `.arena/state.db` survives an arena service restart with all Phase-3 data intact.

---

## Sequencing Notes

- Phases stack: P2 imports `db.ts` from P1; P3 imports `db.ts` from P1 and reuses types defined in P2. **No file in any phase is unreachable from `server.ts` boot.**
- Each phase ends with `bun test` green for its own suites and **no regression** in existing arena suites (engine, gateway, agents).
- Ledger seal at each phase exit via `/qor-substantiate`. Plan A's release ledger entry references all three phase hashes.
- Plan B (matchmaking + rank + UI) **MUST NOT** start until Plan A is sealed, so its audit can take the substrate as a fixed surface and focus on lifecycle complexity (loops, schedulers, presence — the parts that actually triggered v16's veto).

## Acceptance (Plan A Exit)

1. `.arena/state.db` exists with v1 schema.
2. Operator + auth-token lifecycle works end-to-end via HTTP.
3. Agent versions register with deterministic fingerprints; similarity flags surface advisory neighbors.
4. Match records and events persist and read back via HTTP, including for a multi-event synthetic match.
5. All Plan-A test suites green; no regression in pre-Plan-A arena suites.
6. Razor Budget Summary remains accurate post-implementation (re-measured during `/qor-substantiate`).
7. Ledger seals a Plan-A entry referencing all three phase hashes.
