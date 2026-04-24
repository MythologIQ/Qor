# Plan: HexaWars Plan D v2 — Phases 3–5 (R-A Cutover, v3 delta)

> Delta supplement to v2. Folds the six remediation directives (R1–R6) from the 2026-04-23T13:00Z tribunal. Adopts **R2-c** (delete `HelloFrame.turnCap` entirely) in preference to R2-a/R2-b.

## Governing Context

- Supersedes: `docs/plans/2026-04-23-hexawars-plan-d-v2-phases-3-5-R-A-v2.md` (VETO 13:00Z on V1-r.1–5 + legacy-side orphan trace).
- Governing blueprint: `docs/plans/2026-04-22-hexawars-plan-d-round-economy-v2.md` (task-194).
- Prior seal chain: Phase 1 substrate + Phase 2 validator aggregator.
- This delta inherits everything in v2 *unless explicitly overridden here*. Locked Design Decisions 1–8 stand; Open Questions 1–2 stand.

## Delta Scope

This plan is a **narrow supplement** — it adds missing surfaces to v2, resolves the `HelloFrame.turnCap` ambiguity via deletion, and extends the Orphan Trace. No new design decisions; no new pure modules; no changes to Phase A/B implementation semantics.

## R1 — `src/public/score.js` Added to UI Migration

### Affected Files (additive to v2 Phase C)

- `src/public/score.js` — rename destructure `turnCap` → `roundCap` on line 1 signature; rename template literal `Turn ${turn}/${turnCap}` → `Turn ${turn}/${roundCap}` on line 38.
- `tests/public/score.test.ts` (if present) — update any assertion that emits `turnCap`.

### Change (illustrative)

```js
// src/public/score.js — before
export function updateScore(el, { a, b, turn, turnCap, phase, ... }) { ... }
// `<span>Turn ${turn}/${turnCap}</span>`

// after
export function updateScore(el, { a, b, turn, roundCap, phase, ... }) { ... }
// `<span>Turn ${turn}/${roundCap}</span>`
```

Copy text ("Turn N/M") preserved verbatim to match Open Question #2 disposition (UI copy unchanged).

## R2-c — Delete `HelloFrame.turnCap` Entirely

Disposition chosen: **R2-c**. The runner enforces `ROUND_CAP` as a constant; clients do not need the handshake to announce a cap. Cleanest contract surface — removes a field rather than renames one.

### Affected Files

- `src/gateway/contract.ts` — delete `turnCap: number` field from `HelloFrame` interface (line 19). `HelloFrame` keeps `matchId`, `side`, `seed`, `boardSize`, `timeBudgetMs`, `protocolVersion`.
- `src/gateway/ws.ts`:
  - `buildHelloFrame(matchId, side, seed, boardSize, timeBudgetMs)` — drop `turnCap` parameter.
  - `WsServerOpts` — drop `turnCap?: number` field and the `turnCap = 150` default in the destructure on line ~130.
  - `registerWsHandlers` — drop any usage of `turnCap` from call sites.
- `src/gateway/protocol.ts` — `validateHelloFrame` (line ~73) — drop the `typeof frame.turnCap === 'number'` check.
- Test files (7 emitters):
  - `tests/gateway/protocol.test.ts`
  - `tests/gateway/ws.test.ts`
  - `tests/engine/protocol.test.ts`
  - `tests/engine/protocol-parse.test.ts`
  - `tests/engine/protocol-roundtrip.test.ts`
  - `tests/engine/match-runner.test.ts`
  - `tests/agents/runner.test.ts`

  Each test emits a `HelloFrame` literal containing `turnCap: <n>`. Remove that field from every literal. No new field substituted — the handshake simply gets smaller.

### Rationale

- `MatchState.roundCap` (populated per-frame by the runner) is the single authoritative surface. UI reads it from `STATE` frames.
- `HELLO` stays lean; no dead-on-the-wire field; no successor-plan hook required (R2-b footgun avoided).
- Delete is mechanically simpler than rename: one field removal per literal instead of a field rename per literal (same touched files either way).

## R3 — `src/gateway/ws.ts` Added to Affected Files + Legacy Deletion Checklist

### Affected Files (additive to v2 Phase C)

- `src/gateway/ws.ts`:
  - Import `ActionFrame` (line 7) — **remove**. Replace with import `PlanFrame`.
  - `parseFrame()` return type `ReadyFrame | ActionFrame | null` (line 151) — **change** to `ReadyFrame | PlanFrame | null`.
  - Switch `case 'ACTION'` branch in `parseFrame` body (line ~155) — **change** to `case 'PLAN'`, casting to `PlanFrame`.
  - `buildHelloFrame` signature change per R2-c (drop `turnCap`).
  - `WsServerOpts.turnCap?` + default — remove per R2-c.

### Legacy Deletion Checklist (additive to v2)

