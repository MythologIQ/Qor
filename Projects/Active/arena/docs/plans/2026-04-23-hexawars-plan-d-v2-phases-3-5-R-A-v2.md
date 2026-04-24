# Plan: HexaWars Plan D v2 — Phases 3–5 (R-A Cutover, v2)

> Second revision under remediation **R-A**. Folds the three violations from the 2026-04-23T06:55Z tribunal into the blueprint: V1 scope-leak closure (five missing surfaces added), V2-a extras rejection (validator refuses non-empty extras until a successor plan implements dispatch), V3 `roundEndCarryover` explicit deletion.

## Governing Context

- Governing blueprint: `docs/plans/2026-04-22-hexawars-plan-d-round-economy-v2.md` (task-194 atomic cutover).
- Superseded prior revision: `docs/plans/2026-04-23-hexawars-plan-d-v2-phases-3-5-R-A.md` (VETO at 06:55Z on V1/V2/V3).
- Phase 1 substrate sealed: `round-state.ts`, constants (`BASE_AP`, `AP_CAP`, `MAX_CARRY`, `ROUND_CAP`, `BID_MIN`, `MOVE_POINTS`, `RANGE`).
- Phase 2 substrate sealed: `gateway/validator/*` + `validateRoundPlan` aggregator.

## Locked Design Decisions

1. **Orchestrator placement**: new pure module `src/engine/roundDriver.ts` exports `runRound(input)` → `{ events, nextState, nextBudgets }`. Runner holds I/O; driver is pure.
2. **Agent-invocation shape**: one `getRoundPlan(state, budget)` call per agent per round, invoked in parallel via `Promise.all`.
3. **Deletion scope**: delete `AgentAction`, `AgentActionType`, `validateAction`, `validateActionRaw`, `TURN_CAP` (shared), `TURN_CAP` (orchestrator local shadow), `yourTurn` on `MatchState`, `stepMatch`, `turns.ts`, `TurnEngine`, `roundEndCarryover`.
4. **Round-loop shape**: strict serialization by bid winner — winner's entire `RoundPlan` resolves, then loser's entire plan. Interrupt check fires only against the loser's declared targets.
5. **Event emission**: extend `EngineEventType` union with `"action_retargeted"` and `"slots_refunded"`. Driver returns `EngineEvent[]`.
6. **Contract reconciliation**: bring `src/engine/match.ts` and replace `src/engine/turns.ts` into line with the frozen `shared/types.ts` contract (unit `type`/`hp`/`strength 1-10`, terrain `"plain"`).
7. **Extras rejection (V2-a)**: new validator rule `extras-disallowed.ts` rejects any `RoundPlan` where `extras.length > 0`. `runAgent` ignores `plan.extras` entirely (validator guarantees it is `[]`). `ExtraEntry` and `ExtraKind` types remain exported for the successor plan.
8. **Match state field rename**: `MatchState.turnCap` consumers (UI) migrate to `MatchState.roundCap`. The runner sets `roundCap = ROUND_CAP` on emission.

## Open Questions

1. **Terrain name reconciliation**: contract says `"plain"`, runtime says `"plains"`. This plan migrates to `"plain"` (singular, matches contract). If runtime spelling should win, flag before audit.
2. **Progress-label copy**: `src/public/arena.js:172` renders `"Resolution track ${turn} of ${turnCap}"`. This plan preserves the copy verbatim, swapping only the field source. If copy should change (e.g., "Round ${round} of ${roundCap}"), flag before audit.

## Phase A: Pure Modules + Unit Shape + Extras Rejection

Additive-only changes.

### Affected Files

- `src/shared/types.ts` — append `UnitWeight`, `BidResolverInput`, `ResolvedBidOrder`, `RunRoundInput`, `RunRoundResult`; add `weight` field on `Unit`; add `roundCap: number` field on `MatchState`; extend `EngineEventType` with `"action_retargeted"` and `"slots_refunded"`.
- `src/engine/units.ts` — add `DEFAULT_WEIGHT` map; set on `createUnit`.
- `src/engine/bidResolver.ts` — **new** pure module.
- `src/engine/retarget.ts` — **new** pure module.
- `src/engine/round-state.ts` — append `applyEndOfRound`.
- `src/engine/combat.ts` — extend `resolveCombat` with `aimPenalty` parameter (default 0).
- `src/gateway/validator/extras-disallowed.ts` — **new** validator rule: rejects plans with `extras.length > 0`.
- `src/gateway/validator.ts` — wire `validateExtrasDisallowed` into `validateRoundPlan` aggregator.
- `src/engine/bidResolver.test.ts` — **new**.
- `src/engine/retarget.test.ts` — **new**.
- `src/engine/round-state.test.ts` — extend with `applyEndOfRound` tests.
- `src/engine/combat.test.ts` — extend with aim-penalty tests.
- `src/engine/units.test.ts` — extend with `weight` tests.
- `src/gateway/validator/extras-disallowed.test.ts` — **new**.

