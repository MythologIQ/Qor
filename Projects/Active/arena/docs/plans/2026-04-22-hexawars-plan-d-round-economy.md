# Plan D: HexaWars Round Economy (RTS-Style Multi-Unit Rounds with Initiative Bidding)

> Explicit-by-contract plan for the builder queue. Every ambiguity is pre-resolved. Builder picks up phases sequentially; no design judgment required at runtime.

## Goal

Replace the legacy "one unit acts per turn" loop with an RTS-style round economy:

- A "round" replaces a "turn" as the unit of match progression. Both agents act per round.
- Each agent receives **1 free move + 1 free action + 3 AP per round**, spendable across any owned units.
- Both agents submit a sealed `bid + round plan` payload simultaneously each round. Bid AP determines resolution priority for conflicts. Bid AP is burned whether the bid wins or loses.
- Four AP spend options: boosted ability, second attack, defensive stance, reserve overwatch.
- Reserve overwatch can interrupt and waste an opponent's action.
- Match ends at round 50 (was: turn 50). Win conditions unchanged in semantics, only the "turn" → "round" wording updates.

This plan **supersedes Plan A Phase 6** (Action Contract Migration). The legacy single-action contract from Plan A Phases 1–5 remains the per-unit substrate; Plan D layers a round-level wrapper on top.

## Non-Goals

- No new unit types. Roster (`scout`, `raider`, `interceptor`, `siege`, `captain`) from Plan A is unchanged.
- No per-unit ability rewrites. Abilities from Plan A Phase 4 still fire under their existing triggers; AP boost only affects the round's ability invocation.
- No board-radius change. Plan C handles map size.
- No item or inventory system. Plan B handles hidden map items.
- No new operator-facing UI surfaces (registration, brackets, leaderboard).
- No model client work. The agent contract changes; the agent-side wire format does not.
- No spectator UI overhaul. UI updates are limited to the minimum required to display rounds, bids, AP, and reserve interrupts.

## Open Questions

- None. All decisions in this document are final unless explicitly re-opened by `/qor-plan`.

## Decision Lock-Ins (Builder MUST follow exactly)

- **Round vs. turn.** Engine internally renames `turn` → `round` everywhere. The legacy `TURN_CAP = 50` constant is renamed `ROUND_CAP = 50` in `src/engine/constants.ts`. The legacy `turn_ended` event is renamed `round_ended`. The legacy `turn` field in serialized match state is renamed `round`. The wire-level `currentTurn` field on `MatchState` is renamed `currentRound`. There is **no backwards-compatibility shim** for the rename; all callers update in one phase.
- **Per-agent budget per round.** Each agent receives, at round start: `freeMove: 1`, `freeAction: 1`, `apPool: 3`, `apCarry: 0`. Carryover from previous round adds to `apPool` up to a hard cap of `4` total. Unspent AP at round end is added to `apCarry` for the next round, then capped at `1` rolled forward. AP is **per-agent**, not per-unit.
- **Free move.** Exactly one move action per round, on any owned unit, costing zero AP. Movement budget for that unit is its `MOVE_POINTS[type]` from Plan A. A free move can be a multi-hex `path` if Plan A Phase 6's `path` field is in place; otherwise it is a single-hex `to`. (See **Plan A Phase 6 Supersession** below.)
- **Free action.** Exactly one action (`attack` or `ability`) per round, on any owned unit, costing zero AP. The unit chosen for the free action does **not** have to be the same unit that took the free move.
- **AP spend options.** Exactly four options. AP is spent inside the same round plan, not banked for later (banking is the Reserve mechanic, which is one of the four options).
  - `boosted_ability`: cost `1 AP`. Modifies the round's free `ability` action (must also be present in the plan). Effect: `+1` to the ability's effective range OR `+1` damage on the ability's outcome, agent picks at submission. If no `ability` is in the round plan, this option is invalid and the validator rejects the submission.
  - `second_attack`: cost `2 AP`. Adds one extra `attack` action against any legal target by any owned unit. Damage formula: `attacker.strength - 1` (minimum 1). Defender retaliation unchanged.
  - `defensive_stance`: cost `1 AP`, target = one owned unit. Effect: incoming damage to that unit during the **next** round is reduced by `1` (minimum 0). Stacks with terrain defense. One stance per unit per round; multiple stances on the same unit in one round are rejected by the validator.
  - `reserve_overwatch`: cost `2 AP`, target = one owned unit. Effect: that unit gains a reserved attack that fires inside the **next** round. See **Reserve Trigger Semantics** below.
