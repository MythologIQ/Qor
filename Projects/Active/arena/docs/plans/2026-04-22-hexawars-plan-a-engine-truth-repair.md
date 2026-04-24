# Plan A: HexaWars Engine Truth Repair

> Explicit-by-contract plan for the builder queue. Every ambiguity is pre-resolved here. Builder picks up phases sequentially; no design judgment required at runtime.

## Goal

Make the engine actually simulate what the UI already advertises:

- 5 unit types (`scout`, `raider`, `interceptor`, `siege`, `captain`) instead of the legacy 3 (`infantry`, `scout`, `heavy`).
- Per-unit `movePoints` and `range` matching `src/public/unit-catalog.js`.
- A persisted `facing` axis on every unit, rendered on the board.
- Five abilities wired into the engine: `vanguard_sight`, `flanker`, `overwatch`, `indirect_fire`, `rally`.
- An explicit, additive action contract that supports multi-hex moves, ranged attacks, and ability use without breaking the FROZEN v1 contract.

This plan does **not** change the map size or add hidden items. Those are Plan C and Plan B.

## Non-Goals

- No board-radius change. Keep the existing demo radius-4 board working unchanged.
- No item system. No inventory. No `use_item` action.
- No new operator-facing UI surfaces (registration, bracket changes, leaderboard, etc.).
- No engine-driven turn-cap change. `TURN_CAP = 50` stays.
- No new model types or AI client work.

## Open Questions

- None. All decisions in this document are final unless explicitly re-opened by `/qor-plan`.

## Decision Lock-Ins (Builder MUST follow exactly)

- **Legacy aliasing.** `infantry → interceptor`, `heavy → captain`. `scout` is unchanged. This applies on engine read, demo seeds, fixtures, and the agent action contract. The legacy strings remain accepted on input forever; new code only emits the new strings.
- **Per-type stats source of truth** lives in a new file `src/engine/unit-types.ts`. The old `DEFAULT_HP` and `DEFAULT_STRENGTH` records in `src/engine/units.ts` are deleted and re-exported from `unit-types.ts`.
- **Facing values** are exactly `"N" | "NE" | "SE" | "S" | "SW" | "NW"`. Default facing on spawn: side A faces `"E"` no longer — instead side A faces `"SE"`, side B faces `"NW"`. Reason: `"E"` is not in the legal set; the demo already uses `"E"` and `"W"`, both of which are illegal under this lock and must be rewritten.
- **Move points** are spent per-turn, reset at turn end. Pathfinding is BFS-based, blocked by water and mountain (except `interceptor` which is allowed on mountain at full cost). Cost per hex is `1` for plains/hills/forest, except `raider` pays `2` per forest hex (rounded up), capped at its `movePoints`.
- **Ranged attack** for `siege` (range 2): legal target hex must be in `range <= 2`, and the line through any number of forest hexes is allowed (Indirect Fire). Mountain hexes still block as occupants — siege cannot attack a unit standing on a mountain (mountain occupants are immune to siege only this pass; revisit in future plan).
- **Ability triggers**:
  - `vanguard_sight` (scout): at the start of *its owner's* turn, reveal a fog radius of 2 hexes around each scout.
  - `flanker` (raider): when attacking, if the attacker hex is **not** in the defender's frontal three-arc (defender facing + ±60°), apply `+1 STR` to the attacker's damage roll for that exchange.
  - `overwatch` (interceptor): once per opposing turn, if any enemy unit ends a movement step adjacent to this interceptor, the interceptor immediately retaliates with one normal attack against that enemy. The retaliation does **not** consume the interceptor's own next attack action.
  - `indirect_fire` (siege): the range-2 attack ignores forest line-of-sight penalty (in this plan, "ignores" simply means: forest hexes between attacker and target do not invalidate the attack).
  - `rally` (captain): on the captain's owner's turn start, every friendly unit adjacent to the captain gains a transient `+1 STR` aura that lasts until the captain's owner's next turn start. Aura stacks do not multiply (one aura at a time per unit, regardless of how many adjacent captains).
- **Action contract additions**: extend `AgentActionType` to `"move" | "attack" | "pass" | "ability"`. The shared types file is no longer marked FROZEN; remove that comment. Add `path?: CubeCoord[]` for multi-hex moves and `ability?: { id: string }` for ability invocations. Backwards-compatible: existing `"move"` actions with only `from`/`to` still resolve as a 1-step move, costing 1 move point.

