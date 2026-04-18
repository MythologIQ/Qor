# Plan: HexaWars Scope-2 — Depth Expansion

**Plan ID**: `hexawars-scope-2-v1`
**Created**: 2026-04-17T15:55:00-04:00
**Planner**: Claude Opus 4.6 (interactive, qor-plan skill)
**Predecessor**: `2026-04-16-hexawars-arena-autonomous-build.md` (HexaWars MVP)
**Governance**: QorLogic S.H.I.E.L.D. cycle; advisory gates; META_LEDGER sealed

---

## Intent

Turn HexaWars from a playable MVP into a **product**: persistent operator identities, ranked play across both continuous ladder and scheduled tournaments, match replays, leaderboards. External-only BYOA (operators host their own agents); arena is a referee, not a compute host. Every ranked result is cryptographically tied to a specific agent fingerprint so plagiarism and farm-and-swap are visible on the public record.

## Decisions (locked in dialogue)

| # | Decision |
|---|---|
| 1 | **Goal**: Depth expansion (not new games, not ecosystem breadth). Make HexaWars a real product. |
| 2 | **Agent execution**: External-only BYOA. Arena connects out via WebSocket to operator-hosted agents. No sandbox, no hosted execution. |
| 3 | **Identity**: One persistent operator identity, one ELO. Every match records the exact agent fingerprint that played. Versioning is for auditability, not a second rank stream. |
| 4 | **Fingerprint**: `sha256(normalize(code) ‖ normalize(config) ‖ model_id ‖ normalize(prompt_template))`. Fingerprint similarity (n-gram Jaccard over normalized inputs) **flags** near-duplicates for human review — no auto-ban. |
| 5 | **Matchmaking**: Both paths, straight away — (A) continuous ladder via availability windows, (B) scheduled tournaments. One ELO stream, both contribute. |

## Open Questions

- **Q1**: Persistence engine — SQLite file-backed in-service, or external Postgres/Neo4j? *(Plan assumes SQLite for simplicity-made-easy; revisit if match volume > 10k/day.)*
- **Q2**: ELO K-factor schedule — flat, provisional-then-flat, or Glicko-2? *(Plan assumes provisional K=40 for first 20 matches, then K=24 flat. Glicko-2 is a Phase-3 upgrade candidate if ranking feels noisy.)*
- **Q3**: Tournament formats v1 — Swiss only, knockout only, or both? *(Plan assumes both; Swiss for weekly ladder events, single-elim knockout for flagship monthly.)*
- **Q4**: Availability-window granularity — fixed 15-min slots vs. arbitrary WS-online presence? *(Plan assumes arbitrary: "online = WS connected with ready heartbeat". Windows are a UX convention, not a system primitive.)*

---

## Phase 1 — Identity Substrate + Match Persistence

**Goal**: Be able to say "operator X, agent fingerprint Y, played operator P's agent Q in match M; result R; replay events persisted; sealed to ledger entry T." No matchmaking yet. No ranking yet. Just the durable substrate.

### Affected Files

- `arena/src/persistence/db.ts` — SQLite connection, migration runner. Single file-backed DB at `.arena/state.db`; WAL mode; idempotent init.
- `arena/src/persistence/schema.sql` — tables: `operators`, `agent_versions`, `matches`, `match_events`. Foreign keys, indexes, no triggers.
- `arena/src/persistence/match-store.ts` — typed repo: `saveMatch`, `getMatch`, `listMatches(operatorId, limit)`, `appendEvent`. Functions over data; no ORM.
- `arena/src/identity/operator.ts` — `createOperator`, `getOperator`, `rotateToken`. Operator = `{ id, handle, created_at, auth_token_hash }`. Token generated on create, shown once, stored hashed.
- `arena/src/identity/fingerprint.ts` — `fingerprint({ code, config, model_id, prompt_template })` → 64-char hex. Normalization: strip comments, collapse whitespace, lowercase identifiers where safe; spec'd in code comment so future changes are observable.
- `arena/src/identity/similarity.ts` — `similarity(fpA, fpB)` using 5-gram Jaccard over normalized-code token stream. `flagIfAbove(0.85)` returns `{ flagged: bool, score, neighbors: [] }`.
- `arena/src/router.ts` — add routes: `POST /api/arena/operators`, `POST /api/arena/agent-versions`, `GET /api/arena/matches/:id`, `GET /api/arena/operators/:handle/matches`.
- `arena/src/shared/types.ts` — shared types: `Operator`, `AgentVersion`, `MatchRecord`, `MatchEvent`, `Fingerprint`.

### Changes

- SQLite chosen over Postgres/Neo4j for Phase-1 simplicity: zero new services, file-backed, trivially snapshotted, fits the "arena is a single referee process" model. Migration path to Postgres later is a matter of swapping `db.ts` — repo interfaces are sync-typed and portable.
- Fingerprint is **pure**: same inputs → same 64-char hex forever. Normalization rules are code-documented so we can version the fingerprint scheme if needed (v1, v2…) without silently breaking historical comparisons.
- Similarity is an advisory signal. Flagged pairs go into `operators.similarity_flags` JSON column for review-tier inspection. No automated enforcement.
- All writes in a single SQLite transaction per operation. No cross-table inconsistency.