- **Bid mechanic.** Each round both agents submit a sealed payload `{ bid: integer, plan: RoundPlan }`. `bid` ∈ `[0, agent.apPool]` at submit time. Bid AP is deducted from the agent's `apPool` immediately on submission, regardless of outcome. After both payloads are received, the engine reveals both bids:
  - Higher bid → winner.
  - Tie → coin flip with seed `hash(matchId, round)` for replay determinism.
  - Winner's actions take precedence in conflict resolution only. See **Resolution Order** below.
- **Resolution order (per round, after bids revealed).** Engine resolves in fixed phase order:
  1. **Reserve triggers** (any reserved attack from previous round whose trigger condition is met fires now, in unit-id order, before any current-round action resolves). Reserve interrupts are deterministic.
  2. **Free moves** (winner's free move first, then loser's). If both targeted the same destination hex, winner's move resolves; loser's free move is wasted (no refund — moves are free).
  3. **Free actions** (winner's free action first, then loser's). If a unit was killed by reserve interrupt or by winner's prior action in the same round, any pending action involving that unit is wasted. AP is not refunded.
  4. **AP spend extras**, in declared order within each agent's plan, winner's extras first, then loser's.
  5. **Defensive stances applied** for next round.
  6. **Reserved overwatch flagged** for next round.
  7. **Round end events emitted**, AP carryover computed, `round_ended` event with the post-round `MatchState`.
- **Reserve trigger semantics.** A unit `U` carrying a reserved overwatch from round `N-1` will fire its reserved attack in round `N` if and only if:
  - An enemy unit `E` declares an `attack` action targeting `U`, OR
  - An enemy unit `E` ends a movement step in a hex within `RANGE[U.type]` of `U` (per Plan A range rules).
  - The first eligible trigger fires the reserve. Subsequent triggers in the same round do not refire (one reserve, one shot).
  - The reserve fires **before** the triggering action resolves. If the reserved attack kills `E` or reduces `E.hp` to 0, the triggering action is **wasted**. AP for the triggering action is **not refunded**.
  - The reserved attack uses standard combat resolution: `attacker.strength` vs `defender.strength + terrain_defense`. Defender retaliation **does not** occur on a reserve fire (reserve is a free shot).
  - If `U` was killed before the trigger fires, the reserve is lost without firing.
- **Action contract (Plan A Phase 6 supersession).** `AgentAction` is no longer the unit of agent submission. The new unit of agent submission is `RoundPlan`:
  ```ts
  interface RoundPlan {
    bid: number;
    freeMove?: { unitId: string; from: CubeCoord; to?: CubeCoord; path?: CubeCoord[] };
    freeAction?: { unitId: string; type: "attack" | "ability"; from: CubeCoord; to?: CubeCoord; ability?: { id: AbilityId } };
    extras: Array<
      | { kind: "boosted_ability"; mode: "range" | "damage" }
      | { kind: "second_attack"; unitId: string; from: CubeCoord; to: CubeCoord }
      | { kind: "defensive_stance"; unitId: string }
      | { kind: "reserve_overwatch"; unitId: string }
    >;
  }
  ```
  The legacy `AgentAction` type is **removed**, not aliased. The `pass` action becomes implicit: a `RoundPlan` with no `freeMove`, no `freeAction`, no `extras`, and `bid: 0` is a "pass round."
- **Backwards compatibility.** None. The wire contract is breaking. The shared types file's FROZEN comment (already removed in Plan A Phase 1) stays removed. Demo fixtures and seeds are rewritten in Plan D Phase 6.
- **AP display.** Agent operator dashboards do **not** change in this plan. AP, bid, and round numbers are exposed in `MatchState` and rendered in the spectator UI's existing telemetry panels under new labels.
- **Engine-side AP enforcement.** All AP spend is validated by the engine. The validator rejects any `RoundPlan` that:
  - Spends more AP than the agent's `apPool` (including bid).
  - Repeats the same `unitId` in `defensive_stance` or `reserve_overwatch` more than once per round.
  - References a `unitId` not owned by the submitting agent.
  - Includes a `boosted_ability` extra without a `freeAction` of type `ability`.
  - Submits `freeMove.path.length` exceeding `MOVE_POINTS[unitType] + 1`.
  - Submits a `second_attack` to a tile out of `RANGE[attacker.type]` from `attacker.position`.
