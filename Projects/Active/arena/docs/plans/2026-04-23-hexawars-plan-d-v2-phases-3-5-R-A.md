# Plan: HexaWars Plan D v2 — Phases 3–5 (R-A Cutover)

> Single-phase implementation of the Plan D v2 round-economy cutover. Replaces the VETO-ed 2026-04-23 blueprint under remediation **R-A**: honor the Phase 3 atomic cutover committed in the governing Plan D v2 blueprint. All pure modules become runtime-connected by construction; `AgentAction` / `AgentActionType` / `validateAction` / `TURN_CAP` are deleted.

## Governing Context

- Governing blueprint: `docs/plans/2026-04-22-hexawars-plan-d-round-economy-v2.md` (task-194 atomic cutover).
- Prior audit VETO: `.agent/staging/AUDIT_REPORT.md` (2026-04-23T06:15Z). Violations V1, V2, V3 (orphan expansion + roadmap regression).
- Phase 1 substrate sealed: `round-state.ts`, constants (`BASE_AP`, `AP_CAP`, `MAX_CARRY`, `ROUND_CAP`, `BID_MIN`, `MOVE_POINTS`, `RANGE`).
- Phase 2 substrate sealed: `gateway/validator/*` + `validateRoundPlan` aggregator.
- This plan collapses the original Phases 3/4/5 into one implementation phase with three internal stacks (A, B, C) that ship together as one tribunal package.

## Locked Design Decisions

1. **Orchestrator placement**: new pure module `src/engine/roundDriver.ts` exports `runRound(input)` → `{ events, nextState, nextBudgets }`. Runner holds I/O; driver is pure.
2. **Agent-invocation shape**: one `getRoundPlan(state, budget)` call per agent per round, invoked in parallel via `Promise.all`.
3. **Deletion scope**: delete `AgentAction`, `AgentActionType`, `validateAction`, `validateActionRaw`, `TURN_CAP`, and the `yourTurn` field on `MatchState`. Keep `EngineEventType` vocabulary.
4. **Round-loop shape**: strict serialization by bid winner — winner's entire `RoundPlan` resolves (freeMove → freeAction → extras), then loser's entire plan. Interrupt check fires only against the loser's declared targets (which may have moved/died from winner's actions).
5. **Event emission**: extend `EngineEventType` union with `"action_retargeted"` and `"slots_refunded"`. `roundDriver.runRound` returns `EngineEvent[]`.
6. **Contract reconciliation**: the cutover also brings `src/engine/match.ts` and `src/engine/turns.ts` into line with the frozen `shared/types.ts` contract (unit `type`/`hp`/`strength 1-10`, terrain `"plain"`). This was tolerated while `AgentAction` drove matches; under `RoundPlan` the new pipeline requires contract-shaped units.

## Open Questions

1. **Extras execution order within a `RoundPlan`**: this plan resolves `extras` in array order as declared by the agent. If a deterministic canonical order (e.g., sort by `kind` then `unitId`) is required for replay stability, flag before audit.
2. **Reserve overwatch fire timing**: `reserve_overwatch` extras are staged on round N for round N+1 per `ReserveRecord.appliesOnRound`. This plan fires them at the start of `runRound` before bid resolution. If a different timing is preferred (e.g., interleaved into the serialized plan execution), flag before audit.
3. **Terrain name reconciliation**: contract says `"plain"`, runtime says `"plains"`. This plan migrates to `"plain"` (singular, matches contract). If the runtime spelling should win instead, flag before audit.

## Phase A: Pure Modules + Unit Shape

Additive-only changes. After this phase, all pure modules exist but none are yet runtime-wired (Phase A is the foundation Phase B/C consume).

### Affected Files

- `src/shared/types.ts` — append `UnitWeight`, `BidResolverInput`, `ResolvedBidOrder`; add `weight` field on `Unit`; extend `EngineEventType` with `"action_retargeted"` and `"slots_refunded"`.
- `src/engine/units.ts` — add `DEFAULT_WEIGHT` map; set on `createUnit`.
- `src/engine/bidResolver.ts` — **new** pure module.
- `src/engine/retarget.ts` — **new** pure module.
- `src/engine/round-state.ts` — append `applyEndOfRound`.
- `src/engine/combat.ts` — extend `resolveCombat` with `aimPenalty` parameter (default 0).
- `src/engine/bidResolver.test.ts` — **new** unit tests.
- `src/engine/retarget.test.ts` — **new** unit tests.
- `src/engine/round-state.test.ts` — extend with `applyEndOfRound` tests.
- `src/engine/combat.test.ts` — extend with aim-penalty tests.
- `src/engine/units.test.ts` — extend with `weight` tests.

### Changes