### Changes

```ts
// src/shared/types.ts — additive
export type UnitWeight = 1 | 2 | 3; // 1=light, 2=medium, 3=heavy
export interface Unit { /* existing */; weight: UnitWeight; }
export interface MatchState { /* existing, minus yourTurn */; roundCap: number; }

export interface BidResolverInput {
  matchId: string; round: number;
  agentA: { bid: number; plan: RoundPlan };
  agentB: { bid: number; plan: RoundPlan };
}
export interface ResolvedBidOrder {
  round: number; first: "A" | "B"; bidA: number; bidB: number; tieBroken: boolean;
}

export interface RunRoundInput {
  matchId: string; round: number; state: MatchState;
  planA: RoundPlan; planB: RoundPlan;
  budgetA: AgentRoundBudget; budgetB: AgentRoundBudget;
}
export interface RunRoundResult {
  events: EngineEvent[]; nextState: MatchState;
  nextBudgetA: AgentRoundBudget; nextBudgetB: AgentRoundBudget; ended: boolean;
}

export type EngineEventType =
  | "unit_moved" | "unit_attacked" | "unit_destroyed"
  | "territory_claimed" | "turn_ended"
  | "action_retargeted" | "slots_refunded";
```

```ts
// src/engine/bidResolver.ts — pure
import type { BidResolverInput, ResolvedBidOrder } from "../shared/types";

export function resolveBids(input: BidResolverInput): ResolvedBidOrder {
  const { agentA, agentB, matchId, round } = input;
  if (agentA.bid > agentB.bid) return { round, first: "A", bidA: agentA.bid, bidB: agentB.bid, tieBroken: false };
  if (agentB.bid > agentA.bid) return { round, first: "B", bidA: agentA.bid, bidB: agentB.bid, tieBroken: false };
  const seed = stableHash(`${matchId}:${round}`);
  return { round, first: seed % 2 === 0 ? "A" : "B", bidA: agentA.bid, bidB: agentB.bid, tieBroken: true };
}

function stableHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
```

```ts
// src/engine/retarget.ts — pure
import type { Unit, CubeCoord } from "../shared/types";

export interface RetargetInput {
  attacker: Unit; originalTarget: CubeCoord; enemyUnits: Unit[]; range: number;
}

export function findRetarget(input: RetargetInput): Unit | null {
  const { attacker, originalTarget, enemyUnits, range } = input;
  const candidates = enemyUnits
    .filter((u) => hexDistance(attacker.position, u.position) <= range)
    .filter((u) => !(u.position.q === originalTarget.q && u.position.r === originalTarget.r));
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const da = hexDistance(attacker.position, a.position);
    const db = hexDistance(attacker.position, b.position);
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
  return candidates[0] ?? null;
}

function hexDistance(a: CubeCoord, b: CubeCoord): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}
```

```ts
// src/engine/round-state.ts — append (applyEndOfRound)
import { AP_CAP, MAX_CARRY } from "./constants";

export function applyEndOfRound(current: AgentRoundBudget): AgentRoundBudget {
  const refund = (current.freeMove > 0 ? 1 : 0) + (current.freeAction > 0 ? 1 : 0);
  const apPoolAfter = Math.min(current.apPool + refund, AP_CAP);
  const apCarry = Math.min(apPoolAfter, MAX_CARRY);
  return { freeMove: 0, freeAction: 0, apPool: apPoolAfter, apCarry };
}
```

```ts
// src/engine/combat.ts — extend
export function resolveCombat(
  attacker: Unit, defender: Unit, terrain: HexCell["terrain"], aimPenalty = 0,
): CombatResult {
  const reduced = Math.round(attacker.strength * (1 - aimPenalty));
  const atkDmg = terrain === "mountain" ? 0 : reduced;
  // existing retaliation & destroyed logic unchanged, using atkDmg
}
```

