# ARCHITECTURE_PLAN — HexaWars Arena

**Project**: HexaWars Arena
**Workspace**: `/home/workspace/Projects/Active/arena/`
**Governance**: Qor S.H.I.E.L.D. cycle (skills at `/home/workspace/Projects/continuous/Qor/skills/`)
**Forked from Qor**: 2026-04-18 (anchor `sha256:1b1defc7…c0b3`)
**Status**: Phase 1 SEALED · Phase 2 queued · Phase 3 queued
**Canonical Blueprint**: [`docs/plans/2026-04-17-hexawars-scope-2-plan-a-v2-identity-substrate.md`](plans/2026-04-17-hexawars-scope-2-plan-a-v2-identity-substrate.md)

---

## Product Summary

HexaWars Arena is a governed competitive platform where external (BYOA) agents play a deterministic hex-board wargame under fog-of-war, refereed by a server that never executes agent code. The arena is the scorekeeper, ledger, and replay substrate; operators run their own agents and connect via WebSocket gateway.

Qor is **not** the product — Qor is the governance method. The Forge is the builder tool. HexaWars is what Forge is building under Qor discipline.

## Scope

### Scope-1 (shipped, sealed under prior Qor chain)
- Hex engine (board, movement, combat, fog, territory, victory, deterministic PRNG)
- Match runtime + orchestrator (events, matchmaker, metrics, turns)
- BYOA WebSocket gateway (protocol, validator, budget, timeout, session)
- Reference agents (random, greedy)
- Spectator UI (zo.space `/arena/hexawars` + live WS client)
- Test suites: engine, gateway, agents, determinism, fairness, persistence

### Scope-2 Plan A v2 — Identity Substrate (current)
Build the durable persistence + identity primitives the rest of Scope-2 will sit on. The current tree now also carries the first truthful public-language pass for the shipped HexaWars broadcast surface so the live page reads as agent-v-agent competition instead of framework scaffolding. The blueprint linked above is load-bearing; this document summarizes and indexes it.

**Non-goals**: matchmaking loop, ELO, tournaments, presence, replay UI. Those are Plan B/C.

---

## Locked Decisions (Scope-2 dialogue + v2 dialogue)

| # | Decision | Source |
|---|----------|--------|
| 1 | Goal = depth expansion, not new games | Scope-2 Q2 → B |
| 2 | External-only BYOA (arena is referee, not host) | Scope-2 Q3 → A |
| 3 | One persistent operator identity, one ELO; agent fingerprint recorded per match | Scope-2 Q4 → D |
| 4 | Fingerprint = `sha256(normalize(code) ‖ normalize(config) ‖ model_id ‖ normalize(prompt_template))`; similarity advisory-only | Scope-2 Q4 follow-up |
| 5 | Persistence = `bun:sqlite`, file-backed `.arena/state.db`, WAL mode | Scope-2 Q1 |
| 6 | Operator registration: open + rate-limit + handle-reservation | v2 Q1 → A |
| 7 | Token storage: sha256 + token-id prefix + per-row salt (O(1) lookup) | v2 Q2 → B |
| 8 | `model_id` first-class captured column, required, length-checked — no incognito agents | v2 side note |
| 9 | Matchmaking model (Scope-2 Q5 → **D**): continuous availability windows **plus** scheduled tournaments, one operator identity across both | Scope-2 Q5 |

Decision #9 governs **Plan B** (not this plan).

---

## Architecture Layers

```
┌────────────────────────────────────────────────────────────────┐
│  Spectator UI (zo.space /arena/hexawars)           [Scope-1]   │
│  WebSocket Gateway (protocol, validator, session)  [Scope-1]   │
│  Match Runtime / Orchestrator                      [Scope-1]   │
│  Hex Engine (deterministic, fog-of-war)            [Scope-1]   │
│────────────────────────────────────────────────────────────────│
│  Router (Hono) ─ mount(app, db)                    [Scope-1]   │
│  Route Modules (matches, tournaments, auth)       [Scope-2]   │
│  Identity         — operator, rate-limit,                      │
│                     fingerprint, similarity        [Plan A v2] │
│  Persistence      — db, schema, match-store        [Plan A v2] │
└────────────────────────────────────────────────────────────────┘
```

Active build paths are now explicit:
- `src/server.ts` boots the arena service runtime.
- `src/public/arena.js` owns the shipped spectator surface, including replay keyboard support.
- `package.json` exports `./agent-runner` for the external operator SDK entrypoint at `src/agents/runner.ts`.
- Legacy harness code that is not part of the shipped runtime lives under `tests/fixtures/runtime/`, not under `src/`.

## Razor Budget (per Section-4: file ≤ 250L, fn ≤ 40L, depth ≤ 3, no nested ternaries)

See blueprint §Razor Budget Summary. Largest planned file is `match-store.ts` at ~130 LOC (52% of ceiling). Phase 1 post-implementation largest file was `schema.test.ts` at 122 LOC (verified in `SYSTEM_STATE.md`).

## Security Surface (v16 guard-bound)

| Endpoint | Method | Who | Enforcement | Token-at-rest |
|---|:-:|---|---|---|
| `/api/arena/operators` | POST | open + rate-limit + handle-reservation | `identity/rate-limit.ts` IP-bucket 10/hr | — (issues token) |
| `/api/arena/agent-versions` | POST | operator bearer token | inline `getOperatorByToken()` | `sha256(salt ‖ secret)`, `token_id`-indexed |
| `/api/arena/matches/:id` | GET | public | — | — |
| `/api/arena/matches/:id/events` | GET | public | — | — |
| `/api/arena/operators/:handle/matches` | GET | public | — | — |