## Phase 1: Type Substrate and Aliasing

### Affected Files

- `src/shared/types.ts` — extend `Unit.type` union, add `Unit.facing`, drop FROZEN comment, extend `AgentActionType`, add `AgentAction.path` and `AgentAction.ability`.
- `src/engine/unit-types.ts` — **new file**. Holds `UNIT_TYPES`, `DEFAULT_HP`, `DEFAULT_STRENGTH`, `MOVE_POINTS`, `RANGE`, `FACING_VALUES`, `LEGACY_ALIAS`, and helper functions.
- `src/engine/units.ts` — drop in-file `DEFAULT_HP`/`DEFAULT_STRENGTH`/`UnitType`; re-export from `unit-types.ts`. Apply aliasing on `createUnit` input. Default `facing` per side.
- `src/engine/board.ts` — no change in this phase.

### Changes

In `src/shared/types.ts`:

```ts
export type Facing = "N" | "NE" | "SE" | "S" | "SW" | "NW";
export type UnitType = "scout" | "raider" | "interceptor" | "siege" | "captain";
export type LegacyUnitType = "infantry" | "heavy";
export type AcceptedUnitType = UnitType | LegacyUnitType;

export interface Unit {
  id: string;
  owner: "A" | "B";
  position: CubeCoord;
  strength: number;
  hp: number;
  type: UnitType;          // engine emits canonical type only
  facing: Facing;
}

export type AgentActionType = "move" | "attack" | "pass" | "ability";

export interface AgentAction {
  type: AgentActionType;
  from?: CubeCoord;
  to?: CubeCoord;
  path?: CubeCoord[];
  ability?: { id: AbilityId };
  confidence: number;
  metadata?: Record<string, unknown>;
}

export type AbilityId =
  | "vanguard_sight"
  | "flanker"
  | "overwatch"
  | "indirect_fire"
  | "rally";
```

Remove the line:

```
// FROZEN: Do not modify contract semantics.
```

In `src/engine/unit-types.ts` (new):

```ts
import type { UnitType, LegacyUnitType, AcceptedUnitType, Facing } from "../shared/types.ts";

export const UNIT_TYPES: readonly UnitType[] =
  ["scout", "raider", "interceptor", "siege", "captain"] as const;

export const FACING_VALUES: readonly Facing[] =
  ["N", "NE", "SE", "S", "SW", "NW"] as const;

export const DEFAULT_HP: Record<UnitType, number> = {
  scout: 3, raider: 4, interceptor: 5, siege: 6, captain: 8,
};

export const DEFAULT_STRENGTH: Record<UnitType, number> = {
  scout: 2, raider: 4, interceptor: 4, siege: 7, captain: 5,
};

export const MOVE_POINTS: Record<UnitType, number> = {
  scout: 3, raider: 3, interceptor: 2, siege: 1, captain: 2,
};

export const RANGE: Record<UnitType, number> = {
  scout: 1, raider: 1, interceptor: 1, siege: 2, captain: 1,
};

export const LEGACY_ALIAS: Record<LegacyUnitType, UnitType> = {
  infantry: "interceptor",
  heavy: "captain",
};

export function canonicalType(input: AcceptedUnitType): UnitType {
  if (input === "infantry" || input === "heavy") return LEGACY_ALIAS[input];
  return input;
}

export function defaultFacing(owner: "A" | "B"): Facing {
  return owner === "A" ? "SE" : "NW";
}
```

In `src/engine/units.ts`:

- Delete the inline `DEFAULT_HP`, `DEFAULT_STRENGTH`, and `UnitType` block.
- `import { DEFAULT_HP, DEFAULT_STRENGTH, MOVE_POINTS, RANGE, canonicalType, defaultFacing } from "./unit-types.ts";` and re-export `UnitType` from there.
- `createUnit(owner, pos, type)` accepts `AcceptedUnitType`, normalizes via `canonicalType`, and seeds `facing: defaultFacing(owner)`.
- `unitTypeFor(seed, coord, index)` selects from `UNIT_TYPES` (5 entries) instead of the old 3.

### Unit Tests