- **Match length.** `ROUND_CAP = 50`. Wipeout, 60% territory control, and runout-leader-at-cap win conditions all keep their semantics; only the variable name `turn` → `round` updates throughout the codebase, fixtures, demo, tests, and visible UI strings.

## Phase 1: Round Economy Substrate (Types, Constants, AP State)

### Affected Files

- `src/shared/types.ts` — replace `AgentAction` with `RoundPlan`, add `AgentRoundBudget`, `BidRecord`, rename `MatchState.currentTurn` → `currentRound`, add `MatchState.budgets: Record<"A" | "B", AgentRoundBudget>`, add `MatchState.reserves: ReserveRecord[]`, add `MatchState.stances: StanceRecord[]`.
- `src/engine/constants.ts` — **new file**. Holds `ROUND_CAP = 50`, `BASE_AP = 3`, `AP_CAP = 4`, `MAX_CARRY = 1`, `BID_MIN = 0`.
- `src/engine/round-state.ts` — **new file**. Holds `createInitialBudget()`, `applyCarryover(budget)`, `validateAndDeduct(budget, plan)`, `roundEndCarryover(budget)` helpers.
- `src/engine/round-state.test.ts` — **new file**. See Unit Tests below.

### Changes

In `src/shared/types.ts`, add:

```ts
export interface AgentRoundBudget {
  freeMove: number;       // 0 or 1
  freeAction: number;     // 0 or 1
  apPool: number;         // 0..AP_CAP
  apCarry: number;        // 0..MAX_CARRY (set at round end)
}

export interface BidRecord {
  agent: "A" | "B";
  bid: number;
  round: number;
}

export interface StanceRecord {
  unitId: string;
  appliesOnRound: number;  // round when -1 damage applies
}

export interface ReserveRecord {
  unitId: string;
  ownerId: "A" | "B";
  appliesOnRound: number;  // round during which reserve can fire
  fired: boolean;
}

export interface RoundPlan {
  bid: number;
  freeMove?: { unitId: string; from: CubeCoord; to?: CubeCoord; path?: CubeCoord[] };
  freeAction?: { unitId: string; type: "attack" | "ability"; from: CubeCoord; to?: CubeCoord; ability?: { id: AbilityId } };
  extras: Array<
    | { kind: "boosted_ability"; mode: "range" | "damage" }
    | { kind: "second_attack"; unitId: string; from: CubeCoord; to: CubeCoord }
    | { kind: "defensive_stance"; unitId: string }
    | { kind: "reserve_overwatch"; unitId: string }
  >;
}
```

Remove the legacy `AgentAction` and `AgentActionType` types entirely.

Rename `MatchState.currentTurn` → `currentRound`. Add `budgets`, `reserves`, `stances` fields.

In `src/engine/round-state.ts`:

```ts
export function createInitialBudget(): AgentRoundBudget {
  return { freeMove: 1, freeAction: 1, apPool: BASE_AP, apCarry: 0 };
}

export function applyCarryover(prev: AgentRoundBudget): AgentRoundBudget {
  const apPool = Math.min(BASE_AP + prev.apCarry, AP_CAP);
  return { freeMove: 1, freeAction: 1, apPool, apCarry: 0 };
}

export function roundEndCarryover(budget: AgentRoundBudget): number {
  return Math.min(budget.apPool, MAX_CARRY);
}
```

`validateAndDeduct(budget, plan)` returns `{ ok: true; remaining: AgentRoundBudget } | { ok: false; reason: string }`. Implements all rejection rules from **Engine-side AP enforcement** above.

### Unit Tests

`src/engine/round-state.test.ts`:

- `createInitialBudget` returns `{1, 1, 3, 0}`.
- `applyCarryover` with prev `apCarry: 1` returns `apPool: 4, apCarry: 0`.
- `applyCarryover` with prev `apCarry: 1` and `BASE_AP + 1 > AP_CAP` is clamped to `AP_CAP`.
- `roundEndCarryover` returns `Math.min(apPool, 1)` for representative cases (0, 1, 2, 4).
- `validateAndDeduct` returns `ok: false` for: bid > apPool, second_attack with unowned unitId, two defensive_stances on same unitId, boosted_ability without freeAction.ability, second_attack out of range, freeMove.path longer than MOVE_POINTS+1.
- `validateAndDeduct` returns `ok: true` for a representative valid plan with `bid: 1, freeMove, freeAction (attack), extras: [defensive_stance, second_attack]` summing to `bid + 0 + 0 + 1 + 2 = 4` AP, with `apPool: 4`.

