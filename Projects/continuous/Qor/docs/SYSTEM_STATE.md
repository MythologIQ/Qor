# SYSTEM_STATE: QOR — HexaWars Scope-2 Plan A v2 Phase 1 (Persistence Skeleton)

**Updated**: 2026-04-17T23:59:00Z
**Blueprint**: `docs/plans/2026-04-17-hexawars-scope-2-plan-a-v2-identity-substrate.md`
**Verdict**: PASS (Phase 1 sealed; Phase 2 & 3 pending)
**Merkle Seal**: `1b1defc7f794b38bd33a643722a87ecd86e7357b13d098307eba200b7a92c0b3`
**Status**: PHASE-1-SEALED

---

## Reality Audit

### Planned Files Verified (Phase 1)

```
arena/src/persistence/
├── db.ts             (NEW, 36L)
└── schema.sql        (NEW, 65L)

arena/tests/persistence/
├── db.test.ts        (NEW, 83L, 6 tests)
└── schema.test.ts    (NEW, 122L, 8 tests)
```

### Modified Build-Path Files Verified (Phase 1)

```
arena/src/shared/types.ts     (60L → 80L; +Operator, AgentVersion, MatchRecord, MatchEvent, Fingerprint)
arena/src/router.ts           (15L → 17L; mount(app, db) signature)
arena/src/server.ts           (32L → 40L; openDb + initDb + pass db into mount)
.gitignore                    (+.arena/ runtime data directory)
docs/META_LEDGER.md           (+IMPL entry, chain hash 757334d9…8e1c)
docs/SYSTEM_STATE.md          (this file)
```

### Deferred to Phase 2

- `arena/src/identity/rate-limit.ts` — IP-bucket rate limiter (10/hour)
- `arena/src/identity/operator.ts` — createOperator, getOperatorByToken, rotateToken
- `arena/src/identity/fingerprint.ts` — deterministic fingerprint
- `arena/src/identity/similarity.ts` — 5-gram Jaccard advisory

### Deferred to Phase 3

- `arena/src/persistence/match-store.ts` — saveMatch, appendEvents, streamEvents

---

## Runtime Surfaces

- `openDb(path?)` / `initDb(db)` — `bun:sqlite` persistence, WAL on disk, idempotent schema apply.
- `mount(app, db)` — router now receives closure-injected DB handle (unused in Phase 1).
- `server.ts` boot creates `.arena/` dir (gitignored), opens DB, runs schema init once, mounts router.
- All four tables (`operators`, `agent_versions`, `matches`, `match_events`) created with UNIQUE/FK/CHECK constraints.

## Verification

| Check | Result |
|-------|--------|
| `bun test tests/persistence/` | 14 pass, 0 fail (33 expects) |
| Full arena suite | 409 pass, 1 fail (pre-existing ui-smoke threshold, documented in tick 77) |
| No new regressions | ✅ |
| Section 4 Razor | PASS (max file 122L / 250L; max fn ~14L / 40L; depth ≤2 / 3; no nested ternaries) |
| No `console.log` in new production code | ✅ |
| `model_id` NOT NULL + length-bounded | ✅ (schema CHECK rejects empty and >128 char) |
| Foreign-key PRAGMA enabled | ✅ |
| WAL mode enabled on disk-backed DB | ✅ |
| Schema idempotency | ✅ (two `initDb` calls produce identical schema) |

## Version Validation

| Check | Result |
|-------|--------|
| Latest git tag | `backup/pre-filter-repo-2026-04-17` (not a semver release) |
| Blueprint versioning | governance-hash (META_LEDGER chain) |
| Seal decision | PASS — no tag supersedes Plan A v2; per-phase seals sequenced via chain hash |

## Phase 1 Exit Criteria (all met)

- [x] `bun test arena/tests/persistence/` green
- [x] Schema idempotency verified
- [x] WAL mode asserted for disk-backed DB
- [x] `.arena/state.db` creation path proven (via mkdirSync + openDb)
- [x] No orphan modules (every new file is reachable from `server.ts`)

## Authorizations (from v18 audit)

- Phase 1 sealed → Phase 2 builder tasks unlocked.
- Plan B drafting MAY begin in parallel (Phase 1 substrate is now fixed).
- Phases 2 & 3 each require their own `/qor-substantiate` seal before the next queues.

## Residual Notes

- The pre-existing `ui-smoke.test.ts` failure (3.3KB PNG vs 10KB threshold) is a test-infrastructure issue documented in tick 77; not a Phase-1 regression.
- `.arena/` is gitignored — runtime SQLite state is never committed.
- Phase 1 did NOT introduce new external dependencies; only `bun:sqlite` (first-party) and Node built-ins (`fs`, `path`).
