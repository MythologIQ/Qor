# Plan D v2: HexaWars Round Economy (Audit-Remediated)

> Supersedes `2026-04-22-hexawars-plan-d-round-economy.md` (v1). Authored after `/qor-audit` returned VETO with three Razor violations (V1–V4) and five spec gaps (G1–G5). v2 applies R1–R4 decomposition / trust lock-in and writes the missing decision lock-ins as final design choices. No new design debate; every change here is either a mechanical decomposition, a cleanup pseudocode line the audit asked for, or a pre-locked design decision from `/qor-plan` Q&A on 2026-04-22.

## Goal

Same as v1: replace the legacy "one unit acts per turn" loop with an RTS-style round economy.

- A "round" replaces a "turn." Both agents act per round.
- Each agent receives **1 free move + 1 free action + 3 AP per round**, spendable across any owned units.
- Both agents submit a sealed `bid + RoundPlan` simultaneously. Bid AP determines resolution priority; bid AP is burned regardless of outcome.
- Four AP spend options: boosted ability, second attack, defensive stance, reserve overwatch.
- Reserve overwatch can interrupt and waste an opponent's action.
- Match ends at round 50.

This plan supersedes Plan A Phase 6 (Action Contract Migration). See **G5 / Plan A Phase 6 Supersession Lock-In** below for the conditional reconciliation rule.

## Non-Goals

Unchanged from v1:

- No new unit types. Roster stays `recon`, `raider`, `interceptor`, `siege`, `captain`.
- No per-unit ability rewrites. AP boost only modifies the round's ability invocation.
- No board-radius change (Plan C handles that).
- No item / inventory system (Plan B handles that).
- No new operator-facing surfaces (registration, brackets, leaderboard).
- No model-side wire format changes; only the engine's agent contract changes.
- No spectator UI overhaul. UI updates are limited to rounds, bids, AP, reserves, and rushed-shot indicators.
- **No new probabilistic combat mechanics.** Combat stays 100% deterministic. Rushed-shot retarget (G1) reuses the existing damage-modulation primitive — no hit-chance roll. A general "terrain/positioning hit chance" overhaul is explicitly deferred to a future Plan E.

## Open Questions

None. All gaps from the v1 audit are resolved below.

## Decision Lock-Ins (Builder MUST follow exactly)

All v1 lock-ins remain in force unless restated here. New lock-ins from the v1 audit are tagged with their gap ID.

### Carried from v1 (unchanged)

- **Round vs. turn rename.** Engine renames `turn` → `round` everywhere. `TURN_CAP = 50` becomes `ROUND_CAP = 50` in `src/engine/constants.ts`. The `turn_ended` event becomes `round_ended`. The `currentTurn` field on `MatchState` becomes `currentRound`. No backwards-compatibility shim.
- **Per-agent budget.** At round start: `freeMove: 1`, `freeAction: 1`, `apPool: 3`, `apCarry: 0`. Carryover adds to `apPool` up to a hard cap of `4`. Unspent AP at round end is added to `apCarry` for next round, capped at `1` rolled forward. AP is per-agent, not per-unit.
- **Free move.** Exactly one move per round, on any owned unit, costing zero AP. Movement budget = `MOVE_POINTS[type]`.
- **Free action.** Exactly one `attack` or `ability` per round, on any owned unit, costing zero AP. Need not be the same unit as the free move.
- **AP spend options.** Exactly four: `boosted_ability` (1 AP), `second_attack` (2 AP), `defensive_stance` (1 AP), `reserve_overwatch` (2 AP). Banking is the Reserve mechanic itself.
- **Bid mechanic.** Both agents submit `{ bid, plan }` sealed; higher bid wins, ties resolved by `seededCoinFlip(matchId, round)`. Bid AP deducted on submission, burned regardless of outcome.
- **Resolution order (per round, after bids revealed).** Reserve triggers → free moves → free actions → AP extras → defensive stances applied → reserved overwatch flagged → round end events emitted.
- **Reserve trigger semantics.** A reserved unit fires its overwatch when (a) an enemy attacks it, or (b) an enemy ends a movement step within `RANGE[type]`. First eligible trigger fires; subsequent triggers do not refire. Reserve fires before the triggering action resolves; if it kills the trigger source, the triggering action is wasted with no AP refund. Reserve does not invoke defender retaliation.
- **Action contract.** `RoundPlan` replaces `AgentAction`. The legacy `AgentAction` type is removed (not aliased). Pass = `{ bid: 0, extras: [] }` with no `freeMove` and no `freeAction`.
- **Backwards compatibility.** None. Demo fixtures and seeds are rewritten in Phase 6.
- **Engine-side AP enforcement.** All AP spend validated by the engine. Specific rejection rules listed below in Phase 2 changes.
- **Match length.** `ROUND_CAP = 50`. Win conditions (wipeout, ≥60% territory, runout-leader-at-cap) keep semantics; only the variable name `turn` → `round` updates.

### New lock-ins from v1 audit (tagged by gap ID)

- **G1 — Empty-target retarget (intelligent, deterministic).** When an attack action (free or AP-spent) resolves and its declared `to` hex no longer contains the originally-targeted enemy unit, the engine applies the following deterministic rule in fixed order:
  1. **Follow.** If the originally-targeted enemy unit is still alive AND now stands within `RANGE[attacker.type]` of `attacker.position` at resolution time → the attack proceeds against that unit at the unit's current position, **full damage**, normal defender retaliation, normal terrain modifiers. Emits `unit_attacked` with `originalTarget === actualTarget`.
  2. **Rushed shot.** Otherwise, if any other enemy unit is within `RANGE[attacker.type]` of `attacker.position` → the attacker fires at the **nearest** such enemy. Ties broken by canonical ascending `(q, r)` order on the candidate's `position`. Damage = `floor(attacker.strength / 2)`, minimum `1` (the "rushed aim" penalty). Defender retaliation is **unchanged** (defender deals full `defender.strength + terrain_defense`). Emits `action_retargeted` with `originalTarget`, `actualTarget`, `damage`, `reason: "rushed_shot"`.
  3. **No targets.** Otherwise → no damage dealt. Emits `action_wasted` with `reason: "no_target_in_range"`. AP is **not** refunded.

  Rationale: combat stays deterministic; `floor(strength / 2)` reuses the existing damage-modulation primitive, no probabilistic mechanic added. The penalty scales naturally with raw strength so heavy units (siege, captain) lose more raw damage when rushed, matching the "aim penalty" intuition.