- `tests/engine/unit-types.test.ts` (new) — verify each canonical type maps to the documented HP/STR/move/range; legacy aliasing maps `infantry → interceptor` and `heavy → captain`; canonicalType passes scout through.
- `tests/engine/units.test.ts` (new) — verify `createUnit` accepts both legacy and canonical input, always emits canonical `type`, always assigns the legal `facing` for that owner, and that `unitTypeFor` distributes across all 5 canonical types over a stable seed sweep (deterministic).
- `tests/shared-types.test.ts` (extend) — verify the action contract still accepts a minimal `move` and now also accepts `ability` and `path` shapes; legacy-typed units remain parseable.

## Phase 2: Movement Points and Multi-Hex Pathing

### Affected Files

- `src/engine/movement.ts` — replace single-hex `canMove` with `canMovePath`, add `pathCost`, retain `canMove`/`applyMove` as 1-hex convenience wrappers.
- `src/engine/turns.ts` — read `path` from `AgentAction`, validate via `canMovePath`, deduct from a per-turn `movePoints` budget.
- `src/engine/match.ts` — initialize per-side `movePointsRemaining` map at turn start; reset on turn boundary.

### Changes

In `src/engine/movement.ts`, add:

```ts
import { MOVE_POINTS } from "./unit-types.ts";

export interface PathStep {
  coord: CubeCoord;
  cost: number;
}

export function pathCost(unit: Unit, board: HexCell[][], path: CubeCoord[]): number | null {
  // Returns total cost if every step is legal, else null.
  // Step rules:
  //   - distance(prev, step) === 1
  //   - destination cell exists
  //   - destination terrain is not water (always)
  //   - destination terrain is not mountain UNLESS unit.type === "interceptor"
  //   - destination cell is empty (no friendly OR enemy unit) — pathing is movement-only;
  //     attacks are a separate action.
  // Cost rules:
  //   - plains, hills: 1
  //   - forest: 1, except raider pays 2
  //   - mountain (interceptor only): 1
}

export function canMovePath(unit: Unit, board: HexCell[][], path: CubeCoord[], budget: number): boolean {
  // Wraps pathCost, returns true iff cost !== null and cost <= budget.
}

export function applyPath(board: HexCell[][], unit: Unit, path: CubeCoord[]): HexCell[][] {
  // Moves the unit along path in-order on a deep clone, throws if any step illegal.
  // Final unit.facing = direction of the last step (mapped via cubeDirToFacing).
}

export function cubeDirToFacing(from: CubeCoord, to: CubeCoord): Facing {
  // Maps the 6 axial direction vectors to one of the 6 Facing enum values.
  //  ( +1, -1, 0) → "NE"
  //  ( +1,  0,-1) → "SE"
  //  (  0, +1,-1) → "S"
  //  ( -1, +1, 0) → "SW"
  //  ( -1,  0,+1) → "NW"
  //  (  0, -1,+1) → "N"
}
```

`canMove` and `applyMove` remain, defined as the single-step special case (`canMovePath(unit, board, [from, to], MOVE_POINTS[unit.type])`).

In `src/engine/turns.ts`:

- At turn start, initialize `state.movePointsRemaining = { [unitId]: MOVE_POINTS[unit.type] }` for every unit owned by the side whose turn it is.
- When resolving a `"move"` action: if `action.path` is provided, validate via `canMovePath` against the remaining budget for that unit; on success, deduct the path cost from that unit's remaining budget. If only `from`/`to` is provided (no `path`), treat it as a 1-hex path `[from, to]`.
- A unit may issue at most one `"move"` action per turn. A unit may also issue at most one `"attack"` or `"ability"` action per turn. A `"pass"` consumes the unit's remaining actions for that turn.

### Unit Tests

- `tests/engine/pathing.test.ts` (new) — pathCost matches the cost table for plains/hills/forest/mountain on both raider and non-raider; mountain rejected for everyone except interceptor; water rejected for all; occupied cells rejected.
- `tests/engine/movement.test.ts` (extend) — `canMovePath` accepts a 3-hex path within budget for a scout, rejects a 4-hex path; `applyPath` updates `facing` to the final-step direction; round-trip on a deep-cloned board does not mutate the input.
- `tests/engine/turns.test.ts` (extend) — multi-hex move deducts correct points; second move attempt for same unit in same turn rejected; turn-end resets the budget.