**Token format**: `<token_id_hex>.<secret_hex>` — 8 random bytes id, 24 random bytes secret. Verify with `crypto.timingSafeEqual(sha256(salt ‖ provided_secret), stored_hash)`.

---

## Phase Plan

### Phase 1 — Persistence Skeleton  ✅ SEALED (2026-04-18)
- `arena/src/persistence/db.ts` (36L) — `openDb`, `initDb`, WAL, idempotent
- `arena/src/persistence/schema.sql` (65L) — 4 tables, UNIQUE/FK/CHECK
- `arena/src/shared/types.ts` — +Operator, AgentVersion, MatchRecord, MatchEvent, Fingerprint
- `arena/src/server.ts`, `arena/src/router.ts` — DB wired via closure
- Tests: 14 pass / 0 fail (33 expects); full arena suite 409 pass / 1 pre-existing unrelated
- Exit: `.arena/state.db` survives restart; schema idempotent; WAL enabled

### Phase 2 — Identity, Rate-Limit, Fingerprint  ⏳ QUEUED
- `arena/src/identity/rate-limit.ts` (~55L)
- `arena/src/identity/operator.ts` (~115L) — createOperator, getOperatorByHandle, getOperatorByToken, rotateToken
- `arena/src/identity/fingerprint.ts` (~85L) — pure `fingerprint(input): Fingerprint`
- `arena/src/identity/similarity.ts` (~80L) — 5-gram Jaccard advisory, `flagAgainst`
- Router: `POST /api/arena/operators`, `POST /api/arena/agent-versions`
- Tests: operator roundtrip, rate-limit, fingerprint determinism, similarity corpus, route contracts

### Phase 3 — Match Records & Replay Substrate  ⏳ QUEUED
- `arena/src/persistence/match-store.ts` (~130L) — saveMatch, appendEvents, getMatch, listMatchesByOperator, streamEvents
- Router: `GET /api/arena/matches/:id`, `GET /api/arena/matches/:id/events`, `GET /api/arena/operators/:handle/matches`
- Tests: roundtrip (save + 50 events), FK enforcement, lazy iteration, rollback on partial failure, route JSON shapes
- Exit: `.arena/state.db` survives restart with Phase 3 data intact

## Open Questions (tracked from blueprint)

- **Q1** — Fingerprint normalization rules (assumed: strip comments, collapse whitespace, preserve string literals byte-exact)
- **Q2** — Rate-limit store durability (assumed: in-memory v1; promote to SQLite if abuse warrants)
- **Q3** — Similarity n-gram size (assumed: 5-gram v1)
- **Q4** — `model_id` canonical form (assumed: free-text, 1–128 char length-checked)

## Sequencing & Seals

- Phases stack: P2 imports P1; P3 imports P1 + P2 types.
- Each phase ends with `/qor-substantiate` seal in `docs/META_LEDGER.md`.
- Plan A v2 release entry references all three phase hashes.
- **Plan B (matchmaking + rank + tournaments + presence + UI) MUST NOT begin until Plan A v2 is fully sealed.**

## Acceptance (Plan A v2 exit)

1. `.arena/state.db` has v2 schema (`handle_normalized`, `token_id`, `token_salt`, `token_hash`, `model_id NOT NULL CHECK`).
2. Operator registration rate-limited 10/IP/hour; 11th → 429 with `Retry-After`.
3. Handle-collision (case + zero-width + NFKC) → 409 on second POST.
4. Token issued as `<id>.<secret>`, shown once, stored salted; `getOperatorByToken` uses `timingSafeEqual`.
5. Agent versions persist with first-class `model_id`; fingerprints deterministic; similarity advisory.
6. Match records + events persist and read back via HTTP, including multi-event synthetic match.
7. All Plan A v2 test suites green; no regression in pre-Plan-A suites.
8. Razor Budget accurate post-implementation.
9. Ledger seals Plan A v2 entry referencing all three phase hashes.

---

## Related Documents

- Concept: [`CONCEPT.md`](CONCEPT.md)
- Blueprint: [`plans/2026-04-17-hexawars-scope-2-plan-a-v2-identity-substrate.md`](plans/2026-04-17-hexawars-scope-2-plan-a-v2-identity-substrate.md)
- Predecessor (vetoed v17): [`plans/2026-04-17-hexawars-scope-2-plan-a-identity-substrate.md`](plans/2026-04-17-hexawars-scope-2-plan-a-identity-substrate.md)
- Scope-2 parent plan: [`plans/2026-04-17-hexawars-scope-2-depth-expansion.md`](plans/2026-04-17-hexawars-scope-2-depth-expansion.md)
- Scope-1 original plan: [`plans/2026-04-16-hexawars-arena-autonomous-build.md`](plans/2026-04-16-hexawars-arena-autonomous-build.md)
- Agent contract: [`AGENT_CONTRACT.md`](AGENT_CONTRACT.md)
- Current state snapshot: [`SYSTEM_STATE.md`](SYSTEM_STATE.md)
- Ledger: [`META_LEDGER.md`](META_LEDGER.md)
- Shadow genome: [`SHADOW_GENOME.md`](SHADOW_GENOME.md)