- **G2 — Stance record cleanup.** `resolveRound` step 7 (`emitRoundEnd`) appends an explicit cleanup operation:
  > Remove every `StanceRecord` from `state.stances` whose `appliesOnRound <= currentRound` after the round's damage applications have already consumed the active stances. State invariant: at the start of any round `N`, `state.stances` contains only records with `appliesOnRound >= N`.

- **G3 — Reserve record cleanup.** Same as G2 for `state.reserves`. `resolveRound` step 7 (`emitRoundEnd`) appends:
  > Remove every `ReserveRecord` from `state.reserves` whose `appliesOnRound <= currentRound`, regardless of whether `fired` is `true` or `false`. State invariant: at the start of any round `N`, `state.reserves` contains only records with `appliesOnRound >= N`.

- **G4 — Bid AP burn for rejected plans.** When `validateRoundPlan` returns `{ ok: false }`, the loop converts the agent's plan to a forced pass (`{ bid: 0, extras: [] }` with no `freeMove`, no `freeAction`) **but the original `bid` AP is still deducted from the agent's `apPool` first**. The deduction order is:
  1. Compute `originalBid = submittedPlan.bid`.
  2. Run validation against the submitted plan.
  3. Deduct `originalBid` from `state.budgets[agent].apPool` regardless of validation result (clamped to ≥ 0; if the submitted bid exceeded `apPool` the deduction is capped at `apPool`, and validation will already have failed).
  4. If validation failed, replace the plan in memory with `{ bid: 0, extras: [] }` for resolution purposes.
  5. Emit `plan_rejected` with `{ agent, reason, originalBid, apBurned }`.

  Rationale: the bid was a sealed commitment. Allowing free retraction via deliberately invalid plans would let agents game initiative without cost.

- **G5 — Plan A Phase 6 supersession (conditional).** Plan D Phase 1 includes a one-time supersession step whose behavior depends on whether Plan A Phase 6 has shipped at the moment Plan D is dequeued:
  - **If Plan A Phase 6 HAS shipped:** keep the `path: CubeCoord[]` field on `unit_moved` events, keep the validator's `path` schema check, and keep the `MatchState.recentMovePath` exposure if A6 introduced one. Replace the `AgentAction` type with `RoundPlan` and remove A6's legacy single-action validator entry point in the same commit. Builder commit message: `builder tick NNN: plan-d-phase-1-substrate (A6-shipped path: keep)`.
  - **If Plan A Phase 6 has NOT shipped:** drop A6 entirely from the queue (mark A6 as `superseded_unstarted` in META_LEDGER). Plan D Phase 1 introduces `path` on the `freeMove` field of `RoundPlan` directly without going through the A6 transitional `AgentAction.path`. Builder commit message: `builder tick NNN: plan-d-phase-1-substrate (A6-unstarted: drop)`.
  - **Detection rule:** before starting Phase 1, builder runs `git log --oneline --grep="plan-a-phase-6" -- src/shared/types.ts src/persistence/match-store.ts`. If any commit matches → A6 shipped. Otherwise → A6 unstarted.

- **R4 — Validator-pass trust invariant.** The round resolver does **not** re-check ownership, range, position validity, AP arithmetic, or any rule already enforced by the validator. The match loop is single-threaded; state cannot mutate between validation and resolution within a round. Any failure of this invariant is an engine bug, not a domain check, and the resolver is allowed to throw an unrecoverable error rather than degrade gracefully if it ever encounters a contract violation. Concretely:
  - Resolver helpers (`resolveFreeMoves`, `resolveFreeActions`, `resolveExtras`, etc.) accept already-validated `RoundPlan` inputs and trust them.
  - The only post-validation defensive check the resolver runs is the **target-still-present** check for attack actions (which is a true runtime condition, not a contract check) — and that runs through the G1 retarget rule above.
  - Validator and resolver MUST NOT duplicate any rule listed in Phase 2's `validateRoundPlan` decomposition.

## Phase 1: Round Economy Substrate (Types, Constants, AP State)

### Affected Files

- `src/shared/types.ts` — replace `AgentAction` with `RoundPlan`; add `AgentRoundBudget`, `BidRecord`, `StanceRecord`, `ReserveRecord`; rename `MatchState.currentTurn` → `currentRound`; add `MatchState.budgets`, `MatchState.reserves`, `MatchState.stances`.
- `src/engine/constants.ts` — **new file**. Holds `ROUND_CAP = 50`, `BASE_AP = 3`, `AP_CAP = 4`, `MAX_CARRY = 1`, `BID_MIN = 0`.
- `src/engine/round-state.ts` — **new file**. Holds budget primitives.
- `src/engine/round-state.test.ts` — **new file**.

### Changes

Same as v1 Phase 1 Changes section. The G5 conditional commit-message rule applies to this phase only.

In addition, add to `src/shared/types.ts`:

```ts
export interface RetargetEvent {
  type: "action_retargeted";
  agent: "A" | "B";
  attackerUnitId: string;
  originalTarget: CubeCoord;
  actualTarget: CubeCoord;
  actualTargetUnitId: string;
  damage: number;
  reason: "rushed_shot";
}
```

