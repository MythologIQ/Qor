# Plan A v2: HexaWars Scope-2 — Identity Substrate

**Plan ID**: `hexawars-scope-2-plan-a-v2`
**Created**: 2026-04-17T23:40:00-04:00
**Planner**: Claude Opus 4.6 (interactive, qor-plan skill)
**Predecessor**: `2026-04-17-hexawars-scope-2-plan-a-identity-substrate.md` (vetoed v17; this plan remediates V5 + V6)
**Successor**: `2026-04-17-hexawars-scope-2-plan-b-matchmaking-rank.md` (to be written after Plan A v2 seals)
**Governance**: QorLogic S.H.I.E.L.D. cycle; advisory gates; META_LEDGER sealed
**v14 Mandatory Razor Guard**: see Razor Budget Summary at top of this plan
**v16 Mandatory Security Guard**: see Security Surface Summary below Razor Budget

---

## Razor Budget Summary

All limits per QoreLogic Section-4 Razor (max function = 40L, max file = 250L, max nesting = 3, no nested ternaries).

| File | Type | Current LOC | Δ LOC | Final LOC | Max File | Max Fn | Max Depth | Status |
|------|------|------------:|------:|----------:|---------:|-------:|----------:|--------|
| `arena/src/persistence/db.ts` | NEW | 0 | +75 | 75 | 250 | 30 | 2 | OK |
| `arena/src/persistence/schema.sql` | NEW | 0 | +75 | 75 | 250 | n/a | n/a | OK |
| `arena/src/persistence/match-store.ts` | NEW | 0 | +130 | 130 | 250 | 30 | 2 | OK |
| `arena/src/identity/operator.ts` | NEW | 0 | +115 | 115 | 250 | 32 | 2 | OK |
| `arena/src/identity/fingerprint.ts` | NEW | 0 | +85 | 85 | 250 | 25 | 2 | OK |
| `arena/src/identity/similarity.ts` | NEW | 0 | +80 | 80 | 250 | 30 | 2 | OK |
| `arena/src/identity/rate-limit.ts` | NEW | 0 | +55 | 55 | 250 | 25 | 2 | OK |
| `arena/src/router.ts` | MOD | 15 | +65 | 80 | 250 | 14 | 2 | OK |
| `arena/src/shared/types.ts` | MOD | 60 | +40 | 100 | 250 | n/a | n/a | OK |
| `arena/src/server.ts` | MOD | 32 | +6 | 38 | 250 | 10 | 2 | OK |

**Razor Verdict (self-check)**: All files under file-LOC, fn-LOC, and depth limits. No nested ternaries. Largest file is `match-store.ts` at 130L (52% of 250L ceiling). Estimates derived from operation count + interface surface; refined during implementation.

---

## Security Surface Summary (v16-guard-bound)

Every write endpoint on this ranked-competitive system has a declared (a) enforcement site, (b) auth-token hash algorithm, and (c) "who can invoke" stance. Read endpoints are public and stateless — they are listed for completeness.

| Endpoint | Method | Who Can Invoke | Enforcement Site | Token-at-Rest |
|---|:---:|---|---|---|
| `/api/arena/operators` | POST | open + rate-limit + handle-reservation | `arena/src/identity/rate-limit.ts` (IP-bucket, 10/hr); per-route inline check | n/a (issues token) |
| `/api/arena/agent-versions` | POST | operator-token-authenticated | per-route inline check via `getOperatorByToken()` | sha256(salt ‖ secret), token-id-indexed |
| `/api/arena/matches/:id` | GET | public | none (public read) | n/a |
| `/api/arena/matches/:id/events` | GET | public | none (public read) | n/a |
| `/api/arena/operators/:handle/matches` | GET | public | none (public read) | n/a |

**Token format**: `<token_id>.<secret>` where `token_id` is 8 random bytes hex (16 chars) and `secret` is 24 random bytes hex (48 chars). Client sends the full dotted form in `Authorization: Bearer <token_id>.<secret>`. Server splits on `.`, looks up row by `token_id` (indexed, O(1)), then verifies `sha256(salt ‖ secret) == stored_hash` with `crypto.timingSafeEqual`.

**Auth-token hash algorithm**: `sha256(salt ‖ secret)` with a 16-byte per-row salt from `crypto.randomBytes`. Acceptable per v16 guard's named set `{bcrypt, argon2id, sha256+salt}`.

