// Plan D v2 Phase 4 — AP Spend Resolution: boosted_ability, second_attack,
// defensive_stance, reserve_overwatch handlers.

import type {
  ExtraEntry,
  RoundPlan,
  MatchState,
  Unit,
  CubeCoord,
  StanceRecord,
  ReserveRecord,
  EngineEvent,
} from "../../shared/types.ts";
import { findRetarget } from "../retarget.ts";
import { resolveCombat } from "../combat.ts";
import { RANGE } from "../constants.ts";

/** Mutable context passed to each extras handler. */
export interface ExtrasContext {
  state: MatchState;
  round: number;
  /** bid winner resolves first, then the other agent */
  bidWinner: "A" | "B";
  /** Per-agent boost flag: consumed exactly once per round */
  boostFlag: Record<string, { mode: "range" | "damage" } | undefined>;
  /** Accumulated events */
  events: EngineEvent[];
  /** planA and planB references for retarget lookups */
  planA: RoundPlan;
  planB: RoundPlan;
}

/** Resolve all AP extras for both agents (winner first, then loser). */
export function resolveExtras(ctx: ExtrasContext): void {
  const order: Array<"A" | "B"> = [ctx.bidWinner, ctx.bidWinner === "A" ? "B" : "A"];
  for (const agent of order) {
    const plan = agent === "A" ? ctx.planA : ctx.planB;
    for (const extra of plan.extras) {
      switch (extra.kind) {
        case "boosted_ability":
          resolveBoostedAbility(ctx, agent, extra);
          break;
        case "second_attack":
          resolveSecondAttack(ctx, agent, extra);
          break;
        case "defensive_stance":
          recordDefensiveStance(ctx, agent, extra);
          break;
        case "reserve_overwatch":
          recordReserveOverwatch(ctx, agent, extra);
          break;
      }
    }
  }
}

// ── boosted_ability ───────────────────────────────────────────────────────────

/**
 * Sets ctx.boostFlag[agent] so that the ability resolver (abilities.ts) applies
 * the boost when it is later invoked for the agent's freeAction.
 * Per Phase 4 spec: boost is consumed exactly once per round; the flag is set here
 * and cleared by the ability resolver when it processes the boosted ability.
 */
export function resolveBoostedAbility(
  ctx: ExtrasContext,
  agent: "A" | "B",
  extra: ExtraEntry,
): void {
  // The validator already confirmed: freeAction exists and type === "ability".
  // We just record the mode so the ability resolver can apply it.
  ctx.boostFlag[agent] = { mode: extra.mode ?? "damage" };
  ctx.events.push({
    type: "boost_applied",
    payload: { agent, unitId: extra.unitId, mode: ctx.boostFlag[agent].mode },
    timestamp: 0,
  });
}

// ── second_attack ─────────────────────────────────────────────────────────────

export interface SecondAttackResult {
  /** "unit_attacked" | "action_retargeted" | "action_wasted" */
  kind: "unit_attacked" | "action_retargeted" | "action_wasted";
  targetUnitId: string;
  damage: number;
  reason?: string;
}

/**
 * Performs a second attack using the G1 retarget rule.
 * Per R4: we do NOT re-check ownership or range — the validator already passed.
 * The only runtime check is the target-still-present, handled by resolveAttackTarget.
 */
export function resolveSecondAttack(
  ctx: ExtrasContext,
  agent: "A" | "B",
  extra: ExtraEntry,
): void {
  const attacker = ctx.state.units.find(
    (u) => u.id === extra.unitId && u.owner === agent,
  );
  if (!attacker) return; // unit died on a prior step; per R4, AP not refunded

  const originalTarget = extra.to;
  if (!originalTarget) return;

  const result = resolveAttackTargetForSecondAttack(ctx, attacker, originalTarget);
  const targetUnit = ctx.state.units.find((u) => u.id === result.targetUnitId);

  if (result.kind === "action_wasted") {
    ctx.events.push({
      type: "action_wasted",
      payload: { agent, unitId: attacker.id, reason: result.reason ?? "no_target_in_range" },
      timestamp: 0,
    });
    return;
  }

  // Apply damage to target
  if (targetUnit) {
    const terrain = ctx.state.visible.find((c) => c.position.q === targetUnit.position.q &&
      c.position.r === targetUnit.position.r)?.terrain ?? "plain";

    const aimPenalty = result.kind === "action_retargeted" ? (attacker.weight ?? 2) * 0.2 : 0;
    const combatResult = resolveCombat(attacker, targetUnit, terrain, aimPenalty);

    // Update unit HP in state
    const nextUnits = ctx.state.units.map((u) => {
      if (u.id === attacker.id) return { ...u, hp: combatResult.attackerHp };
      if (u.id === targetUnit.id) return { ...u, hp: combatResult.defenderHp };
      return u;
    });
    ctx.state = { ...ctx.state, units: nextUnits };

    // Emit attack event
    ctx.events.push({
      type: result.kind,
      payload: {
        agent,
        attackerUnitId: attacker.id,
        targetUnitId: targetUnit.id,
        damage: result.damage,
        reason: result.kind === "action_retargeted" ? "rushed_shot" : undefined,
      },
      timestamp: 0,
    });

    // Defender retaliation
    const retaliationDmg = targetUnit.strength + (terrain === "forest" ? 1 : terrain === "mountain" ? 2 : 0);
    const atkHpAfterRet = Math.max(0, combatResult.attackerHp - retaliationDmg);
    ctx.state = {
      ...ctx.state,
      units: ctx.state.units.map((u) =>
        u.id === attacker.id ? { ...u, hp: atkHpAfterRet } : u
      ),
    };

    // Destroyed units
    for (const id of combatResult.destroyed) {
      ctx.events.push({ type: "unit_destroyed", payload: { unitId: id }, timestamp: 0 });
      ctx.state = {
        ...ctx.state,
        units: ctx.state.units.filter((u) => u.id !== id),
      };
    }
  }
}