This event is emitted by the resolver under G1 case 2 (rushed shot).

### Unit Tests

Identical to v1 Phase 1 unit tests. No new tests in this phase for the audit fixes — those land in Phases 2, 3, 5.

## Phase 2: Round Plan Validator (Decomposed per R1)

### Affected Files

- `src/gateway/validator.ts` — top-level `validateRoundPlan(plan, agent, state)` becomes a thin aggregator that calls per-rule helpers in fixed order with early-return on the first failure.
- `src/gateway/validator/ownership.ts` — **new file** (R1).
- `src/gateway/validator/move-path.ts` — **new file** (R1).
- `src/gateway/validator/attack-range.ts` — **new file** (R1).
- `src/gateway/validator/ap-arithmetic.ts` — **new file** (R1).
- `src/gateway/validator/extras-uniqueness.ts` — **new file** (R1).
- `src/gateway/validator/boosted-ability-requirement.ts` — **new file** (R1).
- `tests/gateway/validator.test.ts` — replace legacy action tests with round-plan tests for the aggregator.
- `tests/gateway/validator/ownership.test.ts` — **new file**.
- `tests/gateway/validator/move-path.test.ts` — **new file**.
- `tests/gateway/validator/attack-range.test.ts` — **new file**.
- `tests/gateway/validator/ap-arithmetic.test.ts` — **new file**.
- `tests/gateway/validator/extras-uniqueness.test.ts` — **new file**.
- `tests/gateway/validator/boosted-ability-requirement.test.ts` — **new file**.

### Changes

`src/gateway/validator.ts` (aggregator, target ≤ 40 LOC):

```ts
import { validateOwnership } from "./validator/ownership";
import { validateMovePath } from "./validator/move-path";
import { validateAttackRange } from "./validator/attack-range";
import { validateAPArithmetic } from "./validator/ap-arithmetic";
import { validateExtrasUniqueness } from "./validator/extras-uniqueness";
import { validateBoostedAbilityRequirement } from "./validator/boosted-ability-requirement";
import type { MatchState, RoundPlan } from "../shared/types";

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateRoundPlan(
  plan: RoundPlan,
  agent: "A" | "B",
  state: MatchState,
): ValidationResult {
  const checks = [
    () => validateOwnership(plan, agent, state),
    () => validateMovePath(plan, agent, state),
    () => validateAttackRange(plan, agent, state),
    () => validateAPArithmetic(plan, agent, state),
    () => validateExtrasUniqueness(plan),
    () => validateBoostedAbilityRequirement(plan),
  ];
  for (const check of checks) {
    const result = check();
    if (!result.ok) return result;
  }
  return { ok: true };
}
```

Each helper file exports exactly one named function with signature `(plan, agent, state) => ValidationResult` (or `(plan) => ValidationResult` for the two stateless rules), implements one rule from the Engine-side AP enforcement section, and stays under 40 LOC. Per-rule responsibilities:

- `validateOwnership(plan, agent, state)` — every `unitId` in `freeMove`, `freeAction`, and `extras[].unitId` belongs to `agent` in `state.units`.
- `validateMovePath(plan, agent, state)` — `freeMove.from` matches `unit.position`; `freeMove.to` (or `freeMove.path`) is contiguous (each step distance 1), total step count ≤ `MOVE_POINTS[unit.type]`, no step into water, mountain rules per Plan A.
- `validateAttackRange(plan, agent, state)` — `freeAction.type === "attack"` and any `second_attack` extra target within `RANGE[unit.type]` of the attacker's `from` position.
- `validateAPArithmetic(plan, agent, state)` — `bid + sum(extra costs) ≤ state.budgets[agent].apPool`. Extra costs: `boosted_ability=1`, `second_attack=2`, `defensive_stance=1`, `reserve_overwatch=2`.
- `validateExtrasUniqueness(plan)` — at most one `defensive_stance` per `unitId` in `extras`; at most one `reserve_overwatch` per `unitId` in `extras`. Schema check on `extras[].kind` runs first.
- `validateBoostedAbilityRequirement(plan)` — if `extras` contains a `boosted_ability` element, then `freeAction` MUST exist and `freeAction.type === "ability"`.

Schema-level checks (`bid` is non-negative integer; `extras` is an array; each element has a known `kind`) are bundled into `validateExtrasUniqueness` as the very first guard, returning `{ ok: false, reason: "schema:..." }` on shape failures.

### Unit Tests

`tests/gateway/validator.test.ts` (aggregator):

- Accepts a minimal `pass` plan: `{ bid: 0, extras: [] }`.
- Accepts a representative full plan: `{ bid: 1, freeMove, freeAction (ability), extras: [boosted_ability, defensive_stance] }` against an agent with `apPool: 3`.
- Returns the **first** failing rule when multiple rules would fail. Asserts ordering: ownership → move-path → attack-range → ap-arithmetic → extras-uniqueness → boosted-ability-requirement.

`tests/gateway/validator/ownership.test.ts`:

- Rejects a plan whose `freeAction.unitId` is an enemy unit.
- Rejects a plan whose `extras[0].unitId` is unowned.
- Accepts a plan whose every referenced `unitId` is owned by the submitting agent.

`tests/gateway/validator/move-path.test.ts`:

- Rejects a `freeMove.path` longer than `MOVE_POINTS[unit.type]` steps.
- Rejects a non-contiguous path (e.g., a 2-hex jump).
- Rejects a path stepping onto a `WATER` hex.
- Accepts a single-hex `freeMove` with `to` set and no `path`.
- Accepts a multi-hex `freeMove` with a contiguous `path` of length ≤ `MOVE_POINTS[type]`.