## Phase 2: Round Plan Validator

### Affected Files

- `src/gateway/validator.ts` — replace the old `AgentAction` validator with `validateRoundPlan(plan, agent, state)`.
- `tests/gateway/validator.test.ts` — replace the legacy action tests with round-plan tests.

### Changes

`validateRoundPlan` returns `{ ok: true } | { ok: false; reason: string }`. Implements:

- Schema check: `bid` is a non-negative integer; `extras` is an array; each element matches one of the four `kind` discriminants exactly.
- Ownership check: every `unitId` referenced (in `freeMove`, `freeAction`, `extras[].unitId`) belongs to the submitting agent in `state.units`.
- Position check: `freeMove.from`, `freeAction.from`, and any `second_attack.from` match the unit's actual `position` in `state.units`.
- Move legality: `freeMove.path` (or single `to`) is contiguous, every step distance 1, total length ≤ `MOVE_POINTS[unit.type] + 1` (the +1 accounts for inclusive start vertex), no step into water, mountain rules per Plan A.
- Range check: `freeAction.type: "attack"` and any `second_attack` target within `RANGE[unit.type]`.
- AP arithmetic: `bid + sum(extra costs) ≤ state.budgets[agent].apPool`.
- Same-unit-twice rules: at most one `defensive_stance` per `unitId` per round; at most one `reserve_overwatch` per `unitId` per round.
- Conditional require: `boosted_ability` extra requires `freeAction.type === "ability"`.

### Unit Tests

`tests/gateway/validator.test.ts`:

- Accepts a minimal valid `pass` plan: `{ bid: 0, extras: [] }`.
- Accepts a representative full plan: `{ bid: 1, freeMove: {…}, freeAction: {ability}, extras: [boosted_ability, defensive_stance] }` against an agent with `apPool: 3`.
- Rejects bid > apPool.
- Rejects unowned `unitId` in any slot.
- Rejects `freeMove` with non-contiguous `path`.
- Rejects `freeMove` with path length > `MOVE_POINTS[type]+1`.
- Rejects `second_attack` to a tile out of range.
- Rejects two `defensive_stance` on same unit in one round.
- Rejects `boosted_ability` without an `ability` free action.
- Rejects unknown `extras[].kind`.

## Phase 3: Bid + Simultaneous Resolve Loop

### Affected Files

- `src/matchmaker/loop.ts` — round driver; collects sealed payloads from both agents, deducts bids, resolves order.
- `src/engine/round-resolver.ts` — **new file**. Pure function `resolveRound(state, planA, planB, bidWinner)` returns `{ nextState, events }`.
- `tests/matchmaker/integration.test.ts` — extend with bid + tiebreak coverage.
- `tests/engine/round-resolver.test.ts` — **new file**.

### Changes

Round loop pseudocode in `src/matchmaker/loop.ts`:

```
for round in 1..ROUND_CAP:
  state.budgets.A = applyCarryover(prev.budgets.A)
  state.budgets.B = applyCarryover(prev.budgets.B)
  emit("round_started", { round, budgets: state.budgets })
  [planA, planB] = await Promise.all([
    requestPlan(agentA, state),
    requestPlan(agentB, state),
  ])
  for agent, plan in [["A", planA], ["B", planB]]:
    result = validateRoundPlan(plan, agent, state)
    if !result.ok:
      emit("plan_rejected", { agent, reason: result.reason })
      plan = { bid: 0, extras: [] }   // forced pass
    state.budgets[agent].apPool -= plan.bid   // bid burned regardless
  bidWinner = planA.bid > planB.bid ? "A"
            : planB.bid > planA.bid ? "B"
            : seededCoinFlip(matchId, round)  // tiebreak
  emit("bid_resolved", { round, bids: {A: planA.bid, B: planB.bid}, winner: bidWinner })
  { nextState, events } = resolveRound(state, planA, planB, bidWinner)
  state = nextState
  emitAll(events)
  state.budgets.A.apCarry = roundEndCarryover(state.budgets.A)
  state.budgets.B.apCarry = roundEndCarryover(state.budgets.B)
  emit("round_ended", { round, state })
  if isMatchOver(state): break
```

