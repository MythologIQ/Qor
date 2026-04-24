# Plan: HexaWars Plan D v2 — Phases 3–5 (Round Economy Finish)

> Tight implementation phase targeting the highest-complexity unmerged components of the round economy: bidding resolution, aim-penalty retargeting, and free-slot economy with skip-for-AP trade.

## Locked Design Decisions

- **Scope**: Plan D v2 Phases 3, 4, 5 as one implementation phase. Phase 1 substrate and Phase 2 validator decompose are already sealed and committed.
- **Bid resolver placement**: new module `src/engine/bidResolver.ts` as a pure function. No braiding with validator or orchestrator.
- **Interrupt semantics**: when a lower-bidder's action target is removed or relocated by a higher-bidder's prior action, the action **auto-retargets if a legal equivalent target exists** within range (subject to aim-penalty). If no legal target exists, the action is **wasted** — AP spent, no effect.
- **Aim-penalty shape**: penalty is derived from a new `weight` stat on the unit spec (`light=1, medium=2, heavy=3`). Damage reduction = `weight × 20%`.
- **Free-slot semantics**: strict `freeMove` and `freeAction` slots per unit per round, with **skip-for-AP trade** — each unused free slot at round-end refunds `+1 AP` to the agent pool, bounded by `AP_CAP (4)`.

## Open Questions

1. **Tie-break seed source** — the resolver must be deterministic when bid values are equal. The plan uses `matchId + roundNumber` as the seed input to a stable hash; if an alternative seed source is preferred (e.g., engine PRNG state), flag before audit.
2. **Retarget scan order** — when multiple legal alternate targets exist, the plan prefers "closest enemy unit within the attacker's original declared range, breaking ties by lowest unit id." If a different preference is required (e.g., lowest HP), flag before audit.
3. **`weight` default for existing types** — defaulting `scout → light`, `infantry → medium`, `heavy → heavy`. Confirm before audit if any type should shift.

## Phase 3: Bid Resolver

### Affected Files

- `src/engine/bidResolver.ts` — new pure module; resolves two simultaneous bids into an ordered execution list and flags interrupt candidates.
- `src/shared/types.ts` — append `ResolvedBidOrder` and `BidResolverInput` types; no mutations to existing types.
- `src/engine/bidResolver.test.ts` — new unit tests.

### Changes

```ts
// src/shared/types.ts — additive
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

The resolver does **not** consume AP — Phase 1's `deductBid` is called by the orchestrator, not by the resolver. The resolver is a pure ordering function only.

### Unit Tests

- `src/engine/bidResolver.test.ts`
  - higher bid wins, both directions
  - tie with same `matchId`/`round` produces the same winner on repeat calls (determinism)
  - tie with different `round` flips winner (proves round is in the seed)
  - tie with different `matchId` produces independent winner (proves isolation)
  - `tieBroken` flag is false on strict inequality, true on equality
  - zero-vs-zero is handled as a tie, not a skip

## Phase 4: Aim-Penalty & Auto-Retarget

### Affected Files

- `src/shared/types.ts` — append `UnitWeight` type and `weight` field on `Unit`.
- `src/engine/units.ts` — add `DEFAULT_WEIGHT` map; set on `createUnit`.
- `src/engine/retarget.ts` — new pure module: finds an alternate legal target or returns `null`.
- `src/engine/combat.ts` — extend `resolveCombat` with an optional `aimPenalty: number` parameter (0..1 multiplier on attacker damage).
- `src/engine/retarget.test.ts` — new unit tests.
- `src/engine/combat.test.ts` — new or extended tests for aim-penalty path.

### Changes

```ts
// src/shared/types.ts — additive
export type UnitWeight = 1 | 2 | 3; // 1=light, 2=medium, 3=heavy
export interface Unit { /* existing fields */; weight: UnitWeight; }
```

```ts
// src/engine/units.ts — additive
const DEFAULT_WEIGHT: Record<UnitType, UnitWeight> = {
  scout: 1,
  infantry: 2,
  heavy: 3,
};
// createUnit returns { ...existing, weight: DEFAULT_WEIGHT[type] }
```

```ts
// src/engine/retarget.ts — pure
import type { Unit, CubeCoord } from "../shared/types";
import { RANGE } from "./constants";

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
// src/engine/combat.ts — extend
export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  terrain: HexCell["terrain"],
  aimPenalty = 0,
): CombatResult {
  const atkDmgRaw = attacker.strength;
  const reduced = Math.round(atkDmgRaw * (1 - aimPenalty));
  const atkDmg = terrain === "mountain" ? 0 : reduced;
  /* existing retaliation & destroyed logic unchanged, using atkDmg */
}
```

Aim penalty is passed in by the round orchestrator when a retarget fires: `aimPenalty = attacker.weight * 0.2`. For direct (non-retargeted) attacks, the orchestrator passes `0`, preserving current combat behavior.

### Unit Tests

- `src/engine/retarget.test.ts`
  - returns `null` when no enemy within range
  - returns `null` when the only enemy in range is the original target
  - prefers closer alternate target over farther one
  - tie on distance breaks by lowest unit id
  - excludes units outside range
- `src/engine/combat.test.ts`
  - `aimPenalty = 0` matches current behavior (regression lock)
  - `aimPenalty = 0.2` reduces attacker damage by 20% rounded
  - `aimPenalty = 0.6` with mountain defender still zeroes attacker damage (mountain shield dominates)
  - defender retaliation is unchanged by aim-penalty
  - edge: `aimPenalty = 1.0` drops attacker damage to 0 even on plain terrain
- `src/engine/units.test.ts` (new or extended)
  - `createUnit` assigns `weight: 1` to scouts, `2` to infantry, `3` to heavy
  - `weight` is stable across repeated calls with same `(owner, pos, type)`

## Phase 5: Free-Slot Economy & Skip-for-AP Trade

### Affected Files

- `src/engine/round-state.ts` — add `applyEndOfRound(current)`: refunds unused slots, then carries over.
- `src/shared/types.ts` — no new types; existing `AgentRoundBudget` already covers shape.
- `src/engine/round-state.test.ts` — new unit tests.

### Changes

```ts
// src/engine/round-state.ts — append
import { AP_CAP, MAX_CARRY } from "./constants";