`tests/gateway/validator/attack-range.test.ts`:

- Rejects a `freeAction.type === "attack"` whose `to` hex is out of `RANGE[unit.type]` from `freeAction.from`.
- Rejects a `second_attack` extra whose `to` is out of range.
- Accepts an in-range `freeAction` attack and an in-range `second_attack`.

`tests/gateway/validator/ap-arithmetic.test.ts`:

- Rejects `bid > apPool`.
- Rejects `bid + sum(extras costs) > apPool`.
- Accepts when `bid + sum(extras costs) === apPool`.
- Accepts when `extras = []` and `bid === 0` (the pass plan).

`tests/gateway/validator/extras-uniqueness.test.ts`:

- Rejects two `defensive_stance` extras on the same `unitId`.
- Rejects two `reserve_overwatch` extras on the same `unitId`.
- Accepts one `defensive_stance` and one `reserve_overwatch` on the same unit.
- Rejects an `extras[]` element with an unknown `kind`.

`tests/gateway/validator/boosted-ability-requirement.test.ts`:

- Rejects `boosted_ability` in `extras` when `freeAction` is missing.
- Rejects `boosted_ability` in `extras` when `freeAction.type === "attack"`.
- Accepts `boosted_ability` when `freeAction.type === "ability"`.

## Phase 3: Bid + Simultaneous Resolve Loop (Round Resolver Split per R3)

### Affected Files

- `src/matchmaker/loop.ts` — round driver; collects sealed payloads, deducts bids per G4, resolves order.
- `src/engine/round-resolver.ts` — **new file**. Top-level orchestrator + types + 7 named phase functions exported (`resolveReserveTriggers`, `resolveFreeMoves`, `resolveFreeActions`, `resolveExtras`, `applyStances`, `flagReserves`, `emitRoundEnd`). Target ≤ 250 LOC; aggregator function ≤ 40 LOC.
- `src/engine/round-resolver/triggers.ts` — **new file** (R3). Holds `findReserveTrigger`, `flagPlannedActionsWasted`, `applyReserveDamage`. Target ≤ 250 LOC.
- `src/engine/round-resolver/extras.ts` — **new file** (R3). Holds the four extras handlers (`resolveBoostedAbility`, `resolveSecondAttack`, `recordDefensiveStance`, `recordReserveOverwatch`). Target ≤ 250 LOC.
- `src/engine/round-resolver/retarget.ts` — **new file**. Holds `resolveAttackTarget(state, plan, attackerUnitId, declaredTo)` implementing the G1 retarget rule. Pure function. Target ≤ 100 LOC.
- `tests/matchmaker/integration.test.ts` — extend with bid + tiebreak + G4 forced-pass-with-bid-burn coverage.
- `tests/engine/round-resolver.test.ts` — **new file**. Top-level orchestrator tests.
- `tests/engine/round-resolver/triggers.test.ts` — **new file**.
- `tests/engine/round-resolver/extras.test.ts` — **new file**.
- `tests/engine/round-resolver/retarget.test.ts` — **new file**.

### Changes

Round loop pseudocode in `src/matchmaker/loop.ts` (G4-aware):

```
for round in 1..ROUND_CAP:
  state.budgets.A = applyCarryover(prev.budgets.A)
  state.budgets.B = applyCarryover(prev.budgets.B)
  emit("round_started", { round, budgets: state.budgets })
  [submittedA, submittedB] = await Promise.all([
    requestPlan(agentA, state),
    requestPlan(agentB, state),
  ])
  [planA, bidA] = applyValidationAndBidBurn(submittedA, "A", state)
  [planB, bidB] = applyValidationAndBidBurn(submittedB, "B", state)
  bidWinner = bidA > bidB ? "A"
            : bidB > bidA ? "B"
            : seededCoinFlip(matchId, round)
  emit("bid_resolved", { round, bids: { A: bidA, B: bidB }, winner: bidWinner })
  { nextState, events } = resolveRound(state, planA, planB, bidWinner)
  state = nextState
  emitAll(events)
  state.budgets.A.apCarry = roundEndCarryover(state.budgets.A)
  state.budgets.B.apCarry = roundEndCarryover(state.budgets.B)
  emit("round_ended", { round, state })
  if isMatchOver(state): break
```

`applyValidationAndBidBurn(submittedPlan, agent, state)` (defined in `src/matchmaker/loop.ts`, ≤ 30 LOC) encodes G4:

1. `originalBid = clamp(submittedPlan.bid ?? 0, 0, state.budgets[agent].apPool)`.
2. `result = validateRoundPlan(submittedPlan, agent, state)`.
3. `state.budgets[agent].apPool -= originalBid` (always).
4. If `result.ok` → returns `[submittedPlan, originalBid]`.
5. Else → emits `plan_rejected` with `{ agent, reason: result.reason, originalBid, apBurned: originalBid }`, returns `[{ bid: 0, extras: [] }, originalBid]` (the resolver receives the forced-pass plan; the burned bid is reported separately for spectator UI).

`src/engine/round-resolver.ts` (orchestrator, ≤ 40 LOC for the top-level function):

```ts
import { resolveReserveTriggers } from "./round-resolver/triggers";
import { resolveFreeMoves, resolveFreeActions } from "./round-resolver/free-actions";
import { resolveExtras } from "./round-resolver/extras";
import { applyStances, flagReserves, emitRoundEnd } from "./round-resolver/end-of-round";
import type { MatchEvent, MatchState, RoundPlan } from "../shared/types";

export function resolveRound(
  state: MatchState,
  planA: RoundPlan,
  planB: RoundPlan,
  bidWinner: "A" | "B",
): { nextState: MatchState; events: MatchEvent[] } {
  const events: MatchEvent[] = [];
  const ctx = { state, planA, planB, bidWinner, events };
  resolveReserveTriggers(ctx);
  resolveFreeMoves(ctx);
  resolveFreeActions(ctx);
  resolveExtras(ctx);
  applyStances(ctx);
  flagReserves(ctx);
  emitRoundEnd(ctx);
  return { nextState: ctx.state, events: ctx.events };
}
```