**Rate-limit**: in-memory IP→bucket map, 10 POST `/api/arena/operators` per IP per rolling hour. Memory-only store is acceptable because rate-limit is best-effort anti-abuse, not authentication (a restart grants attackers at most one fresh bucket, bounded by handle-scarcity and monitoring). Open Question Q2 below tracks eventual SQLite-backed promotion.

**Handle reservation**: handles are lowercased and stripped of a documented whitespace/control-char set (reservation normalization spec at top of `operator.ts`). Two handles with identical normalized form collide — the second POST returns 409. This prevents near-collision squatting (e.g., `Alice` vs `alice` vs `alice\u200b`).

---

## Intent

Build the **durable substrate** the rest of Scope-2 will sit on: persistent operator identities, agent-version records with first-class captured `model_id`, match records, replay events, fingerprint computation, similarity scoring, rate-limited identity issuance, salted token storage. **No matchmaking. No ranking. No tournaments. No spectator UI.** Plan A v2 is "we can persist the truth, and nobody registers anonymously or stores bare hashes." Plan B is "we pair, score, and surface it."

This v2 remediates v17's two security findings (V5: no "who can invoke" declaration; V6: unsalted sha256 token storage) without touching the Phase-1/3 substrate that v17 already passed. v17's passes on Razor, Orphan, Ghost-UI, Dependency, and Macro-Architecture remain load-bearing for this plan.

## Decisions Inherited (Scope-2 dialogue + v2 dialogue)

| # | Decision | Source |
|---|----------|--------|
| 1 | Goal = depth expansion (not new games) | Scope-2 Q2 → B |
| 2 | External-only BYOA (arena is referee, not host) | Scope-2 Q3 → A |
| 3 | One persistent operator identity, one ELO; agent fingerprint recorded per match | Scope-2 Q4 → D |
| 4 | Fingerprint = `sha256(normalize(code) ‖ normalize(config) ‖ model_id ‖ normalize(prompt_template))`; similarity is advisory-only | Scope-2 Q4 follow-up |
| 5 | Persistence engine = `bun:sqlite`, file-backed at `.arena/state.db`, WAL mode | Scope-2 Q1 (default lock); v2 explicit declaration |
| 6 | Operator registration: **open + rate-limit + handle-reservation** | v2 Q1 → A |
| 7 | Token storage: **sha256 + token-id prefix + per-row salt** (O(1) lookup) | v2 Q2 → B |
| 8 | `model_id` is a first-class captured column on `agent_versions`, required at registration, not optional — "no incognito agents" | v2 side note |

## Open Questions

- **Q1**: Fingerprint normalization — strip *all* comments and collapse *all* whitespace, or preserve string literals verbatim? *(Plan assumes: strip line/block comments, collapse runs of whitespace to single space, preserve string literal contents byte-exact. Identifier renames are NOT normalized away — that's similarity's job.)*
- **Q2**: Rate-limit store durability — in-memory Map (lost on restart) or SQLite-backed buckets? *(Plan assumes in-memory for v1; rate-limit is best-effort anti-abuse, not authentication. Restart-reset is acceptable given handle-scarcity and monitoring. Promotion to SQLite-backed is a Plan-B consideration if abuse patterns warrant it.)*
- **Q3**: Similarity n-gram size — 5-gram, 7-gram, or both? *(Plan assumes 5-gram only for v1; 7-gram is a Plan-C tuning candidate.)*
- **Q4**: `model_id` canonical form — free-text string, or enum constrained to a known provider catalog? *(Plan assumes free-text with server-side length cap `LENGTH(model_id) BETWEEN 1 AND 128` and a NOT NULL CHECK. Provider-catalog constraint is a Plan-C hardening.)*

---

## Phase 1 — Persistence Skeleton

**Goal**: A SQLite file exists, has the v1 schema applied idempotently, and can be opened by a typed repo. No domain logic yet.

### Affected Files