## Phase 3: Ranged Attack and Combat Modifiers

### Affected Files

- `src/engine/combat.ts` — accept attacker `range` and modifier flags; add ranged-attack resolution.
- `src/engine/movement.ts` — add `inRange(attacker, defender, board)` helper.
- `src/engine/turns.ts` — wire `"attack"` actions through new `resolveCombat` signature.
- `src/engine/coords.ts` — re-export `distance` and add `frontalArcContains(facing, fromCoord, toCoord)`.

### Changes

In `src/engine/combat.ts`:

```ts
export interface CombatModifiers {
  rangedIndirectFire: boolean; // siege Indirect Fire — forest cells between are ignored
  flankerBonus: boolean;       // raider Flanker — attacker hex outside defender frontal arc
  rallyAuraOnAttacker: boolean; // captain Rally — +1 STR if attacker has aura this turn
  attackerOnMountain: boolean; // attacker is on mountain — attack damage = 0 (kept rule)
}

export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  defenderTerrain: HexCell["terrain"],
  modifiers: CombatModifiers,
): CombatResult {
  const baseAtk = attacker.strength + (modifiers.flankerBonus ? 1 : 0) + (modifiers.rallyAuraOnAttacker ? 1 : 0);
  const atkDmgActual = modifiers.attackerOnMountain ? 0 : baseAtk;
  const baseDef = defender.strength + TERRAIN_DEFENSE_BONUS[defenderTerrain];

  // Range-2 attacks (siege Indirect Fire): defender does NOT retaliate.
  // Reason: attacker is two hexes away; defender has no melee reach.
  // This rule is locked for this plan; revisit in a future plan if balance demands counter-fire.
  // The caller signals this by passing `modifiers.rangedIndirectFire = true`.
  const defDmgActual = modifiers.rangedIndirectFire ? 0 : baseDef;

  const defHpAfter = Math.max(0, defender.hp - atkDmgActual);
  const atkHpAfter = Math.max(0, attacker.hp - defDmgActual);

  const destroyed: string[] = [];
  if (defHpAfter === 0 && atkHpAfter === 0) {
    destroyed.push(attacker.id); // existing tie rule preserved
  } else {
    if (defHpAfter === 0) destroyed.push(defender.id);
    if (atkHpAfter === 0) destroyed.push(attacker.id);
  }

  return { attackerHp: atkHpAfter, defenderHp: defHpAfter, destroyed };
}
```

In `src/engine/movement.ts`:

```ts
import { RANGE } from "./unit-types.ts";
import { distance } from "./coords.ts";

export function inRange(attacker: Unit, defender: Unit): boolean {
  return distance(attacker.position, defender.position) <= RANGE[attacker.type];
}
```

In `src/engine/coords.ts`, add:

```ts
const ARC_NEIGHBORS: Record<Facing, [Facing, Facing, Facing]> = {
  N:  ["NW", "N",  "NE"],
  NE: ["N",  "NE", "SE"],
  SE: ["NE", "SE", "S"],
  S:  ["SE", "S",  "SW"],
  SW: ["S",  "SW", "NW"],
  NW: ["SW", "NW", "N"],
};

export function frontalArcContains(facing: Facing, defenderPos: CubeCoord, attackerPos: CubeCoord): boolean {
  // Compute the axial direction from defender to attacker (one step), map to Facing,
  // return true iff that Facing is within ARC_NEIGHBORS[facing].
  // For non-adjacent attackers (range 2), interpret based on the immediate ring.
}
```

In `src/engine/turns.ts`, when resolving `"attack"`:

- Validate `attacker.owner === side`.
- Validate `inRange(attacker, defender)`.
- Compute modifiers:
  - `rangedIndirectFire = distance > 1 && attacker.type === "siege"`.
  - `flankerBonus = attacker.type === "raider" && !frontalArcContains(defender.facing, defender.position, attacker.position)`.
  - `rallyAuraOnAttacker = state.rallyAura.has(attacker.id)` (set at turn start by Phase 4).
  - `attackerOnMountain = cellAt(board, attacker.position).terrain === "mountain"`.
- Call `resolveCombat`, apply HP updates, remove destroyed units. If the attacker survives a melee attack and is on the same hex (always true), facing is set to the cube direction toward the defender.