Note: `resolveFreeMoves` and `resolveFreeActions` live in a small companion file `src/engine/round-resolver/free-actions.ts` (also created in this phase, target ≤ 200 LOC). `applyStances`, `flagReserves`, `emitRoundEnd` live in `src/engine/round-resolver/end-of-round.ts` (target ≤ 150 LOC). The R3 ≥ 3-file split is satisfied; this v2 actually splits into 5 files for clearer < 250 LOC cohesion.

Each phase function takes a single `ctx` argument and mutates `ctx.state` / `ctx.events` in place. Per R4, none of them re-runs validation rules; they trust the validator-pass invariant.

`seededCoinFlip(matchId, round)` returns `"A"` when `sha256(matchId + ":" + round).readUInt8(0) & 1 === 0`, else `"B"`. Lives in `src/engine/round-resolver.ts`.

### Unit Tests

`tests/engine/round-resolver.test.ts` (top-level orchestrator):

- Two passing plans produce a `round_ended` event with no state changes other than `currentRound++` and budget reset.
- Phase functions execute in fixed order: `resolveReserveTriggers` → `resolveFreeMoves` → `resolveFreeActions` → `resolveExtras` → `applyStances` → `flagReserves` → `emitRoundEnd`. Asserted by spying on a pure stub of each phase and recording call order.

`tests/engine/round-resolver/triggers.test.ts`:

- `findReserveTrigger` returns the matching trigger when an enemy attack targets the reserving unit.
- Returns the matching trigger when an enemy ends a movement step within `RANGE[type]`.
- Returns `null` when the only candidate is an enemy move ending outside `RANGE[type]`.
- `applyReserveDamage` reduces the target's `hp` by `reservingUnit.strength` with no terrain reduction and no defender retaliation.
- `flagPlannedActionsWasted` rewrites `planA` and `planB` so that any `freeMove`, `freeAction`, or `extras[]` referencing the dead unit becomes a `wasted_action` event entry, with no AP refund.

`tests/engine/round-resolver/extras.test.ts`:

- `resolveBoostedAbility` with `mode: "damage"` adds 1 to a flanker ability damage.
- `resolveBoostedAbility` with `mode: "range"` increases a vanguard_sight reveal radius by 1.
- `resolveSecondAttack` deals `attacker.strength - 1` damage (clamp ≥ 1) and triggers normal defender retaliation.
- `recordDefensiveStance` appends a `StanceRecord { unitId, appliesOnRound: currentRound + 1 }`.
- `recordReserveOverwatch` appends a `ReserveRecord { unitId, ownerId, appliesOnRound: currentRound + 1, fired: false }`.

`tests/engine/round-resolver/retarget.test.ts` (G1 coverage):

- **Follow case.** Original target moved within range from attacker's current position → returns `{ kind: "follow", actualTargetUnitId, damage: attacker.strength }`.
- **Rushed shot case (single candidate).** Original target gone, exactly one other enemy in range → returns `{ kind: "rushed_shot", actualTargetUnitId, damage: floor(strength/2) min 1 }` against that enemy.
- **Rushed shot case (multiple candidates, distance tiebreak).** Two candidates equidistant by hex distance → returns the one with lower `(q, r)` lexicographic order.
- **Rushed shot damage clamp.** Recon (strength 2) → floored to 1. Captain (strength 5) → 2. Siege (strength 6) → 3.
- **Rushed shot retaliation unchanged.** Defender deals back `defender.strength + terrain_defense`; attacker takes the full retaliation regardless of the rushed-shot penalty.
- **No targets case.** Original target gone, no other enemy in range → returns `{ kind: "none" }`. Caller emits `action_wasted` with `reason: "no_target_in_range"`.

`tests/matchmaker/integration.test.ts` (extend):

- **Bid tiebreak.** Both agents bid 2 in round 1 of a fixed-id match → `winner` field on `bid_resolved` is deterministic across two runs.
- **G4 forced pass with bid burn.** Agent A submits `{ bid: 2, freeAction: { unitId: "ENEMY-UNIT", ... }, extras: [] }` (invalid: enemy unit reference). Engine emits `plan_rejected { agent: "A", reason: "ownership:...", originalBid: 2, apBurned: 2 }`, deducts 2 AP from agent A's pool, then runs the round with agent A holding a forced-pass plan. Agent A's pool ends the round at `apPool: 0` (assuming `apPool: 2` start), and agent B's plan resolves normally.
- **G4 over-bid clamp.** Agent A submits `bid: 99` with `apPool: 3` → `apPool` clamps the burn at 3, validation fails on AP arithmetic, agent A pool ends round at 0.
- **G4 valid plan, lost bid.** Agent A bids 1 with valid plan, agent B bids 2 with valid plan. Agent A's pool decreases by 1, agent B's pool decreases by 2; bid winner = B; both plans resolve normally.

## Phase 4: AP Spend Resolution (Boosted, Second Attack, Defensive, Reserve)

### Affected Files

- `src/engine/round-resolver/extras.ts` — already created in Phase 3, this phase adds the full implementation of the four handlers.
- `src/engine/abilities.ts` — extend each ability's resolver to accept an optional `boost: { mode: "range" | "damage" }` modifier.
- `tests/engine/round-resolver/extras.test.ts` — already exists from Phase 3, this phase adds end-to-end coverage of extras applied through `resolveExtras`.
- `tests/engine/abilities.test.ts` — extend.