```ts
// src/engine/units.ts — additive
const DEFAULT_WEIGHT: Record<UnitType, UnitWeight> = { scout: 1, infantry: 2, heavy: 3 };
// createUnit returns { ...existing, weight: DEFAULT_WEIGHT[type] }
```

```ts
// src/gateway/validator/extras-disallowed.ts — new
import type { RoundPlan } from "../../shared/types";
import type { ValidationResult } from "./types";

export function validateExtrasDisallowed(plan: RoundPlan): ValidationResult {
  if (plan.extras.length > 0) {
    return { ok: false, code: "EXTRAS_NOT_IMPLEMENTED",
      message: "Extras dispatch is not implemented in Plan D v2 Phases 3–5; set extras to []." };
  }
  return { ok: true };
}
```

```ts
// src/gateway/validator.ts — wire into validateRoundPlan aggregator
import { validateExtrasDisallowed } from "./validator/extras-disallowed";
// in validateRoundPlan, append:
//   const extrasResult = validateExtrasDisallowed(plan);
//   if (!extrasResult.ok) return extrasResult;
```

### Unit Tests

- `bidResolver.test.ts`: higher bid wins both directions; tie with same `matchId`/`round` deterministic; tie with different `round` flips; tie with different `matchId` isolates; `tieBroken` flag correctness; zero-vs-zero is a tie.
- `retarget.test.ts`: null when no enemy in range; null when only enemy is original target; prefers closer; tie breaks by lowest `id`; excludes out-of-range.
- `round-state.test.ts` (extend): both slots unused refunds +2 (capped at `AP_CAP`); one slot +1; both used refund 0; `apCarry = min(apPoolAfter, MAX_CARRY)`; refund does not exceed `AP_CAP` at cap; `applyCarryover(applyEndOfRound(x))` composes cleanly.
- `combat.test.ts` (extend): `aimPenalty=0` regression lock; `aimPenalty=0.2` reduces damage by 20% rounded; `aimPenalty=0.6` with mountain zeroes damage; retaliation unchanged; `aimPenalty=1.0` drops damage to 0 on plain.
- `units.test.ts` (extend): `createUnit` assigns `weight: 1/2/3` to scout/infantry/heavy; stable across repeated calls.
- `extras-disallowed.test.ts`: empty extras passes; single extra rejects with `EXTRAS_NOT_IMPLEMENTED`; multiple extras rejects.

## Phase B: roundDriver (Pure Runtime Seam)

Composes Phase A primitives. After Phase B, all Phase A modules are runtime-connected by construction.

### Affected Files

- `src/engine/roundDriver.ts` — **new** pure module.
- `src/engine/roundDriver.test.ts` — **new**.

### Changes

```ts
// src/engine/roundDriver.ts — pure
import { resolveBids } from "./bidResolver";
import { findRetarget } from "./retarget";
import { resolveCombat } from "./combat";
import { applyCarryover, applyEndOfRound, deductBid } from "./round-state";
import { RANGE } from "./constants";
import { checkVictory } from "./victory";
import type {
  RunRoundInput, RunRoundResult, EngineEvent, MatchState,
  AgentRoundBudget, RoundPlan,
} from "../shared/types";

export function runRound(input: RunRoundInput): RunRoundResult {
  const order = resolveBids({
    matchId: input.matchId, round: input.round,
    agentA: { bid: input.planA.bid, plan: input.planA },
    agentB: { bid: input.planB.bid, plan: input.planB },
  });
  const startA = applyCarryover(deductBid(input.budgetA, input.planA.bid));
  const startB = applyCarryover(deductBid(input.budgetB, input.planB.bid));
  const first = order.first === "A"
    ? runAgent("A", input.planA, input.state, startA, input.matchId)
    : runAgent("B", input.planB, input.state, startB, input.matchId);
  const secondAgent = order.first === "A" ? "B" : "A";
  const secondPlan = order.first === "A" ? input.planB : input.planA;
  const secondStart = order.first === "A" ? startB : startA;
  const second = runAgent(secondAgent, secondPlan, first.state, secondStart, input.matchId);
  const budgetA = applyEndOfRound(order.first === "A" ? first.budget : second.budget);
  const budgetB = applyEndOfRound(order.first === "A" ? second.budget : first.budget);
  const refunds = refundEvents(input.budgetA, budgetA, input.budgetB, budgetB, input.round);
  const events = [...first.events, ...second.events, ...refunds];
  const victory = checkVictory(second.state);
  return { events, nextState: second.state, nextBudgetA: budgetA, nextBudgetB: budgetB, ended: victory.winner !== null };
}
```

