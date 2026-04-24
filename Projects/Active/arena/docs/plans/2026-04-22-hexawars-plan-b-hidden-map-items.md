# Plan B: HexaWars Hidden Map Items

> Explicit-by-contract plan for the builder queue. Runs after Plan A and Plan C are sealed. No design judgment required at runtime.

## Goal

Introduce hidden, pickup-able map items that reward scouting, open tactical branches, and force AI agents to reason about state they cannot directly observe. Items are placed deterministically on the radius-7 board (Plan C), hidden from both sides until a unit steps onto their hex, carried in a per-unit inventory with a hard cap, and consumed via a new explicit action.

Four items ship in this plan:

- `ammo_cache` — grants one stored attack usable any turn (including the pickup turn).
- `deflector_shield` — once armed, absorbs incoming damage up to a cap for a bounded duration.
- `camo` — makes the carrying unit invisible to the opposing side's vision until it attacks or the effect expires.
- `air_lift` — one-shot teleport to any empty hex on a friendly-controlled tile.

This plan builds on Plan A's extended action contract and Plan C's radius-7 board. It does **not** introduce new unit types, abilities, or terrain. It does **not** change Plan A's ability set.

## Non-Goals

- No new unit types, abilities, or per-type stat changes. Plan A is the source of truth.
- No board radius change. Plan C is the source of truth.
- No dynamic item spawns mid-match. Items spawn once at match start from a seeded table.
- No cross-unit inventory transfer. Items cannot be traded, dropped, or re-hidden.
- No item crafting or combination effects.
- No item persistence across matches.
- No item UI drawer, trading panel, or operator-facing inventory editor beyond the hover card already present on unit tokens.

## Open Questions

- None. All decisions in this document are final unless explicitly re-opened by `/qor-plan`.

## Decision Lock-Ins (Builder MUST follow exactly)