- `src/gateway/ws.ts`: `ActionFrame` import; `parseFrame` returning `ActionFrame`; `case 'ACTION'` parser branch — all removed in favor of `PlanFrame` / `'PLAN'`.
- `src/gateway/ws.ts`: `turnCap` parameter on `buildHelloFrame`; `turnCap?: number` on `WsServerOpts`; default value `150`.

## R4 — `tests/public/demo-replay.test.ts:24` Added to Test Migration

### Affected Files (additive)

- `tests/public/demo-replay.test.ts:24` — assertion `expect(frames.at(-1)?.state.turnCap).toBe(48);` → update to `expect(frames.at(-1)?.state.roundCap).toBe(ROUND_CAP);` (import `ROUND_CAP` from `src/engine/constants`, or use numeric literal `50`).
- Any other `state.turnCap` references in the same test file — rename to `state.roundCap`.

## R5 — Root-level Debug Harnesses Disposition: **DELETE ALL**

Scope expanded from v2 audit's R5 entry: self-audit grep surfaced three peer harnesses besides `run-playtest.ts`. All four share the same doomed imports.

### Affected Files (delete)

- `run-playtest.ts` — imports `stepMatch`; uses `AgentAction` literals.
- `run-debug.ts` — imports `stepMatch`.
- `run-debug2.ts` — imports `stepMatch`; calls with `{ type: "pass" }`.
- `run-debug3.ts` — imports `stepMatch`; calls with `{ type: "pass" }`.

### R5 — `run-playtest.ts` Disposition: **DELETE**

### Evidence

- `run-playtest.ts:1` imports `stepMatch` from `./src/engine/match.ts` — direct target of Phase C6 deletion.
- `run-playtest.ts:6–44` uses `AgentAction`-shaped return values (`{ type: "pass" }`, `{ type: "move", unitId, from, to }`) — the same contract being retired.
- `run-playtest.ts:48` uses a local `const TURN_CAP = 150` — shadow of the deleted shared constant.
- Not referenced by `src/`, not referenced by tests, not imported by `orchestrator/match-runner.ts`.
- It is an ad-hoc evaluation harness that duplicates the agents/random + agents/greedy flow the runner already drives.

### Disposition

Delete `run-playtest.ts` in Phase C6. No replacement — if operator wants bulk playtest, the runner-based harness is the successor path (invoked via `matchmaker` or a successor `scripts/playtest.ts`, out of scope here).

Legacy Deletion Checklist updated accordingly.

## R6 — Orphan Trace (Legacy-Removal Side)

Exhaustive list of symbols this plan removes. For each: every file that currently imports or references the symbol, and the disposition post-cutover.

| Deleted Symbol | Current Consumers | Post-Cutover Disposition |
|---|---|---|
| `AgentAction` (type, `src/shared/types.ts`) | `src/agents/base.ts`, `src/agents/runner.ts`, `src/agents/greedy.ts`, `src/agents/random.ts`, `src/gateway/validator.ts` (validateAction/Raw), `run-playtest.ts`, test files | All rewritten to consume `RoundPlan` per v2 Phase C; `run-playtest.ts` deleted |
| `AgentActionType` (type, `src/shared/types.ts`) | `src/gateway/validator.ts` (legacy whitelist) | Deleted with `validateAction` |
| `TURN_CAP` (const, `src/shared/types.ts`) | `src/orchestrator/match-runner.ts` (shadow const), `src/public/demo-replay.js` (`const TURN_CAP = 48`), `run-playtest.ts` (`const TURN_CAP = 150`), tests | All replaced with `ROUND_CAP` from `src/engine/constants.ts`; shadow locals deleted |
| `MatchState.yourTurn` (field) | `src/runner/runner.ts`, `src/gateway/protocol.ts` (if validated), `src/public/arena.js` (render guard), tests | Removed; per-round bidding replaces turn-gating |
| `ActionFrame` (type, `src/gateway/contract.ts`) | `src/gateway/ws.ts` (import/parseFrame/case), `src/gateway/protocol.ts` (validateActionFrame, isValidFrame case), `src/agents/runner.ts` (agent-host), tests | Replaced with `PlanFrame` everywhere |
| `validateActionFrame` (fn, `src/gateway/protocol.ts`) | `src/gateway/protocol.ts::isValidFrame` dispatcher | Deleted; `validatePlanFrame` inserted |
| `HelloFrame.turnCap` (field) | `src/gateway/contract.ts`, `src/gateway/ws.ts::buildHelloFrame`/`WsServerOpts`, `src/gateway/protocol.ts::validateHelloFrame`, 7 test files | Removed per R2-c |
| `WsServerOpts.turnCap` (field) | `src/gateway/ws.ts::registerWsHandlers` default, callers | Removed per R2-c |
| `stepMatch` (fn, `src/engine/match.ts`) | `run-playtest.ts`, `tests/engine/match.test.ts`, `tests/determinism/match-replay.test.ts`, `tests/smoke/plan-b.test.ts`, `tests/runner/turn-dispatch.test.ts`, `tests/engine/e2e.test.ts`, `tests/fixtures/runtime/match-runner.ts`, `run-debug2.ts`, `run-debug3.ts` | Deleted; consumers migrate to `roundDriver.runRound` via runner fixture; `run-debug*.ts` + `run-playtest.ts` deleted |
| `turns.ts` exports (`advanceTurn`, `TurnEngine`) | `src/runner/runner.ts` (TurnEngine), `tests/engine/turns.test.ts`, `tests/runner/turn-dispatch.test.ts` | File deleted; `TurnEngine` replaced by runner's direct round loop |
| `roundEndCarryover` (fn, `src/engine/round-state.ts`) | `tests/engine/round-state.test.ts` (if asserted) | Deleted; superseded by `applyEndOfRound` |
| `validateAction`, `validateActionRaw` (fns, `src/gateway/validator.ts`) | `tests/gateway/validator.test.ts`, `tests/gateway/validator-raw.test.ts`, `tests/engine/validator.test.ts` | Deleted; coverage migrates to `validateRoundPlan` |
| `TURN_CAP` local shadows | `src/orchestrator/match-runner.ts:27`, `src/public/demo-replay.js:3`, `run-playtest.ts:48` | Deleted |