### Unit Tests

- `arena/tests/persistence/db.test.ts` — init idempotency; WAL mode enabled; schema matches expected DDL.
- `arena/tests/persistence/match-store.test.ts` — roundtrip a match + 50 events; list matches ordered by recency; foreign-key integrity on delete.
- `arena/tests/identity/operator.test.ts` — create + get roundtrip; token rotation invalidates old; duplicate handle rejected.
- `arena/tests/identity/fingerprint.test.ts` — determinism (same input → same output across runs); whitespace-only changes don't change fingerprint; comment-only changes don't change fingerprint; real code change does change fingerprint.
- `arena/tests/identity/similarity.test.ts` — identical inputs → score 1.0; disjoint inputs → score ≈ 0; known-plagiarism fixture (near-dup with renamed identifiers) exceeds threshold.

### Phase 1 Exit Criteria

- `bun test` green across new suites.
- `.arena/state.db` created on first server boot; survives restart.
- Manual curl roundtrip: create operator → register agent version → post a synthetic match record → GET match by id returns it.

---

## Phase 2 — Matchmaking: Availability Ladder + Tournament Engine

**Goal**: Two pairing paths sharing identity + persistence. Continuous ladder fires matches opportunistically between online agents. Tournaments are scheduled, registered, bracketed, and run through completion. Both produce `MatchRecord`s in Phase-1's store.

### Affected Files

- `arena/src/matchmaking/presence.ts` — `PresenceRegistry`: online agents keyed by operator id, with `{ agentVersionId, connectedAt, lastHeartbeatAt }`. WS `ready` message registers; disconnect/heartbeat-timeout removes.
- `arena/src/matchmaking/pairing.ts` — `findPair(registry, opts)` → returns two operators with ELO within tolerance band (initial: ±120), excluding recent pairings (cooldown: 10 min). Deterministic tie-break on `(operatorId, connectedAt)`.
- `arena/src/matchmaking/ladder-loop.ts` — runs every 30s: attempts pairing; if pair found, constructs match, invokes engine, persists result. Ladder-initiated matches tagged `origin: "ladder"`.
- `arena/src/tournaments/registry.ts` — `createTournament`, `signup`, `start`, `getStandings`. Tournament = `{ id, name, format: "swiss" | "knockout", startsAt, roundsPlanned, entrants: [] }`.
- `arena/src/tournaments/swiss.ts` — Swiss pairing per round: top-half vs bottom-half by current tournament score, avoiding re-pairings. Byes for odd counts.
- `arena/src/tournaments/knockout.ts` — single-elimination bracket: seed by pre-tournament ELO; advance winners; handle odd entrant counts via byes in round 1.
- `arena/src/tournaments/runner.ts` — orchestrates a round: batches pairings, runs matches (via engine), advances bracket, persists. Matches tagged `origin: "tournament:<id>"`.
- `arena/src/tournaments/scheduler.ts` — cron-style check every 60s: starts tournaments whose `startsAt` has passed; advances rounds when current round's matches all complete.
- `arena/src/router.ts` — add routes: `POST /api/arena/tournaments`, `POST /api/arena/tournaments/:id/signup`, `GET /api/arena/tournaments`, `GET /api/arena/tournaments/:id`, `GET /api/arena/presence`.
- `arena/src/persistence/schema.sql` — extend: `tournaments`, `tournament_entrants`, `tournament_rounds`, `tournament_pairings`.

### Changes

- Two pairing paths, **one engine, one persistence layer**. A match is a match. Origin tag is a data column, not a second code path.
- Presence is in-memory only; reboot drops presence and operators reconnect. Tournament state is persisted — a reboot mid-tournament resumes correctly.
- Ladder and tournament matches both write to the same `matches` table and both feed the same ELO stream (Phase 3).
- Swiss and knockout are separate pure functions over `{ entrants, previousPairings, scores }` → `pairings`. Tournament runner is the orchestrator; pairing algorithms are testable in isolation.

### Unit Tests

- `arena/tests/matchmaking/presence.test.ts` — connect/disconnect lifecycle; heartbeat timeout evicts; concurrent registration safety.
- `arena/tests/matchmaking/pairing.test.ts` — ELO band exclusion; cooldown exclusion; deterministic ordering; empty-registry returns null.
- `arena/tests/tournaments/swiss.test.ts` — round-1 pairing; round-2 avoids re-pairings; bye handling for odd counts; reference fixture: 8-player 3-round Swiss matches known-good pairings.
- `arena/tests/tournaments/knockout.test.ts` — round-1 seeding; bye placement; advancement; elimination correctness for 4/8/16 brackets.
- `arena/tests/tournaments/runner.test.ts` — start → round-1 → completion → advancement → final, using scripted match outcomes.
- `arena/tests/tournaments/scheduler.test.ts` — tournament starts at `startsAt`; round advances when all matches complete; idle between rounds is a no-op.
- `arena/tests/persistence/tournament-store.test.ts` — full tournament persisted and restored post-reboot.