- **Action type extension.** `AgentActionType` becomes `"move" | "attack" | "pass" | "ability" | "use_item"`. Plan A already removed the FROZEN marker from `src/shared/types.ts`; this plan extends the union further. `"use_item"` is a distinct type from `"ability"`: abilities are intrinsic to unit types and passive; items are picked-up consumables and require explicit invocation.
- **Item id set** is exactly `"ammo_cache" | "deflector_shield" | "camo" | "air_lift"`. No other item ids exist in this plan. The union lives in `src/shared/types.ts` as `ItemId` and is re-exported from `src/engine/items.ts`.
- **Spawn rule.** Items spawn exactly once at match start. PRNG seed is `20260422` (same as Plan C's demo board for generator parity, but the PRNG stream is independent — a separate seeded stream starts at `seed ^ 0xA17E_0001`). The spawn set size is **13** items over the 169-cell board, distributed as:
  - `ammo_cache`: 3
  - `deflector_shield`: 4
  - `camo`: 3
  - `air_lift`: 3
- **Spawn exclusion.** An item may not spawn on:
  - a cell where a starting unit is placed (positions `{q: ±1, ±2, ±3, r: 0}`),
  - a cell adjacent to any starting unit (distance 1),
  - a `water` cell,
  - a `mountain` cell.
  The generator picks eligible cells in a deterministic scan order (`lex(q, r)`) and assigns item ids in the declared order (all ammo caches first, then deflector shields, then camo, then air lifts). If fewer than 13 eligible cells exist for any seed (not possible at the declared sizes on a radius-7 board, but asserted in tests), the generator throws.
- **Visibility.** Items are invisible to both sides until **any** unit ends a movement step on the item hex. On discovery, the item transfers to that unit's inventory (if capacity allows) AND a `item_discovered` event is emitted with the item id, hex, discovering unit id, and discovering owner. The event is visible to both sides' transcripts. Undiscovered item positions are NOT leaked in any payload sent to an agent.
- **Pickup.** Automatic on arrival at the item hex. If the unit's inventory is full, the item remains on the hex and an `item_pickup_declined` event fires (visible to both sides). Another unit may pick it up later by stepping onto the same hex.
- **Inventory cap.** Exactly **2** items per unit. There is no shared side-wide pool.
- **Item persistence.** Unused items are destroyed when their carrier is destroyed. They do not drop back onto the map.
- **Action shape for `use_item`.**
  ```ts
  {
    type: "use_item";
    from: CubeCoord;          // carrier's current position
    itemId: ItemId;           // which slot to consume
    targetHex?: CubeCoord;    // required iff itemId === "air_lift", ignored otherwise
    confidence: number;
    metadata?: Record<string, unknown>;
  }
  ```
  One `"use_item"` per unit per turn. It does **not** consume the unit's `"move"` or `"attack"` action slots unless explicitly stated below (`air_lift` does consume the move slot; see effect spec).
- **Effect specs (locked, no interpretation required).**
  - `ammo_cache`: adds one **stored attack** to the carrier. Stored attacks are spent implicitly by subsequent `"attack"` actions in the same OR later turns. Normal per-turn rule is one attack per unit; a carrier with N stored attacks may issue up to `1 + N` attack actions in a single turn, in sequence (validator must permit). Using the `ammo_cache` item means invoking `use_item` with `itemId: "ammo_cache"` to **consume** the inventory slot and add the stored charge; until consumed it remains a slot-occupying item with no effect. Stored attacks do not expire.
  - `deflector_shield`: invoking `use_item` **arms** the shield on the carrier. Armed state absorbs up to **3 points** of incoming attack damage total, split across any number of incoming attacks, and expires at the end of the carrier's owner's **next** turn end (i.e., roughly one full round of protection). Rally aura stacking rules do not affect the shield. A unit cannot have two shields armed at once; re-arming resets the remaining absorption to 3 and the duration to "until end of owner's next turn".
  - `camo`: invoking `use_item` sets the carrier to `camouflaged = true`. While camouflaged, the carrier is hidden from all payloads sent to the opposing side's agent (the carrier's cell appears as unoccupied in that agent's `gameState.units` view). The carrier remains visible in the public render and both transcripts. Camouflage breaks **immediately** when the carrier issues any `"attack"` action, is struck by overwatch, or at the end of the carrier's owner's **second** turn end (2 full rounds). Multiple camo activations do not stack; re-invoking resets the 2-round timer.
  - `air_lift`: invoking `use_item` with `targetHex` teleports the carrier to `targetHex`. Legal `targetHex` must satisfy:
    - `cellAt(targetHex)` exists,
    - terrain is not `water` or `mountain` (mountain allowed only if the carrier is an `interceptor`, matching Plan A movement rules),
    - no unit occupies `targetHex`,
    - `targetHex` is controlled by the carrier's own side OR is adjacent to a friendly unit at invocation time.
    `air_lift` consumes the carrier's `"move"` slot for that turn (no additional `"move"` action may be issued). Move points are NOT deducted; `air_lift` ignores the move-points budget entirely. Carrier `facing` after air lift defaults to `defaultFacing(owner)`. Overwatch does **not** trigger on air-lift arrival (the carrier did not perform movement steps).
- **PRNG.** Items use a self-contained xorshift32 stream seeded from `(20260422 ^ 0xA17E_0001) >>> 0`. Builder must NOT reuse the terrain PRNG state from Plan C's generator.
- **Agent payload redaction.** When emitting `gameState` to an agent, the engine must:
  - Omit the `items` field entirely for hexes the receiving side has not discovered.
  - Omit `camouflaged` units owned by the opposing side from `units[]`.
  - Include only the receiving side's own items in `units[].inventory`; opposing-side `inventory` arrays are replaced with `inventory: []`.
- **Spectator payload.** The public WebSocket spectator stream shows everything: full item positions, inventories of all units, camouflage state. Spectators see truth; agents see partial information.

## Phase 1: Item Type Substrate and PRNG

### Affected Files

- `src/shared/types.ts` — add `ItemId`, extend `AgentActionType`, extend `AgentAction` with `itemId` and `targetHex`, add optional `Unit.inventory: ItemId[]`, `Unit.storedAttacks: number`, `Unit.shieldAbsorb: number`, `Unit.shieldExpiresAtTurn: number | null`, `Unit.camouflaged: boolean`, `Unit.camouflageExpiresAtTurn: number | null`.
- `src/engine/items.ts` — **new file**. Holds `ITEM_IDS`, `ITEM_SPAWN_COUNTS`, `itemPrng(seed)`, `defaultUnitItemState()`, and forward declarations for effect resolvers (implemented in Phase 3).
- `src/engine/unit-types.ts` (from Plan A) — no changes in this phase.

### Changes

`src/shared/types.ts`:

```ts
export type ItemId = "ammo_cache" | "deflector_shield" | "camo" | "air_lift";
export const ITEM_IDS: readonly ItemId[] = ["ammo_cache", "deflector_shield", "camo", "air_lift"] as const;

export type AgentActionType = "move" | "attack" | "pass" | "ability" | "use_item";

export interface AgentAction {
  type: AgentActionType;
  from?: CubeCoord;
  to?: CubeCoord;
  path?: CubeCoord[];
  ability?: { id: AbilityId };
  itemId?: ItemId;
  targetHex?: CubeCoord;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface Unit {
  id: string;
  owner: "A" | "B";
  position: CubeCoord;
  strength: number;
  hp: number;
  type: UnitType;
  facing: Facing;
  inventory: ItemId[];                     // max 2 entries
  storedAttacks: number;                   // default 0
  shieldAbsorb: number;                    // 0 when inactive, up to 3 when armed
  shieldExpiresAtTurn: number | null;      // absolute turn index at which shield drops
  camouflaged: boolean;                    // default false
  camouflageExpiresAtTurn: number | null;  // absolute turn index
}

export interface HexCellItem {
  hex: CubeCoord;
  itemId: ItemId;
}
```

`src/engine/items.ts` (new):

```ts
import type { CubeCoord } from "../shared/types.ts";
import { ITEM_IDS, type ItemId } from "../shared/types.ts";

export const INVENTORY_CAP = 2;
export const SHIELD_ABSORB_MAX = 3;
export const SHIELD_DURATION_TURNS = 1;      // carrier's next turn end
export const CAMO_DURATION_TURNS = 2;
export const ITEM_PRNG_SEED = (20260422 ^ 0xA17E_0001) >>> 0;

export const ITEM_SPAWN_COUNTS: Record<ItemId, number> = {
  ammo_cache: 3,
  deflector_shield: 4,
  camo: 3,
  air_lift: 3,
};

export function totalItemCount(): number {
  return Object.values(ITEM_SPAWN_COUNTS).reduce((a, b) => a + b, 0);
}

export function itemPrng(seed: number = ITEM_PRNG_SEED): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

export function defaultUnitItemState() {
  return {
    inventory: [] as ItemId[],
    storedAttacks: 0,
    shieldAbsorb: 0,
    shieldExpiresAtTurn: null as number | null,
    camouflaged: false,
    camouflageExpiresAtTurn: null as number | null,
  };
}
```

`src/engine/units.ts`:

- `createUnit` merges `defaultUnitItemState()` into the returned `Unit`.

### Unit Tests

- `tests/engine/items.test.ts` (new) — `ITEM_SPAWN_COUNTS` values sum to 13; `ITEM_IDS.length === 4`; `itemPrng(seed)` is deterministic (two streams from the same seed produce identical first 100 draws); `itemPrng(a) !== itemPrng(b)` streams diverge for different seeds.
- `tests/shared-types.test.ts` (extend) — an `AgentAction` with `type: "use_item", itemId: "ammo_cache", from: {...}, confidence: 1` parses; an action with `type: "use_item"` but no `itemId` fails validation.
- `tests/engine/units.test.ts` (extend) — `createUnit` returns a unit with `inventory: []`, `storedAttacks: 0`, `shieldAbsorb: 0`, `shieldExpiresAtTurn: null`, `camouflaged: false`, `camouflageExpiresAtTurn: null`.

## Phase 2: Deterministic Spawn Table

### Affected Files

- `src/engine/items.ts` — add `spawnItems(board, startingUnits, seed)` returning the full list of `HexCellItem`.
- `src/engine/board.ts` — board state grows an optional `items: Map<string, ItemId>` keyed by `"q,r"`.
- `src/engine/match.ts` — call `spawnItems` once during match initialization, after `placeStartingUnits`.
- `tests/engine/items-spawn.test.ts` (new) — deterministic spawn tests.

### Changes

`src/engine/items.ts`:

```ts
export interface SpawnOptions {
  board: HexCell[][];
  startingUnits: Unit[];
  seed?: number;
}

export function spawnItems(opts: SpawnOptions): HexCellItem[] {
  const { board, startingUnits, seed = ITEM_PRNG_SEED } = opts;
  const prng = itemPrng(seed);

  // 1. Collect all in-disc cells; exclude water, mountain, starting positions, and distance-1 neighbors.
  const blocked = new Set<string>();
  for (const u of startingUnits) {
    blocked.add(key(u.position));
    for (const n of neighbors(u.position)) blocked.add(key(n));
  }

  const eligible: CubeCoord[] = [];
  for (const row of board) for (const cell of row) {
    if (!cell) continue;
    if (cell.terrain === "water" || cell.terrain === "mountain") continue;
    if (blocked.has(key(cell.coord))) continue;
    eligible.push(cell.coord);
  }
  eligible.sort(lexCompare);

  const total = totalItemCount();
  if (eligible.length < total) {
    throw new Error(`spawnItems: only ${eligible.length} eligible cells, need ${total}`);
  }

  // 2. Fisher–Yates partial shuffle using the seeded PRNG; draw `total` indices without replacement.
  const pickOrder: CubeCoord[] = [];
  const pool = eligible.slice();
  for (let i = 0; i < total; i++) {
    const j = i + Math.floor(prng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    pickOrder.push(pool[i]);
  }

  // 3. Assign item ids in declaration order: all ammo_cache, then deflector_shield, then camo, then air_lift.
  const out: HexCellItem[] = [];
  let cursor = 0;
  for (const id of ITEM_IDS) {
    for (let n = 0; n < ITEM_SPAWN_COUNTS[id]; n++) {
      out.push({ hex: pickOrder[cursor++], itemId: id });
    }
  }
  return out;
}
```

`src/engine/board.ts`:

- Add a sibling `ItemMap = Map<string, ItemId>` stored on the match state (not the cell grid — items are volatile, cells are terrain).
- Provide `itemAt(map, coord): ItemId | undefined`, `placeItems(map, HexCellItem[])`, `removeItemAt(map, coord): ItemId | undefined`.

`src/engine/match.ts`:

- During `startMatch`, call `spawnItems({ board, startingUnits, seed })` and stash the resulting map on `state.items`.

### Unit Tests

- `tests/engine/items-spawn.test.ts` (new):
  - `spawnItems` with the default board and seed returns exactly 13 entries.
  - The same inputs produce byte-identical output across two invocations (deterministic).
  - No item hex collides with a starting-unit hex or a starting-unit-adjacent hex.
  - No item hex is on water or mountain.
  - Item id distribution matches `ITEM_SPAWN_COUNTS` exactly.
  - Seed sweep (e.g. seeds `0..9` combined with the xor mask) never produces two items on the same hex.
  - A synthetic board too small to fit 13 items throws `spawnItems: only X eligible cells, need 13`.

## Phase 3: Effect Resolution and Turn Integration

### Affected Files

- `src/engine/items.ts` — add `applyUseItem(state, action)` and effect resolvers (`useAmmoCache`, `armShield`, `activateCamo`, `airLift`).
- `src/engine/combat.ts` — subtract `defender.shieldAbsorb` from incoming damage before HP application; decrement `shieldAbsorb` accordingly; break camo on incoming damage that comes from an attack (not overwatch? — overwatch DOES break camo per lock-ins; apply this here too).
- `src/engine/turns.ts` — wire `"use_item"` actions; handle stored-attack accounting when resolving `"attack"`; decrement shield/camo expirations at appropriate turn ends; handle pickup on movement arrival.
- `src/engine/movement.ts` — after each step in `applyPath`, if `itemAt(state.items, step)` is defined, invoke `handleItemArrival(state, unit, step)` which picks the item up (respecting inventory cap) and emits `item_discovered` or `item_pickup_declined`.
- `src/gateway/validator.ts` — validate `"use_item"` shapes.

### Changes

`src/engine/items.ts`:

```ts
export function applyUseItem(state: MatchState, action: AgentAction): UseItemResult {
  const unit = findUnitAt(state, action.from);
  if (!unit) throw new EngineError("use_item: no unit at `from`");
  if (!action.itemId) throw new EngineError("use_item: missing itemId");
  const slotIdx = unit.inventory.indexOf(action.itemId);
  if (slotIdx === -1) throw new EngineError("use_item: item not in inventory");

  switch (action.itemId) {
    case "ammo_cache":      return useAmmoCache(state, unit, slotIdx);
    case "deflector_shield":return armShield(state, unit, slotIdx);
    case "camo":            return activateCamo(state, unit, slotIdx);
    case "air_lift":        return airLift(state, unit, slotIdx, action.targetHex);
  }
}
```

- `useAmmoCache`: `unit.storedAttacks += 1`, remove slot.
- `armShield`: `unit.shieldAbsorb = SHIELD_ABSORB_MAX; unit.shieldExpiresAtTurn = state.turnIndex + SHIELD_DURATION_TURNS * 2;` (two half-turns = one full round), remove slot.
- `activateCamo`: `unit.camouflaged = true; unit.camouflageExpiresAtTurn = state.turnIndex + CAMO_DURATION_TURNS * 2;` remove slot.
- `airLift`:
  - Validate `targetHex` per the lock-ins (existence, terrain, occupancy, friendly control or adjacency).
  - Validate that this unit has not issued a `"move"` this turn AND mark `state.movesUsedThisTurn.add(unit.id)` so subsequent `"move"` actions for this unit are rejected.
  - Move the unit to `targetHex` without invoking `maybeOverwatchOnStep`.
  - Set `unit.facing = defaultFacing(unit.owner)`.
  - Remove slot.

`src/engine/combat.ts`:

- In `resolveCombat`, before computing `defHpAfter`:
  ```ts
  const absorbed = Math.min(defender.shieldAbsorb, atkDmgActual);
  const atkDmgApplied = atkDmgActual - absorbed;
  const defHpAfter = Math.max(0, defender.hp - atkDmgApplied);
  // Mutation of defender.shieldAbsorb happens in turns.ts to keep combat pure; combat returns `absorbed`.
  ```
- Extend `CombatResult` with `absorbed: number`. `turns.ts` subtracts `absorbed` from the live defender's `shieldAbsorb`. If post-subtract `shieldAbsorb === 0`, also clear `shieldExpiresAtTurn`.
- If the attack lands on a camouflaged unit (should not happen: camouflaged units are hidden from the attacker's view; the engine will refuse the attack action during validation), the engine throws `invalid_attack: target not visible`.
- If the attacker is camouflaged, clear `camouflaged` and `camouflageExpiresAtTurn` after the attack resolves (camo breaks on aggression — applies to both direct attacks and overwatch triggers).

`src/engine/turns.ts`:

- When resolving an `"attack"` action:
  - If `unit.storedAttacks === 0` and the unit has already issued an attack this turn, reject.
  - If the unit has issued an attack this turn AND `unit.storedAttacks > 0`, decrement `unit.storedAttacks` instead of incrementing the per-turn attack counter.
- At turn end (for the side whose turn just ended), iterate all of that side's units and:
  - If `shieldExpiresAtTurn !== null && shieldExpiresAtTurn <= state.turnIndex`, clear `shieldAbsorb` and `shieldExpiresAtTurn`.
  - If `camouflageExpiresAtTurn !== null && camouflageExpiresAtTurn <= state.turnIndex`, clear `camouflaged` and `camouflageExpiresAtTurn`.
- When a unit is destroyed, clear its `inventory` and reset all item-state fields; do NOT drop items back onto the map.
- Overwatch retaliation: when it fires, if the moving unit was `camouflaged`, break its camo (per effect spec).

`src/engine/movement.ts`:

- `applyPath` additions: after each successful step, call `handleItemArrival(state, unit, step.coord)`:
  - If `itemAt(state.items, step.coord)` is undefined, return.
  - If `unit.inventory.length >= INVENTORY_CAP`, emit `item_pickup_declined` and leave the item on the hex.
  - Otherwise, remove the item from `state.items`, push onto `unit.inventory`, emit `item_discovered`.
- `item_discovered` and `item_pickup_declined` events include `{ unitId, owner, hex, itemId }`.

`src/gateway/validator.ts`:

- `"use_item"` requires `from`, `itemId ∈ ITEM_IDS`, and `confidence`.
- If `itemId === "air_lift"`, `targetHex` is required; otherwise it must be absent.
- Reject unknown action types.
- `"attack"` validator: permit multiple attacks in the same turn payload if the unit has stored attacks remaining (this is checked at resolve time; the validator just accepts the shape).

### Unit Tests

- `tests/engine/items-effects.test.ts` (new):
  - `use_item` with `ammo_cache` in inventory: inventory shrinks by 1, `storedAttacks += 1`.
  - Subsequent two `attack` actions in the same turn both resolve (using the banked charge).
  - `deflector_shield`: after arming, a 5-STR incoming attack applies only `5 - 3 = 2` damage; `shieldAbsorb` becomes 0; next incoming attack takes full damage.
  - Shield expires at the owner's next turn end.
  - `camo`: after activation, the opposing agent's `gameState.units` payload excludes the carrier.
  - Camo breaks when carrier attacks; carrier's next attack action also breaks camo if still active.
  - Overwatch strike on a camouflaged attacker breaks camo.
  - `air_lift`: legal target teleports the unit; move slot marked used; subsequent `"move"` in the same turn rejected; facing reset to `defaultFacing(owner)`.
  - `air_lift` to water or mountain rejected; to an occupied hex rejected; to an enemy-controlled non-adjacent hex rejected.
- `tests/engine/items-pickup.test.ts` (new):
  - A unit that ends a move step on an item hex gains that item; `state.items` loses the hex; event emitted.
  - A unit with full inventory ending on an item hex leaves the item; event `item_pickup_declined` emitted.
  - A unit destroyed mid-path never picks up items on hexes beyond its death step.
- `tests/engine/items-redaction.test.ts` (new):
  - The agent payload builder omits undiscovered item hexes for the receiving side.
  - The agent payload omits opposing-side camouflaged units.
  - Spectator payload includes everything.
- `tests/gateway/validator.test.ts` (extend) — accepts legal `"use_item"` shapes for all four items; rejects `"use_item"` with no `itemId`, with unknown `itemId`, with `targetHex` on non-airlift items, or with no `targetHex` on air lift.

## Phase 4: Rendering and Hover Surface

### Affected Files

- `src/public/hex-render.js` — render discovered items as small icons on their hex; render a "fog of items" overlay (a subtle dot pattern) on cells known to the current view side to not contain an item is NOT required — only discovered items render visibly.
- `src/public/unit-render.js` — show inventory badges on unit tokens; show a shield ring when `shieldAbsorb > 0`; show a diagonal hatch overlay when `camouflaged === true` (spectator view only — agent view redaction happens server-side).
- `src/public/arena.js` — consume `item_discovered` and `item_pickup_declined` events from the event stream, animate token notifications.
- `src/public/arena.css` — item-icon and badge styles.
- `src/public/reasoning-panel.js` — render inventory state alongside unit HP/STR in the unit-details pane.

### Changes

- Item glyphs: one inline SVG path per item id (4 glyphs). Colors:
  - `ammo_cache`: gold.
  - `deflector_shield`: cyan ring.
  - `camo`: dashed green.
  - `air_lift`: purple arrow.
- Unit hover card (`unit-catalog.js` already loaded by Plan A) adds an `Inventory` row listing up to 2 items by id and one line per status: `Shield: N` if absorb > 0, `Camouflaged` if true, `Stored attacks: N` if > 0.
- The spectator sidebar shows **all** items on the map. The agent-facing side view shows only items its side has discovered; the client renders only what the server sends.

### Unit Tests

- `tests/engine/render.test.ts` (extend):
  - Rendering a board with 3 items produces 3 item glyphs at the expected pixel coordinates.
  - A unit with `inventory: ["ammo_cache", "camo"]` renders 2 badge elements on its token.
  - A unit with `shieldAbsorb > 0` renders a `<circle class="unit-shield">` ring.
  - A camouflaged unit renders `<pattern class="camo-hatch">`.
- `tests/public/demo-items.test.ts` (new) — demo-replay's discovered-items events drive the correct render diff (badges appear and item glyph disappears simultaneously).

## Phase 5: Demo Replay and Persistence

### Affected Files

- `src/public/demo-replay.js` — extend STEP schema with optional `items: [[q,r,"ITEM_ID"]]` for discovered-this-step items; append a scripted discovery sequence to the canned demo so spectators see the item mechanics on load.
- `scripts/generate-demo-board.ts` (Plan C) — extend to also emit a demo `ITEMS` literal using the item PRNG and the same exclusion rules.
- `src/persistence/match-store.ts` — serialize `state.items`, `unit.inventory`, `unit.storedAttacks`, `unit.shieldAbsorb`, `unit.shieldExpiresAtTurn`, `unit.camouflaged`, `unit.camouflageExpiresAtTurn`. On reload, restore all fields.
- `src/public/arena.js` — handle `item_discovered` and `item_pickup_declined` events in the event stream.

### Changes

- `generate-demo-board.ts` gains a second output block between sentinels `<generated:items>` / `</generated:items>` in `demo-replay.js`. `inject-demo-board.ts` (Plan C) is extended to understand both sentinel blocks.
- Canned demo inserts at least one pickup, one `use_item` for each of the four items, and one incoming attack absorbed by a shield so the render surface is exercised end-to-end.
- Persistence schema version bump: `match_store_version` goes from current → current+1. Migration is forward-only; older stored matches load with default item state (empty inventories, items map empty).

### Unit Tests

- `tests/persistence/match-store.test.ts` (extend):
  - Serialize a state with items placed and a unit carrying two items; deserialize; all fields round-trip.
  - Load a stored match written before this version; `state.items` is empty; units have `inventory: []`; no error.
- `tests/engine/e2e.test.ts` (extend, overlaps with Plan A's e2e):
  - Run a scripted 16-turn match on the radius-7 board where items are spawned, discovered, and used. Assert: each of the four item effects fires exactly once, the final state matches a golden snapshot, and the event log contains the expected `item_discovered`, `item_pickup_declined` (at least one case), and `use_item` entries.

## Phase 6: Substantiation

### Affected Files

- `docs/META_LEDGER.md` — append entry for this plan with phase IDs P1–P5.
- `docs/SHADOW_GENOME.md` — record the prior failure pattern this plan repairs (agent payloads leaking full-map state; no partial-information levers to reward exploration).
- `docs/ARENA_UI_SPEC.md` — add an `Items` section specifying the four item ids, their UI glyphs, and the hover-card layout.
- `.agent/staging/AUDIT_REPORT.md` — refresh with the post-implementation snapshot.

### Changes

- `META_LEDGER` entry references `plan_id: 2026-04-22-plan-b-hidden-map-items` and the phase commit shas.
- `SHADOW_GENOME` entry titled `Full-Information Payloads` documents the structural fix (per-side payload builder with explicit visibility rules, server-side redaction).
- `ARENA_UI_SPEC.md` documents the four items and their status effects.

### Unit Tests

- `tests/engine/e2e.test.ts` — covered in Phase 5.
- `tests/engine/payload-redaction.test.ts` (new):
  - Build a game state with 13 items on the map and a camouflaged unit on side B.
  - Build the payload for side A's agent; assert: 0 items visible (none discovered yet), no camouflaged B unit in `units[]`, full A inventory visible.
  - Side A discovers one item; payload for side A now includes that item on its carrier's inventory; payload for side B still shows 0 visible items.
  - Spectator payload always shows all 13 items and the camouflaged unit.

## Builder Execution Notes

- Phases run in order. Builder commits one phase per ticket.
- Phase 1 depends on Plan A being sealed (the action-type union and `Unit` shape are Plan A's).
- Phase 2 depends on Plan C being sealed (radius-7 board exists).
- The item PRNG seed and spawn counts in this document are frozen. Builder MUST NOT tune them in-phase; any rebalance is a separate plan.
- `agent payload redaction` (Phase 3) is a security-adjacent change: if builder finds an existing code path that sends raw `MatchState` to an agent without going through the payload builder, builder MUST route it through the new builder rather than duplicating redaction logic.
- After Phase 6, `/qor-audit` runs. If it passes, `/qor-substantiate` seals the plan.
- If any phase's test suite fails, builder stops and surfaces the failure. No `.skip` markers under any condition.
- All plan-B code paths are covered by tests in this document. If builder finds a function that needs implementation but is not enumerated above, builder STOPS and surfaces the gap rather than improvising.