```ts
// src/shared/types.ts — additive
export type UnitWeight = 1 | 2 | 3; // 1=light, 2=medium, 3=heavy
export interface Unit { /* existing */; weight: UnitWeight; }

export interface BidResolverInput {
  matchId: string;
  round: number;
  agentA: { bid: number; plan: RoundPlan };
  agentB: { bid: number; plan: RoundPlan };
}

export interface ResolvedBidOrder {
  round: number;
  first: "A" | "B";
  bidA: number;
  bidB: number;
  tieBroken: boolean;
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
  attacker: Unit;
  originalTarget: CubeCoord;
  enemyUnits: Unit[];
  range: number;
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
// src/engine/round-state.ts — append
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

### Unit Tests

- `bidResolver.test.ts`:
  - higher bid wins, both directions
  - tie with same `matchId`/`round` produces same winner (determinism)
  - tie with different `round` flips winner (proves round in seed)
  - tie with different `matchId` isolates winner
  - `tieBroken` false on strict inequality, true on equality
  - zero-vs-zero handled as tie
- `retarget.test.ts`:
  - `null` when no enemy within range
  - `null` when only enemy in range is the original target
  - prefers closer alternate target
  - tie on distance breaks by lowest `unit.id`
  - excludes units outside range
- `round-state.test.ts` (extend):
  - both slots unused → refund +2, capped at `AP_CAP`
  - one slot unused → refund +1
  - both used → refund 0
  - `apCarry = min(apPoolAfter, MAX_CARRY)`
  - refund does not exceed `AP_CAP` when pool at cap
  - composition: `applyCarryover(applyEndOfRound(x))` yields fresh-slot new-round budget
- `combat.test.ts` (extend):
  - `aimPenalty = 0` matches current behavior (regression lock)
  - `aimPenalty = 0.2` reduces damage by 20% rounded
  - `aimPenalty = 0.6` with mountain defender still zeroes damage
  - defender retaliation unchanged by aim-penalty
  - `aimPenalty = 1.0` drops damage to 0 on plain terrain
- `units.test.ts` (extend):
  - `createUnit` assigns `weight: 1` to scouts, `2` to infantry, `3` to heavy
  - `weight` stable across repeated calls with same `(owner, pos, type)`

## Phase B: roundDriver (Pure Runtime Seam)

Introduces the pure runtime seam that composes Phase A modules. `roundDriver.runRound` is the sole consumer of `bidResolver`, `findRetarget`, `applyEndOfRound`, and the aim-penalty combat path. After this phase, all Phase A modules are runtime-connected by construction (even though the runner hasn't yet been rewritten — Phase C handles that).

### Affected Files

- `src/engine/roundDriver.ts` — **new** pure module; composes Phase A.
- `src/shared/types.ts` — append `RunRoundInput`, `RunRoundResult`.
- `src/engine/roundDriver.test.ts` — **new** integration-style unit tests over pure driver.

### Changes

```ts
// src/shared/types.ts — additive
export interface RunRoundInput {
  matchId: string;
  round: number;
  state: MatchState;
  planA: RoundPlan;
  planB: RoundPlan;
  budgetA: AgentRoundBudget;
  budgetB: AgentRoundBudget;
}