### Unit Tests

- `tests/engine/combat.test.ts` (extend) — siege attacks at distance 2 with `rangedIndirectFire=true` produces no defender retaliation; raider with flanker bonus deals `strength + 1`; captain rally aura adds `+1` to friendly attacker, not to a non-aura attacker; mountain attacker still deals 0; all preexisting tie-rule cases pass.
- `tests/engine/movement.test.ts` (extend) — `inRange` returns true for siege at distance 2, false at 3; for scout at 1, false at 2.
- `tests/engine/coords.test.ts` (extend) — `frontalArcContains` is symmetric across the 6 facings; an attacker directly behind the defender returns false; an attacker in any of the front three returns true.

## Phase 4: Abilities (`vanguard_sight`, `flanker`, `overwatch`, `indirect_fire`, `rally`)

### Affected Files

- `src/engine/abilities.ts` — **new file**. Pure functions for ability application.
- `src/engine/turns.ts` — call `applyTurnStartAbilities(state, side)` at turn start; call `applyOverwatch(state, defender, attackerStep)` after each movement step landing adjacent to an interceptor; resolve explicit `"ability"` actions through `resolveAbilityAction`.
- `src/engine/match.ts` — track per-side ability cooldowns and per-turn aura sets.

### Changes

`src/engine/abilities.ts`:

```ts
export interface AbilityState {
  rallyAura: Set<string>;            // unit ids that have +1 STR aura this turn
  overwatchUsedThisOpposingTurn: Set<string>; // interceptor ids that already retaliated
  fogReveals: Map<string, CubeCoord[]>; // unitId → revealed hexes this turn
}

export function applyTurnStartAbilities(state: MatchState, side: "A" | "B", board: HexCell[][]): {
  fogReveals: CubeCoord[];          // for fog overlay
  rallyAura: Set<string>;
} {
  // 1. For each scout owned by `side`, mark hexes within distance 2 as revealed for that side.
  // 2. For each captain owned by `side`, find every adjacent friendly unit and add its id to rallyAura.
  // 3. Clear overwatchUsedThisOpposingTurn for the OTHER side (their interceptors regain their counter).
}

export function maybeOverwatchOnStep(
  state: MatchState,
  movingUnit: Unit,
  arrivedAt: CubeCoord,
  board: HexCell[][],
  abilityState: AbilityState,
): { combat?: CombatResult; defenderId?: string } {
  // For each enemy interceptor adjacent to arrivedAt that is NOT in overwatchUsedThisOpposingTurn:
  //   resolve a single attack against movingUnit using normal melee resolveCombat (range 1, no flanker);
  //   add interceptor.id to overwatchUsedThisOpposingTurn.
  // If multiple interceptors are eligible, the one with the lowest unit.id (lexicographic) goes first;
  // if movingUnit is destroyed, subsequent interceptors do not retaliate.
}

export function resolveAbilityAction(
  state: MatchState,
  action: AgentAction,
  board: HexCell[][],
  abilityState: AbilityState,
): { stateDelta: Partial<MatchState>; events: EngineEvent[] } {
  // The only ability invocable as an explicit action is currently NONE — vanguard_sight, rally,
  // overwatch, and flanker are passive. indirect_fire is implicit in any siege range-2 attack.
  // This function returns { stateDelta: {}, events: [] } for any action.ability.id and emits a
  // single warning event {type: "ability_no_op", payload:{abilityId, reason:"passive"}}.
  // It exists so the contract supports future active abilities without another shape change.
}
```

In `src/engine/turns.ts`:

- At the very start of `advanceTurn` (before action resolution), call `applyTurnStartAbilities` and store the result in a transient `abilityState` for that side's turn. Store `abilityState.rallyAura` on `state.rallyAura`.
- After every successful movement step in a path, call `maybeOverwatchOnStep`. If the moving unit is destroyed mid-path, abort the remaining steps.
- When resolving `"ability"` actions, call `resolveAbilityAction` and append its events to the turn event log.

### Unit Tests