/**
 * End-of-round resolution:
 *   1. Each unused free slot refunds +1 AP to the pool (bounded by AP_CAP).
 *   2. apCarry = min(apPool, MAX_CARRY) after refund.
 * Does not mutate `current`.
 */
export function applyEndOfRound(current: AgentRoundBudget): AgentRoundBudget {
  const refund = (current.freeMove > 0 ? 1 : 0) + (current.freeAction > 0 ? 1 : 0);
  const apPoolAfter = Math.min(current.apPool + refund, AP_CAP);
  const apCarry = Math.min(Math.max(apPoolAfter, 0), MAX_CARRY);
  return { freeMove: 0, freeAction: 0, apPool: apPoolAfter, apCarry };
}
```

`applyCarryover` (Phase 1) remains the start-of-round resetter and consumes `apCarry`. `applyEndOfRound` is its round-end counterpart and is the **only** site that computes refunds. Orchestrator calls: `start → applyCarryover` then `end → applyEndOfRound`, and the result's `apCarry` feeds the next round.

### Unit Tests

- `src/engine/round-state.test.ts`
  - both slots unused → refund +2, capped at `AP_CAP`
  - only move slot unused → refund +1
  - only action slot unused → refund +1
  - both slots used → refund 0
  - refund does not exceed `AP_CAP` when `apPool` already at cap
  - `apCarry` after refund equals `min(apPool, MAX_CARRY)`
  - `applyCarryover(applyEndOfRound(x))` composes cleanly: new round starts with fresh slots and correct pool
  - edge: zero apPool at round-end with both slots used stays at zero with `apCarry = 0`

## Integration Contract (non-code)

The three phases above are independent modules; they compose through an orchestrator that will be introduced in a later plan. For this implementation phase, the contract is:

- `bidResolver` is called once per round with both agents' submitted plans, producing `{ first, tieBroken }`.
- Actions execute in the order dictated by the resolver. Before each action fires, the orchestrator checks whether the action's target is still valid.
- If invalid, the orchestrator calls `findRetarget` with the attacker, original target, current enemy unit list, and the attacker's declared range.
  - If a target is returned, the orchestrator calls `resolveCombat` with `aimPenalty = attacker.weight * 0.2`.
  - If `null` is returned, the action is wasted (AP already spent, no combat resolution).
- After both agents' actions resolve, the orchestrator calls `applyEndOfRound` on each agent's budget, then `applyCarryover` at the start of the next round.

No phase in this plan introduces the orchestrator. That wiring is a separate implementation plan.