export interface RunRoundResult {
  events: EngineEvent[];
  nextState: MatchState;
  nextBudgetA: AgentRoundBudget;
  nextBudgetB: AgentRoundBudget;
  ended: boolean;
}
```

```ts
// src/engine/roundDriver.ts — pure
import { resolveBids } from "./bidResolver";
import { findRetarget } from "./retarget";
import { resolveCombat } from "./combat";
import { applyCarryover, applyEndOfRound, deductBid } from "./round-state";
import { RANGE } from "./constants";
import { checkVictory } from "./victory";
import type {
  RunRoundInput, RunRoundResult, EngineEvent, MatchState, Unit,
  AgentRoundBudget, RoundPlan, FreeMovePlan, FreeActionPlan,
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
    ? runAgent("A", input.planA, input.state, startA, input.matchId, input.round)
    : runAgent("B", input.planB, input.state, startB, input.matchId, input.round);
  const secondAgent = order.first === "A" ? "B" : "A";
  const secondPlan = order.first === "A" ? input.planB : input.planA;
  const secondStart = order.first === "A" ? startB : startA;
  const second = runAgent(secondAgent, secondPlan, first.state, secondStart, input.matchId, input.round);
  const budgetA = applyEndOfRound(order.first === "A" ? first.budget : second.budget);
  const budgetB = applyEndOfRound(order.first === "A" ? second.budget : first.budget);
  const events = [...first.events, ...second.events, ...refundEvents(input.budgetA, budgetA, input.budgetB, budgetB, input.round)];
  const victory = checkVictory(second.state);
  return { events, nextState: second.state, nextBudgetA: budgetA, nextBudgetB: budgetB, ended: victory.winner !== null };
}
```

`runAgent(agent, plan, state, budget, matchId, round)` is a local helper (≤40 lines) that executes one agent's `RoundPlan` on the current state:
1. If `plan.freeMove` present, apply it (delegates to `movement.applyMove`).
2. If `plan.freeAction` present, resolve target: if target valid, call `resolveCombat(attacker, defender, terrain, 0)`; if target missing or moved, call `findRetarget(...)` — if a new target returns, `resolveCombat(attacker, newDefender, terrain, attacker.weight * 0.2)` and emit `action_retargeted` event; if `null`, action is wasted.
3. Iterate `plan.extras` in declared array order, dispatching by `kind` (existing extras logic is outside this plan's scope beyond wiring).

`refundEvents(prevA, nextA, prevB, nextB, round)` emits one `slots_refunded` event per agent whose `apPool` increased.

### Unit Tests

- `roundDriver.test.ts`:
  - bid tie resolves deterministically with `matchId`/`round` seed
  - winner's freeMove fires before loser's freeAction (serialization order)
  - loser's freeAction retargets when winner's freeMove removed the loser's declared target → emits `action_retargeted` with `aimPenalty = attacker.weight * 0.2`
  - loser's freeAction is wasted (AP spent, no combat event) when no legal retarget exists
  - both agents use both free slots → `applyEndOfRound` refunds 0 → no `slots_refunded` event
  - both agents skip both free slots → refund +2 each → two `slots_refunded` events (one per agent)
  - `ended = true` when `checkVictory` returns a winner after the round
  - pure: identical inputs produce identical `{ events, nextState, nextBudget* }` across 100 invocations
  - `nextState.turn` equals `input.round + 1` (round index advances)

## Phase C: Runner Rewrite + Legacy Deletion

Connects `roundDriver` to the agent bridge and deletes the legacy per-turn `AgentAction` path. After this phase, the substrate is reachable from `runner.ts` and no orphan remains on the production build surface.

### Affected Files

- `src/runner/runner.ts` — **rewrite**: drive `RoundPlan` rounds via `roundDriver.runRound`; parallel agent invocation.
- `src/runner/types.ts` — update `AgentChannel` to send `{ state, budget }` frames and receive `{ plan }` frames.
- `src/orchestrator/match-runner.ts` — update to consume the rewritten runner; propagate `RoundPlan` through session protocol.
- `src/engine/match.ts` — reconcile `createMatch` to contract unit shape (`type`/`hp`/`strength 1-10`, terrain `"plain"`); **delete** `stepMatch` (superseded by `roundDriver.runRound`).
- `src/engine/turns.ts` — **delete** (superseded by `roundDriver.runRound`).
- `src/shared/types.ts` — **delete** `AgentAction`, `AgentActionType`, `TURN_CAP`, `yourTurn` field on `MatchState`.
- `src/gateway/validator.ts` — **delete** `validateAction`, `validateActionRaw`, legacy `Action` whitelist. Keep `validateRoundPlan`.
- `src/gateway/contract.ts` — update `EventFrame` type union to current `EngineEventType`.
- `src/agents/base.ts` — replace `getAction(state)` with `getRoundPlan(state, budget)`.
- `src/agents/greedy.ts` — replace action emission with `RoundPlan` emission (bid, freeMove, freeAction).
- `src/agents/random.ts` — replace action emission with `RoundPlan` emission.
- `src/engine/match.test.ts` — update to new `createMatch` shape; delete `stepMatch` tests (coverage moves to `roundDriver.test.ts`).
- `src/engine/turns.test.ts` — **delete**.
- `src/runner/runner.test.ts` — update to `RoundPlan`-based channel mocks.
- `src/orchestrator/match-runner.test.ts` — update to `RoundPlan`-based session mocks.
- `src/agents/greedy.test.ts`, `src/agents/random.test.ts` — update to `RoundPlan` assertions.
- `tests/smoke/plan-b.test.ts` — update `turn_action` fixture to `round_resolved` shape.

### Runner Rewrite Shape

```ts
// src/runner/runner.ts — core loop (post-rewrite)
do {
  if (channels.a.closed || channels.b.closed) return forfeit(...);
  if (round >= ROUND_CAP) return timeout(...);

  channels.a.send({ state: publicStateFor("A", state), budget: budgetA });
  channels.b.send({ state: publicStateFor("B", state), budget: budgetB });

  const [planA, planB] = await Promise.all([
    withTimeout(channels.a.receivePlan(), turnTimeoutMs, () => PASS_PLAN),
    withTimeout(channels.b.receivePlan(), turnTimeoutMs, () => PASS_PLAN),
  ]);

  const invalidA = validateRoundPlan(planA, "A", state, budgetA);
  const invalidB = validateRoundPlan(planB, "B", state, budgetB);
  if (invalidA) return forfeitOn("A", invalidA);
  if (invalidB) return forfeitOn("B", invalidB);

  const result = runRound({ matchId, round, state, planA, planB, budgetA, budgetB });
  state = result.nextState;
  budgetA = result.nextBudgetA;
  budgetB = result.nextBudgetB;
  persistRoundEvents(result.events, matchId, seq);
  seq += result.events.length;
  round++;
} while (!result.ended);
```

`PASS_PLAN` is the constant `{ bid: 0, extras: [] }` — no bid, no moves, no actions.

### Contract Reconciliation in match.ts

`makeUnits` produces contract-shaped units:
- `type: "infantry" | "scout" | "heavy"` (existing `"cavalry"` role is retired; starting army is two infantry + one scout per side, matching `STARTING_UNITS = 3`).
- `hp: DEFAULT_HP[type]`, `strength: DEFAULT_STRENGTH[type]`, `weight: DEFAULT_WEIGHT[type]`.
- `id: deterministicId(owner, pos)` (already the units.ts pattern).

`makeBoard` emits `terrain: "plain"` (singular, contract spelling). `HexCell` loses `elevation` and the `controlledBy: null` default; contract `controlledBy?` is optional and omitted when absent.

### Legacy Deletion Checklist

- `AgentAction` interface — removed from `types.ts`.
- `AgentActionType` union — removed from `types.ts`.
- `TURN_CAP` constant — removed from `types.ts` (runner uses `ROUND_CAP` from `constants.ts`).
- `yourTurn` field on `MatchState` — removed (rounds are symmetric, no per-turn activation).
- `validateAction` / `validateActionRaw` — removed from `gateway/validator.ts`.
- `stepMatch` — removed from `match.ts`.
- `turns.ts` — file removed.
- `TurnEngine` class in `runner.ts` — removed (runner loops directly over `runRound`).

### Unit Tests

- `runner.test.ts`:
  - two happy-path rounds: state advances, events persist, budgets update
  - parallel agent timeout → both side falls through with `PASS_PLAN`, round still resolves
  - one side timeout → opposite side wins by timeout
  - channel close mid-round → forfeit
  - `ROUND_CAP` hit → `timeout` outcome
  - invalid `RoundPlan` from an agent → forfeit with validation error reason
- `match-runner.test.ts`:
  - session protocol emits `{ state, budget }` frames
  - receives `{ plan }` frames from agent sessions
  - persists `round_resolved` event per round with ordered event list
- `match.test.ts`:
  - `createMatch` returns units with contract shape (`type`, `hp`, `strength`, `weight`)
  - `createMatch` returns board with `"plain"` terrain spelling
  - no `stepMatch` export (deletion regression lock)
- `greedy.test.ts`, `random.test.ts`:
  - agents emit `RoundPlan` with non-negative `bid ≤ apPool`
  - random agent produces `{ bid: 0, extras: [] }` as safe fallback when state is degenerate

## Integration Contract (post-cutover, verified)

After Phases A+B+C ship:
- `runner.ts` loops over `roundDriver.runRound` up to `ROUND_CAP`; no other module consumes `AgentAction`.
- `roundDriver.runRound` is called exactly once per round; it is the sole consumer of `bidResolver`, `findRetarget`, `applyCarryover`, `applyEndOfRound`, `deductBid`, and the aim-penalty path of `resolveCombat`.
- Agent SDK emits `RoundPlan` only; `AgentAction` does not exist.
- `validateRoundPlan` runs on each agent's plan at the runner boundary before `runRound`.
- Engine events flow: `runRound` returns `EngineEvent[]` → runner persists via `appendEvents` → UI consumes via existing `event-log.js` pipeline (no UI change required; `event-log.js` is type-agnostic).
- Orphan trace: every pure module added in Phase A has exactly one runtime importer (Phase B's driver); the driver has exactly one runtime importer (Phase C's runner); the runner has a runtime importer (`match-runner.ts`, matchmaker).

## Razor Compliance

| Check | Limit | Proposed max | Status |
|-------|------:|-------------:|:------:|
| Max function lines | 40 | `runRound` ~28; `runAgent` (helper) ~35; `resolveBids` ~10; `findRetarget` ~15; `applyEndOfRound` ~6; runner main loop extracted into `runOneRound` helper ~30 | PASS |
| Max file lines | 250 | `roundDriver.ts` ~110; `bidResolver.ts` ~25; `retarget.ts` ~30; `round-state.ts` ~55; `runner.ts` (post-rewrite) ~180 | PASS |
| Max nesting depth | 3 | `runAgent` depth 2; `runRound` depth 1; runner loop depth 2 | PASS |
| Nested ternaries | 0 | 0 | PASS |