`runAgent(agent, plan, state, budget, matchId)` is a local helper (≤40 lines) that:
1. If `plan.freeMove` present, apply it via `movement.applyMove`.
2. If `plan.freeAction` present: validate target still exists. If valid, `resolveCombat(..., aimPenalty=0)`. If target missing/moved, call `findRetarget`; if a target returns, `resolveCombat(..., aimPenalty = attacker.weight * 0.2)` and emit `action_retargeted` event; if `null`, action is wasted.
3. **Ignore `plan.extras`** — validator guarantees `plan.extras.length === 0`; no dispatch path exists in this plan.

`refundEvents(prevA, nextA, prevB, nextB, round)` emits one `slots_refunded` event per agent whose `apPool` increased.

### Unit Tests

- `roundDriver.test.ts`:
  - bid tie deterministic with `matchId`/`round` seed
  - winner freeMove fires before loser freeAction (serialization)
  - loser freeAction retargets when winner removed target → emits `action_retargeted` with `aimPenalty = attacker.weight * 0.2`
  - loser freeAction wasted (no combat event) when no legal retarget
  - both agents use both slots → no `slots_refunded` events
  - both agents skip both slots → two `slots_refunded` events (one per agent)
  - `ended = true` when `checkVictory` yields a winner
  - purity: identical inputs yield identical outputs across 100 invocations
  - `nextState.turn === input.round + 1`

## Phase C: Runner + Orchestrator + Agent Rewrite + Legacy Deletion

Connects `roundDriver` to the agent bridge and deletes all legacy surfaces.

### Affected Files