- `arena/src/persistence/db.ts` (NEW, 75 LOC) — exports `openDb(path?: string): Database` and `initDb(db: Database): void`. `initDb` reads `schema.sql` via `import.meta.dir`-relative read and applies it inside a transaction; safe to re-run. WAL mode enabled. Driver: `bun:sqlite` (Bun first-party). **Caller**: `arena/src/server.ts` (boot path), `arena/src/persistence/match-store.ts`, `arena/src/identity/operator.ts`.
- `arena/src/persistence/schema.sql` (NEW, 75 LOC) — DDL for `operators`, `agent_versions`, `matches`, `match_events`. `operators` has columns `id INTEGER PRIMARY KEY, handle TEXT NOT NULL UNIQUE, handle_normalized TEXT NOT NULL UNIQUE, token_id TEXT NOT NULL UNIQUE, token_salt BLOB NOT NULL, token_hash BLOB NOT NULL, created_at INTEGER NOT NULL`. `agent_versions` has `id, operator_id, fingerprint TEXT NOT NULL, model_id TEXT NOT NULL CHECK(LENGTH(model_id) BETWEEN 1 AND 128), similarity_flags_json TEXT, created_at`. Foreign keys `ON DELETE RESTRICT`. Indexes on `operators.handle` (unique), `operators.handle_normalized` (unique), `operators.token_id` (unique), `agent_versions.operator_id`, `agent_versions.fingerprint`, `matches.created_at`, `match_events.match_id`. **Caller**: read by `db.ts:initDb`.
- `arena/src/server.ts` (MOD, 32L current → 38L, +6 LOC) — import `openDb`/`initDb`; call once at boot before `mount(app, db)`; pass `db` instance into `mount` so router handlers receive it via closure.
- `arena/src/router.ts` (MOD, 15L current → 20L signature-only in Phase 1, +5 LOC for `mount(app, db)` signature change).
- `arena/src/shared/types.ts` (MOD, 60L current → 80L, +20 LOC) — add interfaces: `Operator`, `AgentVersion` (includes required `modelId: string`), `MatchRecord`, `MatchEvent`, `Fingerprint` (branded string).

### Changes

- One DB instance per process, initialized at boot. No singletons; passed via closure into the router. Values, not globals.
- `schema.sql` is the single source of truth for table shape. No ORM, no migrations framework. Schema evolution = new SQL file with a version number; out of scope for Plan A.
- `initDb` is idempotent: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. No destructive DDL ever runs at boot.
- `model_id` is required-at-schema-level via `NOT NULL CHECK(LENGTH(model_id) BETWEEN 1 AND 128)`. Registration without a `model_id` cannot even reach persistence — the INSERT fails.

### Unit Tests

- `arena/tests/persistence/db.test.ts` — `openDb(":memory:")` returns a usable handle; `initDb` is idempotent (two calls produce identical schema); WAL mode is enabled on file-backed DBs; schema matches expected DDL via `PRAGMA table_info`.
- `arena/tests/persistence/schema.test.ts` — every foreign key has matching parent table; every declared index resolves; no `WITHOUT ROWID` tables (kept simple for v1); `operators.token_id`, `operators.handle_normalized` are UNIQUE; `agent_versions.model_id` is NOT NULL and rejects empty strings and > 128-char inputs.

### Phase 1 Exit Criteria

- `bun test arena/tests/persistence/` green.
- Booting the arena service creates `.arena/state.db` if absent; restart leaves it intact.
- `sqlite3 .arena/state.db ".schema"` lists exactly the four Phase-1 tables with the v2 columns.

---

## Phase 2 — Identity, Rate-Limit, Fingerprint

**Goal**: Operators can be created (rate-limited, handle-reserved) and authenticated via salted+id-prefixed tokens; agent versions register with a first-class captured `model_id`, a deterministic fingerprint, and an advisory similarity score against existing fingerprints.

### Affected Files

