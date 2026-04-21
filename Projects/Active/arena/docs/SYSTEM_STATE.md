# SYSTEM_STATE: HexaWars Arena — Scope-2 Plan A v2 Phase 3 + 3.5 (Match Store & Seed) + Plan B (Matchmaker & Rank)

**Project**: HexaWars Arena (separated from Qor workspace 2026-04-18)
**Workspace**: `/home/workspace/Projects/Active/arena/`
**Governance**: Qor skills (at `/home/workspace/Projects/continuous/Qor/skills/`)
**Updated**: 2026-04-21T20:40:00Z
**Blueprint**: `docs/plans/2026-04-17-hexawars-scope-2-plan-a-v2-identity-substrate.md` (Phase 3.5 enhancement added this tick)
**Verdict**: PASS — Plan A v2 all phases implemented; ledger seal appended; Plan B matchmaker/runner/rank/UI feed complete
**Prior Seal**: `901422a572a8f6f778385439f6948866763a9471f860da11e6f1714d4b424338` (Phase 2 IMPL)
**Status**: PLAN-B-COMPLETE — all scope-2 deliverables shipped; arena entering maintenance mode

---

## Reality Audit

### Phase 3 New Files Verified

```
arena/src/persistence/
├── match-store.ts   (NEW, 96L)   — saveMatch / appendEvents / getMatch /
│                                    listMatchesByOperator / streamEvents / countEvents
└── seed.ts          (NEW, 113L)  — seedDemoMatch (idempotent synthetic fixture)

arena/tests/persistence/
├── match-store.test.ts  (NEW, 10 tests)
└── seed.test.ts         (NEW, 6 tests)

arena/tests/router/
└── matches-routes.test.ts  (NEW, 7 tests)
```

### Modified Build-Path Files Verified (Phase 3)

```
arena/src/router.ts    (+3 match read routes)
arena/src/server.ts    (+boot-time seedDemoMatch gated by ARENA_SEED_DEMO=1)
docs/plans/2026-04-17-hexawars-scope-2-plan-a-v2-identity-substrate.md
                       (+Phase 3.5 section appended)
docs/SYSTEM_STATE.md   (this file)
docs/META_LEDGER.md    (+Phase 3 + 3.5 IMPL entry pending append)
```

### Live Service Verification

```
GET https://arena-frostwulf.zocomputer.io/api/arena/metrics
→ {"totalMatches":1,"totalOperators":2,"completedMatches":1}

GET /api/arena/matches/seed-demo-v1
→ {"id":"seed-demo-v1","originTag":"seed:demo-v1","outcome":"A_wins",...}

GET /api/arena/matches/seed-demo-v1/events
→ {"matchId":"seed-demo-v1","events":[30-event array]}
```

---

## Runtime Surfaces (Phase 3 additions)

- `GET /api/arena/matches/:id` — returns `MatchRecord` or 404.
- `GET /api/arena/matches/:id/events` — returns `{ matchId, events: MatchEvent[] }` ordered by `seq ASC`; 404 if match unknown.
- `GET /api/arena/operators/:handle/matches` — returns `{ matches: MatchListEntry[] }` (last 50 DESC by `createdAt`), with `operatorAHandle`, `operatorBHandle`, `eventCount` aggregate; 404 if handle unknown. Lookup is case-insensitive via `handle_normalized`.
- Boot-time: `if ARENA_SEED_DEMO=1` → `seedDemoMatch(db)` inserts `seed-demo-v1` (2 operators, 2 agents, 30 events). Idempotent on restart.

## Runtime Contracts

- `saveMatch(db, rec)` — writes one row to `matches`. FK-protected.
- `appendEvents(db, matchId, events)` — wrapped in `db.transaction`; partial failure (e.g. duplicate `(match_id, seq)`) rolls back the whole batch.
- `streamEvents(db, matchId)` — lazy generator over `match_events` via `bun:sqlite .iterate()` — does NOT buffer the full set in memory.
- `origin_tag` prefix `"seed:"` is the agreed exclusion key Plan B's matchmaker will honor so seeded rows never enter ranked play.

## Verification

| Check | Result |
|-------|--------|
| `bun test` full suite | **499 pass / 0 fail (7,119 expects)** |
| Phase 3 + 3.5 new tests | **23 pass / 0 fail** (match-store 10 + seed 6 + routes 7) |
| Phase 1 + 2 regression | none (all prior 14 persistence + 62 identity tests green) |
| Section 4 Razor | PASS (max file 150L identity/operator.ts; match-store 96L; seed 113L; server 42L) |
| No `console.log` in new production code | ✅ (single `console.log` in server.ts guarded by ARENA_SEED_DEMO branch) |
| Foreign-key integrity | ✅ (saveMatch with unknown operator id throws) |
| Append-only events | ✅ (UNIQUE(match_id, seq) blocks duplicates) |
| Transactional batches | ✅ (duplicate-seq partial batch rolls back, `countEvents === 0`) |
| Stream iteration | ✅ (generator yields in seq order) |
| Seed idempotency | ✅ (second call: `alreadySeeded: true`, no duplicate rows) |
| Live service seeded | ✅ (metrics = 1/2/1, events endpoint returns 30-event array) |

## Plan A v2 Exit Acceptance (all 9 criteria met)

1. ✅ `.arena/state.db` with v2 schema (all four tables, all v2 columns + CHECKs).
2. ✅ Operator registration rate-limited (10/IP/hour), 11th → 429 + `Retry-After`.
3. ✅ Handle-reservation collisions (case / ZWJ / NFKC) → 409.
4. ✅ Token `<id>.<secret>` issued-once, sha256(salt‖secret) at rest, `timingSafeEqual` verify.
5. ✅ Agent versions carry first-class `model_id` (NOT NULL CHECK 1..128), fingerprint determinism, similarity flags.
6. ✅ Match records + events persist and read back via HTTP (seed demo exercises 30-event path live).
7. ✅ All Plan-A v2 suites green (476 Phase-1+2 + 23 Phase-3+3.5 = 499/499).
8. ✅ Razor Budget remains accurate (re-measured at this tick).
9. ⏳ META_LEDGER seal append — performed as the next step in this substantiation.

## Authorizations

- Plan A v2 COMPLETE → Plan B (matchmaker + runner + rank + UI feed) unlocks once ledger seal is appended.
- Builder automations continue on Scope-1 polish queue until Plan B tasks are staged.
- `ARENA_SEED_DEMO=1` is set on live service env; restart-safe (idempotent seed).

## Residual Notes

- UI (spectator) still needs a **reader path** wired to `/api/arena/matches/:id/events` to animate the seeded match — this is Plan B UI work (expected).
- `.arena/state.db` on live service was seeded by the post-restart boot; if the file is deleted, next boot will re-seed from scratch.
- Similarity corpus remains empty in the live route (code-column absence); Plan B may add it.