- `src/runner/runner.ts` — **rewrite**: drive `RoundPlan` rounds via `roundDriver.runRound`; parallel agent invocation; set `state.roundCap = ROUND_CAP` on emission.
- `src/runner/types.ts` — update `AgentChannel` to `send({ state, budget })` and `receivePlan() → Promise<RoundPlan>`.
- `src/orchestrator/match-runner.ts` — consume rewritten runner; **delete local `const TURN_CAP = 150`** and the `turnCap` opts field; drive rounds via `ROUND_CAP` from `constants.ts`; update session protocol to forward `{ state, budget }` / `{ plan }`.
- `src/engine/match.ts` — reconcile `createMatch` to contract unit shape (`type`/`hp`/`strength 1-10`, terrain `"plain"`); add `roundCap: ROUND_CAP` to returned `MatchState`; **delete** `stepMatch`.
- `src/engine/turns.ts` — **delete**.
- `src/engine/round-state.ts` — **delete** `roundEndCarryover` (superseded by `applyEndOfRound`).
- `src/shared/types.ts` — **delete** `AgentAction`, `AgentActionType`, `TURN_CAP`, `yourTurn` field on `MatchState`.
- `src/gateway/validator.ts` — **delete** `validateAction`, `validateActionRaw`, legacy `Action` whitelist. Keep `validateRoundPlan`.
- `src/gateway/contract.ts` — replace `ActionFrame` with `PlanFrame` (`{ type: 'PLAN'; plan: RoundPlan; confidence: number }`); update `EventFrame` union to current `EngineEventType`; remove `AgentAction` export.
- `src/gateway/protocol.ts` — **delete** `validateActionFrame`; **add** `validatePlanFrame(frame: PlanFrame)` delegating structural checks to the frame shape and content checks to `validateRoundPlan`; update `isValidFrame` dispatcher: replace `case 'ACTION'` with `case 'PLAN'`.
- `src/agents/runner.ts` (agent-host) — migrate `sendAction(ws, action: AgentAction)` → `sendPlan(ws, plan: RoundPlan)`; update imports from `gateway/contract` (`ActionFrame` → `PlanFrame`); step 5 of protocol flow: for each `STATE`, call `agent.getRoundPlan(state, budget)` and send `PLAN` frame.
- `src/agents/base.ts` — replace abstract `decide(state): AgentAction` with `getRoundPlan(state: MatchState, budget: AgentRoundBudget): RoundPlan | Promise<RoundPlan>`.
- `src/agents/greedy.ts` — emit `RoundPlan` with `bid ≤ apPool`, `freeMove`/`freeAction` chosen by existing heuristics, `extras: []`.
- `src/agents/random.ts` — emit `RoundPlan` with random bid in `[BID_MIN, apPool]`, random `freeMove`/`freeAction`, `extras: []`. Fallback is `{ bid: 0, extras: [] }` when state is degenerate.
- `src/public/arena.js` — rename `state.turnCap` → `state.roundCap` on lines 163, 166, 172, 173 (local var stays `latestTurnCap` for minimal diff, or rename to `latestRoundCap`; copy on line 172 preserved per Open Q #2).
- `src/public/demo-replay.js` — replace `const TURN_CAP = 48` with an import of `ROUND_CAP` from a shared constants export (or inline the numeric value from `constants.ts`); rename board prop from `turnCap` to `roundCap` on line 22.

### Runner Rewrite Shape

```ts
// src/runner/runner.ts — core loop (post-rewrite)
import { runRound } from "../engine/roundDriver";
import { validateRoundPlan } from "../gateway/validator";
import { newBudget, PASS_PLAN_CONST as PASS_PLAN } from "../engine/round-state";
import { ROUND_CAP } from "../engine/constants";

do {
  if (channels.a.closed || channels.b.closed) return forfeit(...);
  if (round >= ROUND_CAP) return timeout(...);

  const publicState = { ...state, roundCap: ROUND_CAP };
  channels.a.send({ state: publicState, budget: budgetA });
  channels.b.send({ state: publicState, budget: budgetB });

  const [planA, planB] = await Promise.all([
    withTimeout(channels.a.receivePlan(), turnTimeoutMs, () => PASS_PLAN),
    withTimeout(channels.b.receivePlan(), turnTimeoutMs, () => PASS_PLAN),
  ]);

  const invalidA = validateRoundPlan(planA, "A", state, budgetA);
  const invalidB = validateRoundPlan(planB, "B", state, budgetB);
  if (!invalidA.ok) return forfeitOn("A", invalidA);
  if (!invalidB.ok) return forfeitOn("B", invalidB);

  const result = runRound({ matchId, round, state, planA, planB, budgetA, budgetB });
  state = result.nextState;
  budgetA = result.nextBudgetA;
  budgetB = result.nextBudgetB;
  persistRoundEvents(result.events, matchId, seq);
  seq += result.events.length;
  round++;
} while (!result.ended);
```

`PASS_PLAN` is exported from `round-state.ts` as `{ bid: 0, extras: [] }` — the safe timeout fallback.

### Contract Reconciliation in match.ts

`makeUnits` produces contract-shaped units:
- `type: "infantry" | "scout" | "heavy"` (the existing `"cavalry"` role is retired; starting army = two infantry + one scout per side, matching `STARTING_UNITS = 3`).
- `hp: DEFAULT_HP[type]`, `strength: DEFAULT_STRENGTH[type]`, `weight: DEFAULT_WEIGHT[type]`.
- `id: deterministicId(owner, pos)`.

`makeBoard` emits `terrain: "plain"` (singular). `HexCell` loses `elevation` and default `controlledBy: null`; contract `controlledBy?` is optional and omitted when absent.

`createMatch` sets `roundCap: ROUND_CAP` on the returned state.

### Legacy Deletion Checklist

- `src/shared/types.ts`: `AgentAction`, `AgentActionType`, `TURN_CAP`, `MatchState.yourTurn`
- `src/engine/match.ts`: `stepMatch` export (function removed entirely)
- `src/engine/turns.ts`: file removed
- `src/engine/round-state.ts`: `roundEndCarryover` export (function removed entirely)
- `src/runner/runner.ts`: `TurnEngine` class
- `src/orchestrator/match-runner.ts:27`: `const TURN_CAP = 150` shadow; `opts.turnCap` field
- `src/gateway/validator.ts`: `validateAction`, `validateActionRaw`, legacy `Action` whitelist
- `src/gateway/contract.ts`: `ActionFrame` type; `AgentAction` export
- `src/gateway/protocol.ts`: `validateActionFrame`; `'ACTION'` case in `isValidFrame`
- `src/public/demo-replay.js:3`: `const TURN_CAP = 48`
- Tests: `tests/gateway/validator-raw.test.ts`, `tests/gateway/validator.test.ts`, `tests/engine/validator.test.ts`, `src/engine/turns.test.ts`, `src/engine/match.test.ts::stepMatch` suites — all removed; coverage migrates to `roundDriver.test.ts`, `extras-disallowed.test.ts`, and new `validator/validate-round-plan.test.ts` (if not already present).

### Unit Tests

- `runner.test.ts`:
  - two happy-path rounds: state advances, events persist, budgets update
  - parallel agent timeout → both agents receive `PASS_PLAN`, round resolves
  - one-side timeout → opposite side wins by timeout
  - channel close mid-round → forfeit
  - `ROUND_CAP` hit → `timeout` outcome
  - invalid `RoundPlan` (e.g., non-empty extras) → forfeit with `EXTRAS_NOT_IMPLEMENTED` reason
  - emitted `state.roundCap === ROUND_CAP` in every frame
- `match-runner.test.ts`:
  - session protocol emits `{ state, budget }` frames
  - receives `{ plan }` frames (now `PLAN` frame type)
  - persists `round_resolved` event per round with ordered event list
  - no `turnCap` opts field accepted
- `match.test.ts`:
  - `createMatch` returns units with contract shape (`type`, `hp`, `strength`, `weight`)
  - `createMatch` returns board with `"plain"` terrain spelling
  - `createMatch` returns `state.roundCap === ROUND_CAP`
  - no `stepMatch` export (deletion regression lock)
- `agents/greedy.test.ts`, `agents/random.test.ts`:
  - emit `RoundPlan` with `bid >= 0` and `bid ≤ apPool`
  - `extras` is always `[]`
  - random agent emits `{ bid: 0, extras: [] }` when state degenerate
- `gateway/protocol.test.ts`:
  - `PLAN` frame validates; `ACTION` frame rejected (regression lock on deletion)
  - `isValidFrame` dispatcher exhaustively covers `HELLO | STATE | ACK | EVENT | END | READY | PLAN`
- `agents/runner.test.ts` (agent-host):
  - on `STATE` frame, calls `agent.getRoundPlan(state, budget)` and sends `PLAN` frame
  - no `sendAction` export remains

## Integration Contract (post-cutover, verified)

- `runner.ts` loops over `roundDriver.runRound` up to `ROUND_CAP`.
- `roundDriver.runRound` is the sole consumer of `bidResolver`, `findRetarget`, `applyCarryover`, `applyEndOfRound`, `deductBid`, and the aim-penalty path of `resolveCombat`.
- Agent SDK emits `RoundPlan` only; `AgentAction` does not exist.
- `validateRoundPlan` runs at the runner boundary; any plan with non-empty extras is rejected by `validateExtrasDisallowed` and the agent forfeits.
- Engine events flow: `runRound` returns `EngineEvent[]` → runner persists via `appendEvents` → UI consumes via existing `event-log.js`.
- UI reads `state.roundCap` (populated by runner); `turnCap` does not appear in any surface.

### Orphan Trace (verified exhaustively)

| Module / Export | Sole runtime consumer |
|---|---|
| `bidResolver.resolveBids` | `roundDriver.runRound` |
| `retarget.findRetarget` | `roundDriver.runAgent` |
| `round-state.applyEndOfRound` | `roundDriver.runRound` |
| `round-state.applyCarryover` | `roundDriver.runRound` |
| `round-state.deductBid` | `roundDriver.runRound` |
| `round-state.newBudget` | `runner.ts` (match init) |
| `combat.resolveCombat` (aim-penalty path) | `roundDriver.runAgent` |
| `validator.extras-disallowed.validateExtrasDisallowed` | `gateway/validator.validateRoundPlan` |
| `gateway/validator.validateRoundPlan` | `runner.ts` |
| `roundDriver.runRound` | `runner.ts` |
| `runner.ts` (MatchRunner) | `orchestrator/match-runner.ts`; matchmaker |

Zero exported symbol in the round-economy substrate is left unimported.

## Razor Compliance

| Check | Limit | Proposed max | Status |
|-------|------:|-------------:|:------:|
| Max function lines | 40 | `runRound` ~28; `runAgent` ~35; runner core loop ~30 | PASS |
| Max file lines | 250 | `roundDriver.ts` ~110; `runner.ts` ~180; `extras-disallowed.ts` ~15 | PASS |
| Max nesting depth | 3 | `runAgent` 2; runner loop 2 | PASS |
| Nested ternaries | 0 | 0 | PASS |