`resolveRound` implements the **Resolution order** (1–7) from the lock-ins. Pure function, no I/O.

`seededCoinFlip(matchId, round)` returns `"A"` if `sha256(matchId + ":" + round).readUInt8(0) & 1 === 0`, else `"B"`. Deterministic for replay.

### Unit Tests

`tests/engine/round-resolver.test.ts`:

- Two passing plans produce a `round_ended` event with no state changes other than `currentRound++` and budget reset.
- Winner's free move resolves first when both target the same hex; loser's free move is wasted; no AP refund.
- Winner's free attack resolves before loser's; if winner's attack kills the unit loser's attack targeted, loser's attack emits `action_wasted` event, no AP refund.
- Reserve from round N-1 fires in round N before any current-round action when the trigger condition is met.
- Reserve fire that kills the trigger source causes the triggering action to be marked `action_wasted`, AP not refunded.
- Defensive stance from round N-1 reduces incoming damage by 1 in round N.
- AP carryover: agent ends round with `apPool: 2` carries `1` to next round; ends with `apPool: 0` carries `0`.

`tests/matchmaker/integration.test.ts`:

- Bid tiebreak: when both agents bid 2 in round 1 of a fixed-id match, the `winner` field on the emitted `bid_resolved` event is deterministic across two runs of the same scenario.
- Plan rejection: an invalid plan from agent A becomes a forced pass; agent A's bid is still deducted.
- Bid burn: agent who loses the bid still has `bid` AP deducted from their pool.

## Phase 4: AP Spend Resolution (Boosted, Second Attack, Defensive, Reserve)

### Affected Files

- `src/engine/round-resolver.ts` — extend with extras handlers.
- `src/engine/abilities.ts` — extend each ability's resolver to accept an optional `boost: { mode: "range" | "damage" }` modifier.
- `tests/engine/round-resolver.test.ts` — extend.
- `tests/engine/abilities.test.ts` — extend.

### Changes

Inside `resolveRound` step 4 ("AP spend extras"), in declared order within each agent's plan, winner first then loser:

- `boosted_ability`: when winner's `boosted_ability` extra is processed and the agent's `freeAction` is an ability, apply the boost. `mode: "range"` increments the ability's effective range by 1 for this round only. `mode: "damage"` adds `+1` to the ability's resulting damage roll. The boost is applied **at the moment the ability resolves**, so if the boosted_ability extra appears before the freeAction in the extras stream, it still applies. Implementation: scan extras for `boosted_ability` once, set a `boostFlag` on the resolver context, then run the freeAction.
- `second_attack`: emit a single `unit_attacked` event. Damage = `attacker.strength - 1` (clamped to ≥1). Defender retaliates per Plan A rules. Costs 2 AP, deducted at validate time.
- `defensive_stance`: append a `StanceRecord { unitId, appliesOnRound: currentRound + 1 }` to `state.stances`. Costs 1 AP. Effect activates next round and decays at the end of next round (`appliesOnRound === currentRound` in next round → -1 damage applied to incoming hits, then record removed at round end).
- `reserve_overwatch`: append a `ReserveRecord { unitId, ownerId, appliesOnRound: currentRound + 1, fired: false }` to `state.reserves`. Costs 2 AP.

In `src/engine/abilities.ts`, each ability's signature gains an optional second arg:

```ts
function resolveAbility(ctx, opts?: { boost?: { mode: "range" | "damage" } }): AbilityResult
```