- `arena/src/identity/rate-limit.ts` (NEW, 55 LOC) — exports `RateLimiter` class with `check(key: string): { ok: true } | { ok: false; retryAfterSec: number }` and `configure(maxPerWindow: number, windowMs: number): void`. Internal: `Map<string, { count: number; resetAt: number }>`. Periodic sweep of expired buckets on `check()`. Pure-memory; documented as such. Factory `createIpLimiter(): RateLimiter` preconfigured for 10/hour. **Caller**: `arena/src/router.ts` POST `/api/arena/operators` handler.
- `arena/src/identity/operator.ts` (NEW, 115 LOC) — exports `createOperator(db, rawHandle): { operator, token }`, `getOperatorByHandle(db, handle)`, `getOperatorByToken(db, token): Operator | null`, `rotateToken(db, operatorId): string`. Token format: `${token_id_hex}.${secret_hex}` where `token_id = crypto.randomBytes(8).toString('hex')` and `secret = crypto.randomBytes(24).toString('hex')`. Storage: `token_salt = crypto.randomBytes(16)`, `token_hash = sha256(salt ‖ secret)`. Lookup: split token on `.`, find by `token_id`, `crypto.timingSafeEqual(sha256(salt ‖ provided_secret), stored_hash)`. Normalization helper `normalizeHandle(raw)` at top of file: trim, lowercase, strip zero-width + control chars, NFKC. **Caller**: `arena/src/router.ts` operator routes, agent-version route (for bearer-auth).
- `arena/src/identity/fingerprint.ts` (NEW, 85 LOC) — exports `fingerprint(input: AgentBuildInput): Fingerprint` (pure). Internal helpers: `normalizeCode`, `normalizeConfig`, `normalizePromptTemplate`, `digest`. Normalization spec is documented at top of file; rules listed in Open Question Q1. **Caller**: `arena/src/router.ts` POST agent-version handler.
- `arena/src/identity/similarity.ts` (NEW, 80 LOC) — exports `similarity(a: NormalizedTokens, b: NormalizedTokens): number` (5-gram Jaccard, 0..1) and `flagAgainst(db, fingerprint, normalizedTokens, threshold = 0.85): SimilarityFlag`. `flagAgainst` queries existing agent versions, scores, returns up to top-5 neighbors above threshold without modifying state. **Caller**: `arena/src/router.ts` POST agent-version handler.
- `arena/src/shared/types.ts` (MOD, 80L from Phase 1 → 95L, +15 LOC) — add `AgentBuildInput` (requires `modelId: string`), `NormalizedTokens` (branded), `SimilarityFlag`, `OperatorAuth`, `TokenPair = { tokenId: string; secret: string }`.
- `arena/src/router.ts` (MOD, 20L from Phase 1 → 55L, +35 LOC) — add `POST /api/arena/operators` (first calls `ipLimiter.check(clientIp)`, on fail returns 429 with `Retry-After`; on pass proceeds to `createOperator`; returns `{ operator, token }` with token shown ONCE in response body), `POST /api/arena/agent-versions` (auth-bearer token → `getOperatorByToken`; requires `modelId` in body (400 if missing/empty); computes fingerprint + similarity flags; persists `{operator_id, fingerprint, model_id, similarity_flags_json}`).

### Changes

- `getOperatorByToken` is the **only** production authentication code path. It is O(1) in DB lookups (indexed by `token_id`) and constant-time in hash comparison (`crypto.timingSafeEqual`). No `getOperatorByTokenHash` scan fallback exists — if the prefix isn't indexed, the lookup is intentionally cache-hostile.
- Fingerprint remains a **pure function over normalized inputs**. No I/O, no time, no randomness inside `fingerprint()`. `model_id` is already part of the fingerprint input per Scope-2 decision 4 — v2 additionally stores it as a first-class indexed column (decision 8) so it can be queried, aggregated, and displayed without hash reversal.
- Similarity is advisory: `flagAgainst` reads neighbors but never writes. Persisting flags to `agent_versions.similarity_flags_json` is the router handler's job, after a fingerprint write succeeds.
- Rate-limit `check()` is called **before** any DB work and takes `c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? c.env?.remoteAddr ?? 'unknown'` as the key (documented in the handler; trust model assumes the arena is fronted by a proxy that sets XFF; when direct, fallback to remoteAddr; when neither, bucket keyed as `unknown` — conservative: all anonymous clients share one bucket).
- Auth is bearer-token middleware-free for Plan A v2: handlers parse the `Authorization: Bearer …` header inline using `getOperatorByToken`. Middleware abstraction is YAGNI until Plan B introduces more authed routes.

### Unit Tests