- `tests/engine/abilities.test.ts` (new) — turn start with one scout reveals a 19-hex region (radius 2, including center); rally aura is granted to all friendly units adjacent to a captain and to no others; overwatch fires once per opposing turn per interceptor and resets when the scope flips back; indirect_fire as part of a siege attack at distance 2 invokes `resolveCombat` with `rangedIndirectFire=true`.
- `tests/engine/turns.test.ts` (extend) — a scout moving 3 steps into an interceptor's adjacency triggers exactly one overwatch retaliation; a unit destroyed by overwatch does not complete the remaining path.
- `tests/engine/combat.test.ts` (extend) — captain with rally aura attacker deals `strength + 1`; raider with flanker plus rally deals `strength + 2`.

## Phase 5: Public Render and Catalog Reconciliation

### Affected Files

- `src/public/unit-render.js` — render facing chevron on every unit token; render range/move-points overlays on hover.
- `src/public/unit-catalog.js` — switch the source of truth from a hardcoded UI catalog to `unit-types.ts` via a tiny build-side export.
- `src/public/arena.js` — when receiving a unit from the engine, expect `facing` and a canonical type; remove any client-side fallback that re-injects `infantry` or `heavy` glyphs.
- `src/public/coords.js` — add `axialDirIndex(facing)` helper for chevron placement.
- `src/public/demo-replay.js` — rewrite all `unit(...)` calls to use canonical types and legal facings (`"E"` and `"W"` are no longer legal; convert `"E"` → `"SE"` and `"W"` → `"NW"`).
- `src/server.ts` — expose a small JSON endpoint `/arena/api/unit-types` returning the canonical stat table from `unit-types.ts` so the catalog UI is engine-driven.

### Changes

`unit-render.js`:

- Add a small chevron `<polygon>` placed on the outer edge of the token, rotated by `facing` (`N` = 0°, then 60° per step clockwise).
- Tooltip / hover card pulls `range`, `movePoints`, and `ability.name` from the JSON returned by `/arena/api/unit-types` (cached on first paint).

`unit-catalog.js`:

- Replace the hand-maintained `UNIT_CATALOG` constant with an `async loadUnitCatalog()` that fetches `/arena/api/unit-types` once and caches; render functions call `await loadUnitCatalog()`.

`demo-replay.js`:

- Rewrite the `BOARD` literal unchanged (radius 4 stays). All `unit("...","A",...,"infantry","E")` become `unit("...","A",...,"interceptor","SE")`; `"heavy"` → `"captain"`; `"E"` → `"SE"`; `"W"` → `"NW"`. Other types and coords unchanged.

`src/server.ts`:

- Mount `GET /arena/api/unit-types` returning:

```ts
{
  types: ["scout","raider","interceptor","siege","captain"],
  stats: {
    scout:       { hp: 3, strength: 2, movePoints: 3, range: 1, ability: "vanguard_sight" },
    raider:      { hp: 4, strength: 4, movePoints: 3, range: 1, ability: "flanker" },
    interceptor: { hp: 5, strength: 4, movePoints: 2, range: 1, ability: "overwatch" },
    siege:       { hp: 6, strength: 7, movePoints: 1, range: 2, ability: "indirect_fire" },
    captain:     { hp: 8, strength: 5, movePoints: 2, range: 1, ability: "rally" },
  },
  abilities: {
    vanguard_sight: { trigger: "turn_start", description: "Reveal fog within 2 hexes." },
    flanker:        { trigger: "passive_on_attack", description: "+1 STR when attacking outside defender frontal arc." },
    overwatch:      { trigger: "passive_on_enemy_step", description: "Counter-attack once per opposing turn." },
    indirect_fire:  { trigger: "passive_on_attack", description: "Range 2; ignores forest line-of-sight." },
    rally:          { trigger: "turn_start", description: "Adjacent friendly units gain +1 STR aura until next own turn." },
  },
}
```

### Unit Tests

- `tests/engine/render-contract.test.ts` (new, runs in node) — calling the endpoint handler returns the exact shape above; the values match `DEFAULT_HP`, `DEFAULT_STRENGTH`, `MOVE_POINTS`, `RANGE` from `unit-types.ts` (no drift).
- `tests/engine/demo-coords.test.ts` (new) — every `facing` string in `src/public/demo-replay.js` is in `FACING_VALUES`; every `type` string is in `UNIT_TYPES`; every coordinate exists on the existing radius-4 board.
- `tests/engine/render.test.ts` (extend) — render output for a sample unit emits the chevron polygon with the correct rotation per facing; unit-catalog renders 5 entries from a stubbed JSON response.