/**
 * G1 retarget rule for second_attack: follow → rushed shot → no target.
 * Returns the target unit id and the computed damage.
 */
function resolveAttackTargetForSecondAttack(
  ctx: ExtrasContext,
  attacker: Unit,
  originalTarget: CubeCoord,
): SecondAttackResult {
  const enemies = ctx.state.units.filter((u) => u.owner !== attacker.owner);

  // Case 1: Follow — original target still alive and within range
  const originalTargetUnit = enemies.find((u) => samePos(u.position, originalTarget));
  if (originalTargetUnit) {
    const dist = hexDistance(attacker.position, originalTargetUnit.position);
    const range = RANGE[attacker.type] ?? 1;
    if (dist <= range) {
      return {
        kind: "unit_attacked",
        targetUnitId: originalTargetUnit.id,
        damage: attacker.strength,
      };
    }
  }

  // Case 2: Rushed shot — any other enemy in range
  const range = RANGE[attacker.type] ?? 1;
  const candidates = enemies.filter((u) => {
    if (originalTargetUnit && u.id === originalTargetUnit.id) return false;
    return hexDistance(attacker.position, u.position) <= range;
  });

  if (candidates.length > 0) {
    // Sort by ascending distance, then ascending (q,r) for ties
    candidates.sort((a, b) => {
      const da = hexDistance(attacker.position, a.position);
      const db = hexDistance(attacker.position, b.position);
      if (da !== db) return da - db;
      if (a.position.q !== b.position.q) return a.position.q - b.position.q;
      return a.position.r - b.position.r;
    });
    const target = candidates[0];
    const damage = Math.max(1, Math.floor(attacker.strength / 2));
    return { kind: "action_retargeted", targetUnitId: target.id, damage, reason: "rushed_shot" };
  }

  // Case 3: No targets
  return { kind: "action_wasted", targetUnitId: "", damage: 0, reason: "no_target_in_range" };
}

// ── defensive_stance ──────────────────────────────────────────────────────────

/**
 * Records a defensive stance: applies on the NEXT round (currentRound + 1).
 * Phase 4 spec: appends StanceRecord{unitId, appliesOnRound: currentRound+1}.
 */
export function recordDefensiveStance(
  ctx: ExtrasContext,
  agent: "A" | "B",
  extra: ExtraEntry,
): void {
  const record: StanceRecord = {
    unitId: extra.unitId,
    appliesOnRound: ctx.round + 1,
  };
  if (!ctx.state.stances) ctx.state.stances = [];
  ctx.state.stances.push(record);
  ctx.events.push({
    type: "stance_recorded",
    payload: { agent, unitId: extra.unitId, appliesOnRound: record.appliesOnRound },
    timestamp: 0,
  });
}

// ── reserve_overwatch ──────────────────────────────────────────────────────────

/**
 * Records a reserve overwatch: fires when an enemy attacks the unit or ends
 * a movement step within RANGE[type] of the reserving unit.
 * appliesOnRound: currentRound + 1, fired: false initially.
 */
export function recordReserveOverwatch(
  ctx: ExtrasContext,
  agent: "A" | "B",
  extra: ExtraEntry,
): void {
  const record: ReserveRecord = {
    unitId: extra.unitId,
    ownerId: agent,
    appliesOnRound: ctx.round + 1,
    fired: false,
  };
  if (!ctx.state.reserves) ctx.state.reserves = [];
  ctx.state.reserves.push(record);
  ctx.events.push({
    type: "reserve_recorded",
    payload: { agent, unitId: extra.unitId, appliesOnRound: record.appliesOnRound },
    timestamp: 0,
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function samePos(a: CubeCoord, b: CubeCoord): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s;
}

function hexDistance(a: CubeCoord, b: CubeCoord): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}