### Phase 2 Exit Criteria

- Scripted integration test: two mock operators connect WS → ladder loop pairs them → match runs → record persisted → both disconnect.
- Scripted integration test: create tournament → 4 operators sign up → start → Swiss 2-round → standings correct.
- `bun test` green.

---

## Phase 3 — Ranking, Replay, Spectator Surface

**Goal**: Turn persisted matches into a product surface. One ELO stream updated from every ranked match (ladder or tournament). Replay API reconstructs any past match. zo.space routes expose leaderboard, tournament list, per-match replay, per-operator profile.

### Affected Files

- `arena/src/rank/elo.ts` — pure `updateElo({ winner, loser, kWinner, kLoser })` → new ratings. Provisional K=40 for operators with <20 ranked matches, K=24 thereafter. Ratings stored on `operators` row.
- `arena/src/rank/apply.ts` — `applyMatchResult(matchRecord)` → reads current ratings, computes update, writes back, emits ledger entry `rank.update.vN`. Idempotent via match id.
- `arena/src/rank/leaderboard.ts` — `topN(limit)`, `operatorCard(handle)` queries. Indexed by ELO desc.
- `arena/src/replay/api.ts` — `GET /api/arena/replay/:matchId` streams events; `GET /api/arena/replay/:matchId/summary` returns metadata + result.
- `arena/src/router.ts` — add routes: `GET /api/arena/leaderboard`, `GET /api/arena/operators/:handle`.
- **zo.space routes** (separate from arena service):
  - `/hexawars/leaderboard` — top-50 by ELO; paginates; fetches `arena-frostwulf.zocomputer.io/api/arena/leaderboard`.
  - `/hexawars/tournaments` — list upcoming + recent; click-through to detail.
  - `/hexawars/tournaments/:id` — bracket view, standings, round-by-round results.
  - `/hexawars/replay/:id` — spectator view scrubbable through match events.
  - `/hexawars/operator/:handle` — profile: current ELO, match history, recent agent fingerprints, plagiarism-flag count (if any, with link to review).

### Changes

- ELO update is **pure**; `applyMatchResult` is the only place that writes rank. All ladder and tournament matches funnel through the same function after Phase-2's origin-tagged match record is persisted.
- Replay is read-only reconstruction from `match_events`. No new data duplication. Same store as Phase 1.
- Leaderboard is an index + ORDER BY, not a materialized view. Recomputed per request. If > 10k operators and queries slow, add a cached top-100.
- Per-operator profile surfaces fingerprint history and flagged similarities — this is where "farm-and-swap" or plagiarism is visible on the public record, by design.

### Unit Tests

- `arena/tests/rank/elo.test.ts` — symmetry (A beats B ↔ B beats A inverted); provisional K used correctly; plausibility bounds on 100-match simulation (winner's ELO monotonically non-decreasing on average).
- `arena/tests/rank/apply.test.ts` — idempotent on same match id; ratings persisted; ledger entry emitted.
- `arena/tests/rank/leaderboard.test.ts` — top-N ordering; ties broken by secondary key (match count desc).
- `arena/tests/replay/api.test.ts` — replay event count matches stored count; replay summary returns canonical match metadata.
- `arena/tests/integration/end-to-end.test.ts` — spin up arena, create 4 operators, run 10 ladder matches + 1 Swiss tournament, assert leaderboard reflects expected ELO ordering within tolerance.

### Phase 3 Exit Criteria

- zo.space route `/hexawars/leaderboard` renders top-50 from live arena data.
- zo.space route `/hexawars/replay/:id` replays any persisted match scrubbable frame-by-frame.
- `bun test` green end-to-end.
- Ledger seals a Scope-2 release entry referencing all three phase hashes.

---

## Sequencing Notes

- Phases stack: P2 assumes P1's persistence + identity exist; P3 assumes P2's origin-tagged matches exist.
- Each phase is independently sealable to the ledger — `/qor-substantiate` at phase exit.
- No phase introduces a new service. All arena logic stays in the existing `arena` user service.
- Fingerprint scheme is frozen as v1 at Phase-1 exit; changes require a `fingerprint_scheme_version` column migration.
- If Q2 (ELO) or Q3 (formats) needs to change after Phase 3, upgrades are additive (new K-factor function, new format module) without schema rewrites.

## Acceptance (Scope-2 Exit)

1. Operator can register, obtain auth token, connect an external agent via WebSocket.
2. Two connected operators within ELO band are paired and play a ranked ladder match; both ELOs update.
3. A scheduled tournament runs end-to-end (signup → rounds → final → standings persisted).
4. Leaderboard, tournament list, match replay, and operator profile all render on zo.space with live arena data.
5. Every ranked match record includes operator IDs, agent fingerprints, origin tag, and sealed ledger entry hash.
6. Fingerprint similarity flags are surfaced on the operator profile page.
7. All three phase test suites green; end-to-end integration test green.