The boost is consumed by the ability resolver. Range boost only applies to abilities that have a positional range (`overwatch`, `indirect_fire`, `flanker`); damage boost only applies to abilities that emit damage (`flanker`, `indirect_fire`, `rally`'s aura → `+1` aura instead of +1 damage on direct attacks). For `vanguard_sight`, range boost increases reveal radius by 1; damage boost is a no-op (and the validator allows the extra; the boost simply has no effect).

### Unit Tests

`tests/engine/round-resolver.test.ts` (extend):

- `second_attack` resolves with `attacker.strength - 1` damage.
- `defensive_stance` reduces damage by 1 the round after it is set.
- `defensive_stance` decays after one round.
- `reserve_overwatch` is recorded but does not fire in the round it is set.

`tests/engine/abilities.test.ts` (extend):

- `boosted_ability` with `mode: "damage"` adds 1 to `flanker` damage.
- `boosted_ability` with `mode: "range"` increases `vanguard_sight` reveal radius from 2 to 3.
- `boosted_ability` with `mode: "damage"` on `vanguard_sight` is a no-op (ability emits no damage).
- `boosted_ability` is consumed exactly once per round (not double-applied).

## Phase 5: Reserve Trigger and Interrupt Semantics

### Affected Files

- `src/engine/round-resolver.ts` — extend with reserve trigger detection and interrupt logic.
- `tests/engine/round-resolver.test.ts` — extend.

### Changes

`resolveRound` step 1 ("Reserve triggers") expanded:

```
for reserve in state.reserves where reserve.appliesOnRound === currentRound and !reserve.fired:
  reservingUnit = state.units[reserve.unitId]
  if reservingUnit is dead: skip; mark reserve.fired = true
  trigger = findTrigger(reservingUnit, planA, planB, currentRound)
  if trigger:
    target = state.units[trigger.sourceUnitId]
    apply combat: damage = reservingUnit.strength
    target.hp -= damage  (no terrain reduction on reserve interrupt — by design, reserves are pre-action overwatch, not standard exchange)
    no defender retaliation
    emit("reserve_fired", { reserver, target, damage, triggerKind })
    if target.hp <= 0:
      target.dead = true
      // mark all of target's planned actions as wasted, AP not refunded
      flagPlannedActionsWasted(planA, planB, target.id)
    reserve.fired = true
```

`findTrigger` checks both agents' plans in winner-first order:

1. `freeAction` of type `attack` targeting `reservingUnit.position`.
2. Any `second_attack` extra targeting `reservingUnit.position`.
3. Any `freeMove` whose final hex is within `RANGE[reservingUnit.type]` of `reservingUnit.position`.

The first match wins; subsequent triggers in the same round do not refire the reserve (one shot).

`flagPlannedActionsWasted(planA, planB, deadUnitId)` rewrites the in-memory plans so that any `freeMove`, `freeAction`, or `extras[]` referencing `deadUnitId` is converted to a `wasted_action` event entry. AP for those entries is **not** refunded — it was already deducted at submission.

Reserves not triggered in their `appliesOnRound` round expire silently at round end.

### Unit Tests

`tests/engine/round-resolver.test.ts` (extend):

- Reserve fires when an enemy attack targets the reserving unit.
- Reserve fires when an enemy ends a movement step within `RANGE[type]` of the reserving unit.
- Reserve does not fire if the only trigger is an enemy move that ends outside `RANGE[type]`.
- Reserve interrupts and kills the triggering attacker; the attacker's planned attack emits `action_wasted` and no damage is dealt.
- Reserve fires only once per round even if multiple triggers exist.
- Reserve does not fire if the reserving unit died before the trigger evaluated (reserve is lost without firing).
- Reserve expires at round end if no trigger occurred.
- `reserve_fired` events include `triggerKind ∈ {"attack","second_attack","movement_in_range"}`.

## Phase 6: Demo, Fixtures, and Public Surface Reconciliation

### Affected Files

- `src/public/demo-replay.js` — rewrite the scripted match to use `RoundPlan` shape with at least 12 rounds, demonstrating: a bid-win interrupt, a reserve fire, a boosted ability, a second attack, and a defensive stance.
- `src/public/arena.js` — render `currentRound` instead of `currentTurn`; render each agent's `apPool`, `apCarry`, and last `bid`; render reserve and stance indicators on affected units.
- `src/public/event-log.js` — add renderers for `bid_resolved`, `reserve_fired`, `action_wasted`, `round_started`, `round_ended` events.
- `src/public/score.js` — show `Round X / 50` instead of `Turn X / 50`.
- `src/public/arena.html` — text-only updates: `Turn` → `Round`, `Pause Demo` and `Restart Demo` already removed in prior work, no structural change.
- `src/public/reasoning-panel.js` — display the agent's most recent bid and AP state alongside intent.
- `src/persistence/match-store.ts` — persist `RoundPlan` payloads, `BidRecord[]`, `StanceRecord[]`, `ReserveRecord[]` per match.
- `tests/persistence/match-store.test.ts` — extend with a serialize/deserialize roundtrip over a 3-round match including a reserve fire.

### Changes

Demo replay (`demo-replay.js`) becomes a sequence of pre-baked `RoundPlan` pairs and pre-baked event streams emitted at fixed `STEP_MS` intervals. The shape change is purely on the JS demo seed; no engine code is invoked from the demo path.

Spectator UI labels:

- "Turn" → "Round" everywhere on the page and in the briefing carousel slides.
- New panel row in the agent intent card: `Bid: N | AP: N+N (carry)`.
- New event-log entry style for `reserve_fired`: red dot, "Overwatch interrupt" label.
- New event-log entry style for `action_wasted`: gray dot, struck-through unit name.

### Unit Tests

`tests/persistence/match-store.test.ts` (extend):

- Serialize and deserialize a 3-round match with one reserve fire; assert `reserves[0].fired === true` post-roundtrip and the `reserve_fired` event is present in the event stream.
- Serialize and deserialize an unfired reserve; assert it appears in `state.reserves` with `fired: false` until expired at round end, then absent.

`tests/public/demo-replay.test.ts` (new):

- Demo seed parses without throwing.
- Demo seed declares ≥12 rounds.
- Demo seed includes at least one of each: `bid_resolved` with non-zero bids, `reserve_fired`, `action_wasted`, `boosted_ability`, `second_attack`, `defensive_stance`.

## Phase 7: Substantiation

### Affected Files

- `docs/META_LEDGER.md` — append entry `plan_id: 2026-04-22-plan-d-round-economy` with phase IDs P1–P6.
- `docs/SHADOW_GENOME.md` — append entry titled `Single-Action Turn Economy` describing the failure mode (UI advertised multi-unit decisions but engine simulated one unit per turn) and the structural fix (round-level wrapper with bidding and AP spends).
- `.agent/staging/AUDIT_REPORT.md` — refresh with the post-implementation snapshot.
- `tests/engine/e2e.test.ts` — extend to play 8 rounds of a scripted match exercising every spend option and a reserve interrupt; assert the final state matches a golden snapshot.
- `docs/ARENA_UI_SPEC.md` — append a `Round Economy` section enumerating bid, AP pool, carryover, and reserve mechanics so the spec stays the single source of truth for the UI.

### Changes

- Append a META_LEDGER entry with `plan_id: 2026-04-22-plan-d-round-economy`, list of phase commits, and a Merkle root once the prior 6 phases are sealed. Builder runs `/qor-substantiate` at this point.
- Append a SHADOW_GENOME entry pointing at the prior single-action turn assumption baked into `loop.ts`, `validator.ts`, and the demo seed.
- E2E test: 8-round match where round 1 sets a reserve, round 2 triggers it, round 3 demonstrates a defensive stance carry, round 4 spends a boosted ability, round 5 spends a second attack, round 6 has both agents bid 2 (forced tiebreak), round 7 has a forced pass via invalid plan, round 8 ends with both agents at non-zero `apCarry`.

### Unit Tests

`tests/engine/e2e.test.ts` (extend):

- 8-round scripted match; final state matches a snapshot file `tests/engine/snapshots/round-economy-e2e.json`.
- Event stream includes one `bid_resolved` per round, one `reserve_fired`, at least one `action_wasted`, and one `plan_rejected` (round 7).

## Builder Execution Notes

- Phases run in order. Each phase is a single ticket. Builder MUST not interleave phases.
- After each phase, builder runs the standard test suite (`bun test`) and commits with message `builder tick NNN: plan-d-phase-N-<short-name>`.
- `/qor-audit` runs after Phase 7 only. Earlier phases self-verify via their own test files.
- If a phase's test suite fails, builder stops and surfaces the failure for human review. Builder MUST NOT skip a failing test; do not add `.skip` markers under any condition.
- All Plan D code paths are covered by tests in this document. If builder finds a function that needs implementation but is not enumerated above, builder STOPS and surfaces the gap rather than improvising.
- Plan A Phase 6 (Action Contract Migration) is **superseded** by Plan D Phases 1–3. If Plan A Phase 6 has not yet been started by the builder when Plan D enters the queue, Plan A Phase 6 is **dropped** entirely. If Plan A Phase 6 has already shipped, Plan D Phase 1 reverts the `AgentAction` shape and replaces it with `RoundPlan` in a single commit before proceeding.
- Plan D depends on Plan A Phases 1–5 being complete (unit types, abilities, facing). If Plan A Phases 1–5 are not yet complete when Plan D is dequeued, builder STOPS and surfaces the dependency gap rather than skipping ahead.
- Plan B (hidden map items) and Plan C (map expand + camera) are independent of Plan D and may run in parallel under the existing builder ticket discipline.