### Changes

Inside `resolveExtras(ctx)`:

```
for agent in [bidWinner, otherAgent(bidWinner)]:
  plan = agent === "A" ? ctx.planA : ctx.planB
  for extra in plan.extras (in declared order):
    switch extra.kind:
      case "boosted_ability": resolveBoostedAbility(ctx, agent, extra)
      case "second_attack":   resolveSecondAttack(ctx, agent, extra)
      case "defensive_stance": recordDefensiveStance(ctx, agent, extra)
      case "reserve_overwatch": recordReserveOverwatch(ctx, agent, extra)
```

`resolveSecondAttack(ctx, agent, extra)` calls `resolveAttackTarget(ctx.state, ..., extra.unitId, extra.to)` (the G1 retarget helper). The returned kind dictates the emission:
- `follow` → emit `unit_attacked` with full damage, retaliation as usual.
- `rushed_shot` → emit `action_retargeted` with `floor(strength/2)` damage, retaliation as usual.
- `none` → emit `action_wasted { reason: "no_target_in_range" }`. AP not refunded.

Per R4, `resolveSecondAttack` does NOT re-check ownership or range — the validator already cleared those at submission time. The only runtime check is the target-still-present check, which is the G1 retarget rule itself.

`resolveBoostedAbility(ctx, agent, extra)` sets `ctx.boostFlag[agent] = { mode: extra.mode }`; the actual modifier is applied when `resolveFreeActions` invokes the ability resolver later in the round (or earlier, depending on phase order — this is why boost is set as a flag, not applied directly). When `resolveFreeActions` invokes an ability for an agent whose `boostFlag` is set, it passes the boost as the second argument to `resolveAbility`.

In `src/engine/abilities.ts`, ability signatures gain an optional second arg:

```ts
function resolveAbility(ctx, opts?: { boost?: { mode: "range" | "damage" } }): AbilityResult
```

Boost behavior unchanged from v1 Phase 4.

### Unit Tests

`tests/engine/round-resolver/extras.test.ts` (extend from Phase 3 tests):

- `resolveExtras` processes winner's extras before loser's extras.
- `resolveExtras` processes extras in their declared order within each plan.
- `second_attack` whose declared target moved away resolves through the G1 retarget rule (asserted by emitting `action_retargeted` with `reason: "rushed_shot"` when applicable).
- `second_attack` whose declared target died on a prior step (e.g., reserve interrupt) resolves through the G1 retarget rule.

`tests/engine/abilities.test.ts` (extend):

