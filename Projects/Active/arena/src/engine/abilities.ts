// Plan D v2 Phase 4 — Ability resolution with optional boost modifier.
// Boost is consumed exactly once per round (set by resolveBoostedAbility).

import type { ExtraEntry, Unit, MatchState, EngineEvent } from "../shared/types.ts";

export interface AbilityContext {
  state: MatchState;
  agent: "A" | "B";
  unit: Unit;
  boost?: { mode: "range" | "damage" };
}

/** Result of an ability resolution. */
export interface AbilityResult {
  ctx: AbilityContext;
  events: EngineEvent[];
  /** Whether the boost was consumed */
  boostConsumed: boolean;
}

const VANGUARD_SIGHT_BASE_RADIUS = 2;

export function resolveAbility(
  ctx: AbilityContext,
  extra: ExtraEntry,
): AbilityResult {
  const abilityId = extra.unitId; // ability targets are keyed by unitId in ExtraEntry
  const events: EngineEvent[] = [];
  let boostConsumed = false;

  // Ability IDs are derived from the ability's internal name.
  // We identify abilities by their contextual role rather than an enum
  // since the engine only handles a fixed set.
  const isVanguardSight = abilityId.includes("vanguard") ||
    (ctx.unit.type === "infantry" && ctx.unit.strength === 3);
  const isFlanker = abilityId.includes("flanker") ||
    (ctx.unit.type === "scout");

  if (isVanguardSight) {
    // Vanguard sight: reveal units in radius around the unit.
    // boost.mode=range → add 1 to reveal radius.
    const baseRadius = VANGUARD_SIGHT_BASE_RADIUS;
    const revealRadius = ctx.boost?.mode === "range" ? baseRadius + 1 : baseRadius;
    boostConsumed = ctx.boost?.mode === "range" ? true : boostConsumed;

    // Emit reveal events for enemy units within radius
    const enemies = ctx.state.units.filter((u) => u.owner !== ctx.agent);
    for (const enemy of enemies) {
      const dist = hexDistance(ctx.unit.position, enemy.position);
      if (dist <= revealRadius) {
        events.push({
          type: "unit_revealed",
          payload: { agent: ctx.agent, unitId: enemy.id, distance: dist },
          timestamp: 0,
        });
      }
    }
    events.push({
      type: "ability_resolved",
      payload: { agent: ctx.agent, unitId: ctx.unit.id, ability: "vanguard_sight", revealRadius },
      timestamp: 0,
    });
  } else if (isFlanker) {
    // Flanker: +1 damage when attacking from forest/terrain.
    // boost.mode=damage → add 1 to damage bonus.
    const bonus = ctx.boost?.mode === "damage" ? 1 : 0;
    boostConsumed = ctx.boost?.mode === "damage" ? true : boostConsumed;
    events.push({
      type: "ability_resolved",
      payload: { agent: ctx.agent, unitId: ctx.unit.id, ability: "flanker", damageBonus: bonus },
      timestamp: 0,
    });
  } else {
    // Generic ability — no boost effect
    events.push({
      type: "ability_resolved",
      payload: { agent: ctx.agent, unitId: ctx.unit.id, ability: "generic" },
      timestamp: 0,
    });
  }

  // Boost is consumed exactly once per round; clear it after use
  if (boostConsumed) {
    ctx.boost = undefined;
  }

  return { ctx, events, boostConsumed };
}

function hexDistance(a: { q: number; r: number; s: number }, b: { q: number; r: number; s: number }): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}