### Verification Protocol

Immediately after Phase C6 deletions, a grep sweep across `src/`, `tests/`, and root-level `.ts` files MUST return zero matches for each deleted symbol:

```
rg -w "AgentAction|AgentActionType|stepMatch|advanceTurn|TurnEngine|roundEndCarryover|validateAction|validateActionRaw|ActionFrame|validateActionFrame"
rg -w "turnCap|TURN_CAP"
rg -w "yourTurn"
```

Any hit is a VETO-level regression and must be resolved in the same session.

## Consolidated Affected Files (v2 + v3 delta)

Use v2's Phase A/B/C lists, plus:

| File | Delta | Source |
|---|---|---|
| `src/public/score.js` | rename field | R1 |
| `src/gateway/contract.ts` | delete `HelloFrame.turnCap` | R2-c |
| `src/gateway/ws.ts` | PlanFrame migration + drop `turnCap` param/default | R2-c, R3 |
| `src/gateway/protocol.ts` | drop `turnCap` check in `validateHelloFrame` | R2-c |
| `tests/public/demo-replay.test.ts` | line 24 assertion | R4 |
| `tests/gateway/protocol.test.ts` | drop `turnCap` from HELLO literals + migrate ACTION→PLAN | R2-c, v2 |
| `tests/gateway/ws.test.ts` | drop `turnCap` | R2-c |
| `tests/engine/protocol.test.ts` | drop `turnCap` | R2-c |
| `tests/engine/protocol-parse.test.ts` | drop `turnCap` | R2-c |
| `tests/engine/protocol-roundtrip.test.ts` | drop `turnCap` | R2-c |
| `tests/engine/match-runner.test.ts` | drop `turnCap` | R2-c |
| `tests/agents/runner.test.ts` | drop `turnCap` + agent-host migration | R2-c, v2 |
| `run-playtest.ts` | delete file | R5 |
| `run-debug.ts` | delete file | R5 (grep-found) |
| `run-debug2.ts` | delete file | R5 (grep-found) |
| `run-debug3.ts` | delete file | R5 (grep-found) |
| `tests/gateway/validator-round-plan.test.ts:8` | remove `yourTurn: true` | R6 (grep-found) |
| `tests/engine/victory.test.ts:22` | remove `yourTurn: true` | R6 (grep-found) |
| `PLAYTEST.md` | update doc references (non-code) | substantiate phase |

## Razor Compliance (delta)

No function introduced; all deltas are field renames/removals. v2 Razor table stands.

| Check | Limit | v3 impact | Status |
|---|---:|---|:---:|
| Max function lines | 40 | No new functions | PASS (v2) |
| Max file lines | 250 | No file grows | PASS (v2) |
| Max nesting depth | 3 | No new nesting | PASS (v2) |
| Nested ternaries | 0 | No new ternaries | PASS (v2) |

## Integration Contract Addenda

- After v3 deltas, `HELLO` frames are strictly `{ type, matchId, side, seed, boardSize, timeBudgetMs, protocolVersion }`. Any test or runtime site emitting an extra field fails `validateHelloFrame`.
- `score.js` consumes `roundCap` from the game state passed into `updateScore`; the runner is the sole source of truth for that value.
- `parseFrame` across `ws.ts` and `protocol.ts` returns identical frame unions; both accept `PLAN` and reject `ACTION`.

## Session Intent

Per operator directive (2026-04-23, Victor session): all remediation closed **in this session** — v3 plan authored, self-audited, and implemented end-to-end (Phases A, B, C1–C6) without builder handoff. The builder pointer is not advanced; this plan's substantiation will be written by the session directly.