## Phase 6: Action Contract Migration and Backwards Compatibility

### Affected Files

- `src/runner/runner.ts` (or its current canonical home under `tests/fixtures/runtime/runner.ts` if Phase 3 of the prior structural plan moved it) — accept new action shapes; legacy 1-hex `"move"` still works.
- `src/gateway/validator.ts` — extend action schema to validate `path`, `ability`, and the extended `AgentActionType`.
- `src/persistence/match-store.ts` — persist `unit.facing` and any `path` taken on a step (if it already records steps).
- `src/agents/runner.ts` (if still under `src/`) — same as above.

### Changes

- Validator (`src/gateway/validator.ts`):
  - `type ∈ { "move", "attack", "pass", "ability" }`.
  - For `"move"`: either `to: CubeCoord` (legacy single-hex) OR `path: CubeCoord[]` of length 1–`MOVE_POINTS[unit.type]+1`. `from` required in either case.
  - For `"attack"`: `from` and `to` required, distance `<= RANGE[unit.type]`.
  - For `"ability"`: `ability.id ∈ ABILITY_IDS`. `from` required; `to` optional.
  - For `"pass"`: only `confidence` required.
- Match store: include `facing` in the unit serialization. Include `path: CubeCoord[]` in the `unit_moved` event payload.

### Unit Tests

- `tests/gateway/validator.test.ts` (extend) — accepts every legal action; rejects an `"attack"` outside range; rejects a `"move"` path with a step distance > 1; rejects `path` longer than the type's move budget; accepts a legacy `{type:"move", from, to}` action without `path`.
- `tests/runner/turn-dispatch.test.ts` (extend) — multi-hex `path` move dispatches one engine call and one event with the full path; an `"ability"` action dispatches one event regardless (no-op for current ability set, per Phase 4).
- `tests/persistence/match-store.test.ts` (extend if missing, otherwise create) — `unit.facing` persists on serialize/deserialize; `unit_moved` payload contains the full path.

## Phase 7: Substantiation

### Affected Files

- `docs/META_LEDGER.md` — append entry for this plan with phase IDs P1–P6.
- `docs/SHADOW_GENOME.md` — record the prior failure pattern this plan repairs (UI advertised mechanics the engine did not simulate; legacy unit type names still flowing through demo and fixtures).
- `.agent/staging/AUDIT_REPORT.md` — refresh with the post-implementation snapshot (no new code in this phase, only doc seal).
- `tests/engine/e2e.test.ts` — extend to play 12 turns of a scripted match where every type acts at least once (scout move 3 + reveal; raider flank attack; interceptor overwatch; siege range-2 attack; captain rally + adjacency attack); assert that the final state matches a golden snapshot.

### Changes

- Append a META_LEDGER entry with `plan_id: 2026-04-22-plan-a-engine-truth-repair`, list of phase commits, and a Merkle root once the prior 6 phases are sealed. (Builder runs `/qor-substantiate` at this point.)
- Append a SHADOW_GENOME entry titled `Engine-UI Mechanics Drift` describing the failure mode and the structural fix (single source of truth in `src/engine/unit-types.ts`).
- E2E test asserts that the engine is internally consistent across all five units and all five abilities in one continuous match.

### Unit Tests

- `tests/engine/e2e.test.ts` (extend) — 12-turn scripted match; final state matches a snapshot; events log includes one `unit_moved` per move action, one `unit_attacked` per attack action, one `ability_no_op` per `"ability"` action, and one `turn_ended` per turn boundary.

## Builder Execution Notes

- Phases run in order. Each phase is a single ticket. Builder MUST not interleave phases.
- After each phase, builder runs the standard test suite (`bun test`) and commits with message `builder tick NNN: plan-a-phase-N-<short-name>`.
- `/qor-audit` runs after Phase 7 only. Earlier phases self-verify via their own test files.
- If a phase's test suite fails, builder stops and surfaces the failure for human review. Builder MUST NOT skip a failing test; do not add `.skip` markers under any condition.
- All plan-A code paths are covered by tests in this document. If builder finds a function that needs implementation but is not enumerated above, builder STOPS and surfaces the gap rather than improvising.