- `arena/tests/identity/operator.test.ts` — create + get-by-handle roundtrip; handle normalization collision (`Alice` vs `alice` vs `alice\u200b` all collide on the second POST); token returned once and contains exactly one `.`; `getOperatorByToken` finds operator by the returned dotted token; wrong-secret-right-id fails via `timingSafeEqual`; right-secret-wrong-id returns null; `rotateToken` invalidates the prior token; stored `token_hash` is NOT the secret (verified by reading the row and asserting it doesn't contain the plaintext substring).
- `arena/tests/identity/rate-limit.test.ts` — 10 checks pass for a single IP within the window; 11th returns `ok: false` with a positive `retryAfterSec`; bucket resets after window expiry; two different keys have independent buckets; configured limits are respected.
- `arena/tests/identity/fingerprint.test.ts` — determinism (10 iterations same input → same hex); whitespace-only diff → identical fingerprint; comment-only diff → identical fingerprint; one-character identifier rename → DIFFERENT fingerprint; `model_id` change → different fingerprint; registration with empty/missing `model_id` rejected by schema CHECK.
- `arena/tests/identity/similarity.test.ts` — `similarity(x, x) === 1`; `similarity(disjoint_a, disjoint_b) === 0`; renamed-identifier fixture ≥ 0.85; unrelated agents < 0.30 on a 20-agent corpus.
- `arena/tests/router/operator-routes.test.ts` — POST `/api/arena/operators` with valid handle → 200 + `{operator, token}`; 10 valid posts from same IP pass, 11th returns 429 with `Retry-After`; duplicate normalized-handle returns 409; POST without handle returns 400; POST `/api/arena/agent-versions` without `Authorization` → 401; valid bearer + missing `modelId` → 400; valid full request → 200 + `{fingerprint, similarity_flags}` and `agent_versions` row persisted with exact submitted `model_id`.

### Phase 2 Exit Criteria

- `bun test arena/tests/identity/ arena/tests/router/operator-routes.test.ts` green.
- Manual curl: `POST /api/arena/operators {handle: "alice"}` returns `{operator, token}` once; second `POST` with same handle (or `ALICE`, or `alice\u200b`) 409s; 11th POST from same IP within an hour 429s; `POST /api/arena/agent-versions` without bearer 401s; with bearer but no `modelId` 400s; with bearer + full body writes a row and returns `{fingerprint, similarity_flags}`.

---

## Phase 3 — Match Records & Replay Substrate

**Goal**: A match record (no matchmaking yet) and its event stream can be persisted and read back. This is the storage side of replay; the streaming API and spectator UI are Plan-B/Plan-C concerns.

### Affected Files

- `arena/src/persistence/match-store.ts` (NEW, 130 LOC) — exports `saveMatch(db, record: MatchRecord): void`, `appendEvents(db, matchId, events: MatchEvent[]): void`, `getMatch(db, id): MatchRecord | null`, `listMatchesByOperator(db, operatorId, limit = 50): MatchRecord[]`, `streamEvents(db, matchId): IterableIterator<MatchEvent>`. All writes wrapped in `db.transaction(...)`. **Caller**: `arena/src/router.ts` (match read routes); a synthetic write helper in tests; Plan B's runners.
- `arena/src/shared/types.ts` (MOD, 95L from Phase 2 → 100L, +5 LOC) — `MatchRecord.originTag: string` already declared in Phase 1 types; Phase 3 adds re-exports for ergonomics + a `MatchListEntry` view type.
- `arena/src/router.ts` (MOD, 55L from Phase 2 → 80L, +25 LOC) — add `GET /api/arena/matches/:id` (returns record + counts, public), `GET /api/arena/matches/:id/events` (returns full event stream as JSON array, public for replay), `GET /api/arena/operators/:handle/matches` (last-50 by recency, public).
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
- End-to-end manual test: create operator (rate-limit holds) → register agent version with `model_id` → write synthetic match (via test helper) → GET match → GET events → GET operator history.
- `.arena/state.db` survives an arena service restart with all Phase-3 data intact.

---

## Sequencing Notes

- Phases stack: P2 imports `db.ts` from P1; P3 imports `db.ts` from P1 and reuses types defined in P2. **No file in any phase is unreachable from `server.ts` boot.**
- Each phase ends with `bun test` green for its own suites and **no regression** in existing arena suites (engine, gateway, agents).
- Ledger seal at each phase exit via `/qor-substantiate`. Plan A v2's release ledger entry references all three phase hashes.
- Plan B (matchmaking + rank + UI) **MUST NOT** start until Plan A v2 is sealed, so its audit can take the substrate as a fixed surface and focus on lifecycle complexity (loops, schedulers, presence — the parts that actually triggered v16's veto).

## Acceptance (Plan A v2 Exit)

1. `.arena/state.db` exists with v2 schema (including `handle_normalized`, `token_id`, `token_salt`, `token_hash` on `operators`, and `model_id NOT NULL CHECK` on `agent_versions`).
2. Operator registration is rate-limited (10/IP/hour) with a named in-memory limiter; 11th POST from same IP returns 429 with `Retry-After`.
3. Handle-reservation collisions (case + zero-width + NFKC) return 409 on the second POST.
4. Operator token is issued in `<id>.<secret>` form, shown once, stored as `sha256(salt ‖ secret)` with indexed `token_id` lookup; `getOperatorByToken` verifies via `crypto.timingSafeEqual`.
5. Agent versions register with a first-class captured `model_id` (required, length-checked at schema); deterministic fingerprints; similarity flags surface advisory neighbors.
6. Match records and events persist and read back via HTTP, including for a multi-event synthetic match.
7. All Plan-A v2 test suites green; no regression in pre-Plan-A arena suites.
8. Razor Budget Summary remains accurate post-implementation (re-measured during `/qor-substantiate`).
9. Ledger seals a Plan-A v2 entry referencing all three phase hashes.