- `boosted_ability` with `mode: "damage"` adds 1 to flanker damage.
- `boosted_ability` with `mode: "range"` increases vanguard_sight reveal radius by 1.
- `boosted_ability` with `mode: "damage"` on `vanguard_sight` is a no-op (ability emits no damage).
- `boosted_ability` is consumed exactly once per round (asserted by running a 2-round scenario where round 1 has a boost and round 2 does not, then verifying round 2's ability resolves at base values).

## Phase 5: Reserve Trigger and Interrupt Semantics

### Affected Files

- `src/engine/round-resolver/triggers.ts` — already created in Phase 3 with stubs; this phase adds the full implementation.
- `tests/engine/round-resolver/triggers.test.ts` — already exists from Phase 3, this phase adds the end-to-end interrupt scenarios.

### Changes

`resolveReserveTriggers(ctx)`:

```
for reserve in ctx.state.reserves where reserve.appliesOnRound === currentRound and !reserve.fired:
  reservingUnit = ctx.state.units[reserve.unitId]
  if reservingUnit is dead: reserve.fired = true; continue
  trigger = findReserveTrigger(reservingUnit, ctx.planA, ctx.planB, ctx.bidWinner)
  if trigger:
    target = ctx.state.units[trigger.sourceUnitId]
    applyReserveDamage(ctx, reservingUnit, target)
    ctx.events.push({ type: "reserve_fired", reserver: reservingUnit.id, target: target.id, damage: reservingUnit.strength, triggerKind: trigger.kind })
    if target.hp <= 0:
      target.dead = true
      flagPlannedActionsWasted(ctx, target.id)
    reserve.fired = true
```

`findReserveTrigger(reservingUnit, planA, planB, bidWinner)` checks both plans in winner-first order:

1. `freeAction.type === "attack"` whose `to` is `reservingUnit.position`.
2. Any `second_attack` extra whose `to` is `reservingUnit.position`.
3. Any `freeMove` whose final hex (`to` or last entry of `path`) is within `RANGE[reservingUnit.type]` of `reservingUnit.position`.

Returns the first match with `{ kind: "attack" | "second_attack" | "movement_in_range", sourceUnitId, sourceAgent }`.

`applyReserveDamage(ctx, reservingUnit, target)` deals `reservingUnit.strength` damage to `target.hp`. No terrain reduction. No defender retaliation.

`flagPlannedActionsWasted(ctx, deadUnitId)` walks `ctx.planA` and `ctx.planB`. For every `freeMove`, `freeAction`, or `extras[]` element referencing `deadUnitId` in its `unitId` field, the helper:
- Removes that field/element from the in-memory plan structure (`ctx.planA.freeAction = undefined`, etc.).
- Emits a `wasted_action` event with `{ agent, kind: "freeMove" | "freeAction" | "extra", originalUnitId, reason: "trigger_killed_unit" }`.
- Per R4, AP is **not** refunded — the AP was burned at validate time.

Reserves whose `appliesOnRound === currentRound` but were never triggered have `reserve.fired = false` at the end of `resolveReserveTriggers`. They are removed by the G3 cleanup in `emitRoundEnd`.

### Unit Tests

`tests/engine/round-resolver/triggers.test.ts` (extend from Phase 3 stubs):

- Reserve fires when an enemy attack targets the reserving unit.
- Reserve fires when an enemy ends a movement step within `RANGE[type]`.
- Reserve does not fire if the only trigger is an enemy move ending outside `RANGE[type]`.
- Reserve interrupts and kills the triggering attacker → attacker's planned attack emits `wasted_action`, no damage dealt to the original target, AP not refunded.
- Reserve fires only once per round even if multiple triggers exist (winner's trigger fires first; subsequent triggers do not refire).
- Reserve does not fire if the reserving unit died before the trigger evaluated (reserve is lost without firing, marked `fired: true` for cleanup purposes).
- `reserve_fired` events include `triggerKind ∈ { "attack", "second_attack", "movement_in_range" }`.

## Phase 6: Demo, Fixtures, Public Surface, and End-of-Round Cleanup

### Affected Files

- `src/engine/round-resolver/end-of-round.ts` — created in Phase 3 with stubs; this phase adds full G2 + G3 cleanup implementation.
- `src/public/demo-replay.js` — rewrite the scripted match to use `RoundPlan` shape with at least 12 rounds, demonstrating: a bid-win interrupt, a reserve fire, a boosted ability, a second attack, a defensive stance, a rushed-shot retarget (G1), and a forced pass with bid burn (G4).
- `src/public/arena.js` — render `currentRound` instead of `currentTurn`; render each agent's `apPool`, `apCarry`, and last `bid`; render reserve and stance indicators on affected units.
- `src/public/event-log.js` — add renderers for `bid_resolved`, `reserve_fired`, `wasted_action`, `action_retargeted`, `plan_rejected`, `round_started`, `round_ended` events.
- `src/public/score.js` — show `Round X / 50` instead of `Turn X / 50`.
- `src/public/arena.html` — text-only updates: `Turn` → `Round`.
- `src/public/reasoning-panel.js` — display the agent's most recent bid and AP state alongside intent.
- `src/persistence/match-store.ts` — persist `RoundPlan` payloads, `BidRecord[]`, `StanceRecord[]`, `ReserveRecord[]` per match.
- `tests/persistence/match-store.test.ts` — extend with a serialize/deserialize roundtrip over a 3-round match including a reserve fire AND a rushed-shot retarget AND a forced pass.
- `tests/engine/round-resolver/end-of-round.test.ts` — **new file**.

### Changes

`emitRoundEnd(ctx)` end-of-round operations, in fixed order:

1. **AP carryover.** `ctx.state.budgets.A.apCarry = roundEndCarryover(ctx.state.budgets.A)`. Same for B.
2. **G2 stance cleanup.** Remove every `StanceRecord` from `ctx.state.stances` whose `appliesOnRound <= currentRound`. (Stances with `appliesOnRound === currentRound` were already consumed by damage-application earlier in the round, so they are safe to remove.)
3. **G3 reserve cleanup.** Remove every `ReserveRecord` from `ctx.state.reserves` whose `appliesOnRound <= currentRound`, regardless of `fired` flag.
4. **Increment round counter.** `ctx.state.currentRound += 1`.
5. **Emit `round_ended` event.** With `{ round: previousRound, state: shallowSnapshot(ctx.state) }`.

Per R4, this function does not validate any rule — it only mutates state and appends to `ctx.events`.

Demo replay (`demo-replay.js`) becomes a sequence of pre-baked `RoundPlan` pairs and pre-baked event streams emitted at fixed `STEP_MS` intervals. The shape change is purely on the JS demo seed; no engine code is invoked from the demo path.

Spectator UI labels:

- "Turn" → "Round" everywhere on the page and in the briefing carousel slides.
- New panel row in the agent intent card: `Bid: N | AP: N+N (carry)`.
- New event-log entry style for `reserve_fired`: red dot, "Overwatch interrupt" label.
- New event-log entry style for `wasted_action`: gray dot, struck-through unit name, reason text.
- New event-log entry style for `action_retargeted`: orange dot, `"Rushed shot: <attackerName> → <actualTargetName> (was <originalCoord>)"` label, dimmed damage value.
- New event-log entry style for `plan_rejected`: red dot, `"Plan rejected: <agentName> (-<originalBid> AP burned, forced pass)"` label.

### Unit Tests

`tests/engine/round-resolver/end-of-round.test.ts` (new file):

- `emitRoundEnd` removes a `StanceRecord { appliesOnRound: 3 }` after round 3's `emitRoundEnd` runs (G2 invariant).
- `emitRoundEnd` removes a `ReserveRecord { appliesOnRound: 3, fired: true }` after round 3 (G3 invariant for fired reserves).
- `emitRoundEnd` removes a `ReserveRecord { appliesOnRound: 3, fired: false }` after round 3 (G3 invariant for expired-unfired reserves).
- `emitRoundEnd` does NOT remove a `StanceRecord { appliesOnRound: 4 }` after round 3 (still active for next round).
- `emitRoundEnd` increments `currentRound` exactly once per call.

`tests/persistence/match-store.test.ts` (extend):

- Serialize and deserialize a 3-round match with one reserve fire + one rushed-shot retarget + one plan_rejected; assert `reserves[0].fired === true` post-roundtrip, the `reserve_fired` event is present, the `action_retargeted` event is present with full payload, and the `plan_rejected` event records `originalBid` and `apBurned`.
- Serialize and deserialize an unfired reserve from round 5; assert `state.reserves` contains it with `fired: false` only when persisted mid-round, and is absent after `emitRoundEnd` of round 5.

`tests/public/demo-replay.test.ts` (new):

- Demo seed parses without throwing.
- Demo seed declares ≥ 12 rounds.
- Demo seed includes at least one of each: `bid_resolved` with non-zero bids, `reserve_fired`, `wasted_action`, `action_retargeted`, `plan_rejected`, `boosted_ability`, `second_attack`, `defensive_stance`.

## Phase 7: Substantiation

### Affected Files

- `docs/META_LEDGER.md` — append entry `plan_id: 2026-04-22-plan-d-round-economy-v2` with phase IDs P1–P6 and a Merkle root after sealing.
- `docs/SHADOW_GENOME.md` — append entry titled `Single-Action Turn Economy` describing the failure mode (UI advertised multi-unit decisions but engine simulated one unit per turn) and the structural fix (round-level wrapper with bidding, AP spends, deterministic retarget under G1, validator-pass trust under R4).
- `.agent/staging/AUDIT_REPORT.md` — refresh with the post-implementation snapshot.
- `tests/engine/e2e.test.ts` — extend with a 9-round scripted match exercising every spend option, a reserve interrupt, a rushed-shot retarget, a forced pass with bid burn, and verifying the G2/G3 cleanup invariants at each round boundary.
- `docs/ARENA_UI_SPEC.md` — append a `Round Economy` section enumerating bid, AP pool, carryover, reserve, stance, retarget, and bid-burn mechanics so the spec stays the single source of truth for the UI.

### Changes

- Append a META_LEDGER entry with `plan_id: 2026-04-22-plan-d-round-economy-v2`, list of phase commits, the v1→v2 supersession note, and a Merkle root once the prior 6 phases are sealed. Builder runs `/qor-substantiate` at this point.
- Append a SHADOW_GENOME entry pointing at the prior single-action turn assumption baked into `loop.ts`, `validator.ts`, and the demo seed; include the v1 audit verdict hash as the precipitating event.
- E2E test: 9-round match where round 1 sets a reserve, round 2 triggers it, round 3 demonstrates a defensive stance carry, round 4 spends a boosted ability, round 5 spends a second attack, round 6 has both agents bid 2 (forced tiebreak), round 7 has a forced pass via invalid plan (G4: bid burn asserted), round 8 includes a rushed-shot retarget (G1: original target moved out, secondary in range), round 9 ends with both agents at non-zero `apCarry` and `state.stances` / `state.reserves` empty (G2 + G3 cleanup invariants asserted).

### Unit Tests

`tests/engine/e2e.test.ts` (extend):

- 9-round scripted match; final state matches a snapshot file `tests/engine/snapshots/round-economy-e2e-v2.json`.
- Event stream includes one `bid_resolved` per round, one `reserve_fired`, at least one `wasted_action`, one `plan_rejected` (round 7), one `action_retargeted` (round 8).
- After each round's `round_ended` event: `state.stances.every(s => s.appliesOnRound > currentRound)` AND `state.reserves.every(r => r.appliesOnRound > currentRound)`.

## Builder Execution Notes

- Phases run in order. Each phase is a single ticket. Builder MUST not interleave phases.
- After each phase, builder runs the standard test suite (`bun test`) and commits with message `builder tick NNN: plan-d-v2-phase-N-<short-name>`.
- Phase 1's commit message includes the G5 detection result: `(A6-shipped path: keep)` or `(A6-unstarted: drop)`.
- `/qor-audit` runs after Phase 7 only. Earlier phases self-verify via their own test files.
- If a phase's test suite fails, builder stops and surfaces the failure. Builder MUST NOT add `.skip` markers under any condition.
- All Plan D v2 code paths are covered by tests in this document. If builder finds a function that needs implementation but is not enumerated above, builder STOPS and surfaces the gap.
- Per R4, builder MUST NOT add validation re-checks inside the resolver. If a resolver helper looks like it needs to defensively check ownership / range / position / AP arithmetic, that is a sign of a contract violation upstream — surface it, do not paper over.
- Per R3, no file in `src/engine/round-resolver/` may exceed 250 LOC. If a phase's implementation pushes a file over the cap, builder STOPS and surfaces a sub-split request rather than landing the over-cap file.
- Per R1, no validator helper file may exceed 40 LOC for its single exported function (excluding imports and types). If a rule's logic genuinely needs more than 40 LOC, builder STOPS and surfaces a sub-decomposition request rather than landing the over-cap helper.
- Plan A Phase 6 supersession follows the G5 conditional rule. If A6 status is ambiguous (e.g., partial commit landed but tests not green), builder STOPS and surfaces for human disambiguation rather than guessing.
- Plan D depends on Plan A Phases 1–5 being complete. If they are not, builder STOPS and surfaces the dependency gap.
- Plan B and Plan C are independent of Plan D and may run in parallel under the existing builder ticket discipline.

## Audit Remediation Crosswalk

| v1 Audit Item | Where Resolved in v2 |
|---|---|
| V1 (R1: validator decomposition) | Phase 2 — six new validator helper files, aggregator under 40 LOC. |
| V2 (R2: resolver decomposition) | Phase 3 — seven named phase functions, orchestrator under 40 LOC. |
| V3 (R3: file split) | Phase 3 — `round-resolver/` directory with 5 files, each ≤ 250 LOC. |
| V4 (R4: validator-pass trust) | Decision Lock-In `R4`; enforced by Builder Execution Note. |
| G1 (empty-hex attack) | Decision Lock-In `G1` (intelligent retarget, deterministic rushed shot). |
| G2 (stance cleanup) | Decision Lock-In `G2`; implemented in Phase 6 `emitRoundEnd`. |
| G3 (reserve cleanup) | Decision Lock-In `G3`; implemented in Phase 6 `emitRoundEnd`. |
| G4 (bid burn on rejected plan) | Decision Lock-In `G4`; implemented in Phase 3 `applyValidationAndBidBurn`. |
| G5 (Plan A Phase 6 supersession) | Decision Lock-In `G5`; detection + branching encoded in Phase 1 commit message. |
