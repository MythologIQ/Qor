// Plan D v2 Phase 5 — Reserve Trigger and Interrupt: tests

import { describe, it, expect, beforeEach } from "bun:test";
import {
  findReserveTrigger,
  applyReserveDamage,
  flagPlannedActionsWasted,
  resolveReserveTriggers,
  type TriggerResult,
} from "../../../src/engine/round-resolver/triggers";
import type {
  MatchState,
  Unit,
  CubeCoord,
  RoundPlan,
  ReserveRecord,
  EngineEvent,
} from "../../../src/shared/types";

function cube(q: number, r: number): CubeCoord {
  return { q, r, s: -q - r };
}

function unit(
  id: string,
  owner: "A" | "B",
  pos: CubeCoord,
  strength = 3,
  hp = 5,
  type: "infantry" | "scout" | "heavy" = "infantry",
): Unit {
  return { id, owner, position: pos, strength, hp, type, weight: type === "scout" ? 1 : type === "infantry" ? 2 : 3 };
}

function mkState(units: Unit[], reserves: ReserveRecord[] = []): MatchState {
  return {
    turn: 0,
    visible: [],
    units,
    score: { a: 0, b: 0 },
    deadline: 0,
    roundCap: 50,
    reserves,
    stances: [],
  };
}

function reserveRecord(unitId: string, owner: "A" | "B", appliesOnRound: number): ReserveRecord {
  return { unitId, ownerId: owner, appliesOnRound, fired: false };
}

function passPlan(): RoundPlan {
  return { bid: 0, extras: [] };
}

function planWithMove(unitId: string, from: CubeCoord, to: CubeCoord, path?: CubeCoord[]): RoundPlan {
  return { bid: 0, freeMove: { unitId, from, to, path }, extras: [] };
}

function planWithAttack(unitId: string, from: CubeCoord, to: CubeCoord): RoundPlan {
  return { bid: 0, freeAction: { unitId, from, to, type: "attack" }, extras: [] };
}

// ── findReserveTrigger ─────────────────────────────────────────────────────────

describe("findReserveTrigger", () => {
  it("returns attack trigger when enemy attack targets reserving unit", () => {
    // Reserving unit sits at rPos (where enemy attack targets)
    const rPos = cube(0, 0);
    const reserver = unit("reserver", "A", rPos, 3, 5, "infantry");
    // Enemy attacker at (1,0) plans to attack rPos (the reserving unit)
    const planA = passPlan(); // A is the reserve owner (winner)
    const planB = planWithAttack("enemy", cube(1, 0), rPos);

    const result = findReserveTrigger(reserver, planA, planB, "A");
    expect(result).toEqual({ kind: "attack", sourceUnitId: "enemy", sourceAgent: "B" });
  });

  it("returns attack trigger when enemy second_attack targets reserving unit", () => {
    const rPos = cube(0, 0);
    const reserver = unit("reserver", "A", rPos, 3, 5, "infantry");
    const planA = passPlan();
    const planB: RoundPlan = {
      bid: 0,
      extras: [{ kind: "second_attack", unitId: "enemy", to: rPos }],
    };

    const result = findReserveTrigger(reserver, planA, planB, "A");
    expect(result).toEqual({ kind: "second_attack", sourceUnitId: "enemy", sourceAgent: "B" });
  });

  it("returns movement_in_range trigger when enemy freeMove ends within RANGE", () => {
    // Reserving unit at rPos
    const rPos = cube(0, 0);
    const reserver = unit("reserver", "A", rPos, 3, 5, "infantry");
    // Enemy mover at (0,2) ends move at (0,1) — distance 1 from rPos, within RANGE[infantry]=1
    const planA = passPlan();
    const planB = planWithMove("mover", cube(0, 2), cube(0, 1));

    const result = findReserveTrigger(reserver, planA, planB, "A");
    expect(result).toEqual({ kind: "movement_in_range", sourceUnitId: "mover", sourceAgent: "B" });
  });

  it("returns null when enemy move ends outside RANGE", () => {
    const rPos = cube(0, 0);
    const reserver = unit("reserver", "A", rPos, 3, 5, "infantry");
    // Enemy mover at (4,0) moves to (5,0) — distance 5 from rPos, outside RANGE[infantry]=1
    const planA = passPlan();
    const planB = planWithMove("mover", cube(4, 0), cube(5, 0));

    const result = findReserveTrigger(reserver, planA, planB, "A");
    expect(result).toBeNull();
  });

  it("returns null when no trigger exists", () => {
    const rPos = cube(0, 0);
    const reserver = unit("reserver", "A", rPos, 3, 5, "infantry");
    const planA = passPlan();
    const planB = passPlan();

    const result = findReserveTrigger(reserver, planA, planB, "A");
    expect(result).toBeNull();
  });

  it("returns winner's trigger first when both agents have triggers", () => {
    const rPos = cube(0, 0);
    const reserver = unit("reserver", "A", rPos, 3, 5, "infantry");
    // A is winner — A's attack should be checked first
    const planA = planWithAttack("atk-A", cube(1, 0), rPos); // A's trigger
    const planB = planWithAttack("atk-B", cube(-1, 0), rPos); // B's trigger

    const result = findReserveTrigger(reserver, planA, planB, "A");
    expect(result).toEqual({ kind: "attack", sourceUnitId: "atk-A", sourceAgent: "A" });
  });

  it("checks loser plan when winner has no trigger", () => {
    const rPos = cube(0, 0);
    const reserver = unit("reserver", "A", rPos, 3, 5, "infantry");
    const planA = passPlan(); // winner A has no trigger
    const planB = planWithAttack("atk-B", cube(-1, 0), rPos); // B has the trigger

    const result = findReserveTrigger(reserver, planA, planB, "A");
    expect(result).toEqual({ kind: "attack", sourceUnitId: "atk-B", sourceAgent: "B" });
  });

  it("triggers only once per round (winner first, one trigger wins)", () => {
    const rPos = cube(0, 0);
    const reserver = unit("reserver", "A", rPos, 3, 5, "infantry");
    // A's plan has both freeAction attack AND second_attack targeting rPos
    // Winner-first: checkPlan sees freeAction first → returns "attack"
    const planA: RoundPlan = {
      bid: 0,
      freeAction: { unitId: "atk-A", from: cube(1, 0), to: rPos, type: "attack" },
      extras: [{ kind: "second_attack", unitId: "atk-A", to: rPos }],
    };
    const planB = passPlan();

    const result = findReserveTrigger(reserver, planA, planB, "A");
    expect(result?.kind).toBe("attack"); // freeAction is checked before extras
  });
});

// ── applyReserveDamage ────────────────────────────────────────────────────────

describe("applyReserveDamage", () => {
  it("deals full strength damage with no terrain reduction", () => {
    const state = mkState([
      unit("reserver", "A", cube(0, 0), 4, 5, "infantry"),
      unit("target", "B", cube(1, 0), 3, 5, "infantry"),
    ]);
    const reserver = state.units.find((u) => u.id === "reserver")!;
    const target = state.units.find((u) => u.id === "target")!;

    const next = applyReserveDamage(state, reserver, target);
    const updated = next.units.find((u) => u.id === "target")!;
    expect(updated.hp).toBe(1); // 5 - 4 = 1
  });

  it("marks target dead when damage >= hp", () => {
    const state = mkState([
      unit("reserver", "A", cube(0, 0), 5, 3, "heavy"),
      unit("target", "B", cube(1, 0), 2, 3, "scout"),
    ]);
    const reserver = state.units.find((u) => u.id === "reserver")!;
    const target = state.units.find((u) => u.id === "target")!;

    const next = applyReserveDamage(state, reserver, target);
    const updated = next.units.find((u) => u.id === "target")!;
    expect(updated.hp).toBe(0); // 3 - 5 = -2 → clamped to 0
  });

  it("returns new state without mutating original units", () => {
    const state = mkState([
      unit("reserver", "A", cube(0, 0), 3, 5, "infantry"),
      unit("target", "B", cube(1, 0), 3, 5, "infantry"),
    ]);
    const reserver = state.units.find((u) => u.id === "reserver")!;
    const target = state.units.find((u) => u.id === "target")!;
    const originalHp = target.hp;

    const next = applyReserveDamage(state, reserver, target);
    expect(target.hp).toBe(originalHp); // original unchanged
    expect(next.units.find((u) => u.id === "target")!.hp).toBe(2);
  });
});

// ── resolveReserveTriggers ───────────────────────────────────────────────────

describe("resolveReserveTriggers", () => {
  it("emits reserve_fired event when trigger found", () => {
    const rPos = cube(0, 0);
    const units = [
      unit("res-A", "A", rPos, 3, 5, "infantry"),
      unit("atk-B", "B", cube(1, 0), 3, 5, "infantry"),
    ];
    const state = mkState(units, [reserveRecord("res-A", "A", 1)]);
    const planA = passPlan();
    const planB = planWithAttack("atk-B", cube(1, 0), rPos);

    const events = resolveReserveTriggers(state, planA, planB, "A", 1);

    const rf = events.find((e) => e.type === "reserve_fired");
    expect(rf).toBeDefined();
    expect((rf as EngineEvent & { payload: object }).payload).toMatchObject({
      reserver: "res-A",
      target: "atk-B",
      triggerKind: "attack",
    });
  });

  it("kills the triggering attacker and emits wasted_action", () => {
    const rPos = cube(0, 0);
    const units = [
      unit("res-A", "A", rPos, 5, 5, "heavy"), // heavy deals 5 damage
      unit("atk-B", "B", cube(1, 0), 3, 3, "infantry"), // only 3 hp
    ];
    const state = mkState(units, [reserveRecord("res-A", "A", 1)]);
    const planA = passPlan();
    const planB = planWithAttack("atk-B", cube(1, 0), rPos);

    const events = resolveReserveTriggers(state, planA, planB, "A", 1);

    const wasted = events.filter((e) => e.type === "wasted_action");
    expect(wasted.length).toBeGreaterThan(0);
    expect((wasted[0] as EngineEvent & { payload: object }).payload).toMatchObject({
      agent: "B",
      kind: "freeAction",
      reason: "trigger_killed_unit",
    });
  });

  it("reserve fires only once per round", () => {
    const rPos = cube(0, 0);
    const units = [
      unit("res-A", "A", rPos, 3, 5, "infantry"),
      unit("atk-A", "A", cube(1, 0), 3, 5, "infantry"),
      unit("atk-B", "B", cube(-1, 0), 3, 5, "infantry"),
    ];
    const state = mkState(units, [reserveRecord("res-A", "A", 1)]);
    const planA = planWithAttack("atk-A", cube(1, 0), rPos); // winner A
    const planB = planWithAttack("atk-B", cube(-1, 0), rPos); // B also has trigger

    const events = resolveReserveTriggers(state, planA, planB, "A", 1);

    const firedEvents = events.filter((e) => e.type === "reserve_fired");
    expect(firedEvents.length).toBe(1); // only A's fires
    expect((firedEvents[0] as EngineEvent & { payload: object }).payload).toMatchObject({ reserver: "res-A" });
  });

  it("reserve does not fire if reserving unit died before trigger evaluated", () => {
    const rPos = cube(0, 0);
    const units = [
      unit("res-A", "A", rPos, 3, 0, "infantry"), // hp=0 = already dead
      unit("atk-B", "B", cube(1, 0), 3, 5, "infantry"),
    ];
    const state = mkState(units, [reserveRecord("res-A", "A", 1)]);
    const planA = passPlan();
    const planB = planWithAttack("atk-B", cube(1, 0), rPos);

    const events = resolveReserveTriggers(state, planA, planB, "A", 1);

    const firedEvents = events.filter((e) => e.type === "reserve_fired");
    expect(firedEvents.length).toBe(0);
  });

  it("reserve does not fire if appliesOnRound !== currentRound", () => {
    const rPos = cube(0, 0);
    const units = [
      unit("res-A", "A", rPos, 3, 5, "infantry"),
      unit("atk-B", "B", cube(1, 0), 3, 5, "infantry"),
    ];
    const state = mkState(units, [reserveRecord("res-A", "A", 2)]); // applies round 2, not 1
    const planA = passPlan();
    const planB = planWithAttack("atk-B", cube(1, 0), rPos);

    const events = resolveReserveTriggers(state, planA, planB, "A", 1); // current round = 1

    const firedEvents = events.filter((e) => e.type === "reserve_fired");
    expect(firedEvents.length).toBe(0);
  });

  it("movement_in_range trigger fires when enemy moves within range", () => {
    const rPos = cube(0, 0);
    const units = [
      unit("res-A", "A", rPos, 3, 5, "infantry"), // RANGE=1
      unit("mover-B", "B", cube(0, 2), 3, 5, "infantry"), // starts at distance 2
    ];
    const state = mkState(units, [reserveRecord("res-A", "A", 1)]);
    const planA = passPlan();
    const planB = planWithMove("mover-B", cube(0, 2), cube(0, 1)); // ends at distance 1

    const events = resolveReserveTriggers(state, planA, planB, "A", 1);

    const rf = events.find((e) => e.type === "reserve_fired");
    expect(rf).toBeDefined();
    expect((rf as EngineEvent & { payload: object }).payload).toMatchObject({ triggerKind: "movement_in_range" });
  });

  it("second_attack trigger fires when it targets reserving unit", () => {
    const rPos = cube(0, 0);
    const units = [
      unit("res-A", "A", rPos, 3, 5, "infantry"),
      unit("atk-B", "B", cube(1, 0), 3, 5, "infantry"),
    ];
    const state = mkState(units, [reserveRecord("res-A", "A", 1)]);
    const planA = passPlan();
    const planB: RoundPlan = {
      bid: 0,
      extras: [{ kind: "second_attack", unitId: "atk-B", to: rPos }],
    };

    const events = resolveReserveTriggers(state, planA, planB, "A", 1);

    const rf = events.find((e) => e.type === "reserve_fired");
    expect(rf).toBeDefined();
    expect((rf as EngineEvent & { payload: object }).payload).toMatchObject({ triggerKind: "second_attack" });
  });

  it("reserve fires before the triggering action resolves (kills attacker, wasted_action emitted)", () => {
    const rPos = cube(0, 0);
    const units = [
      unit("res-A", "A", rPos, 5, 5, "heavy"), // kills B attacker
      unit("atk-B", "B", cube(1, 0), 3, 3, "infantry"), // hp=3, dies to 5 damage
    ];
    const state = mkState(units, [reserveRecord("res-A", "A", 1)]);
    const planA = passPlan();
    const planB = planWithAttack("atk-B", cube(1, 0), rPos);

    const events = resolveReserveTriggers(state, planA, planB, "A", 1);

    const wasted = events.find((e) => e.type === "wasted_action");
    const rf = events.find((e) => e.type === "reserve_fired");

    expect(rf).toBeDefined();
    expect(wasted).toBeDefined();
    expect((wasted as EngineEvent & { payload: object }).payload).toMatchObject({
      agent: "B",
      reason: "trigger_killed_unit",
    });
    // No unit_attacked event for B's attack — it was wasted by the reserve
    const attacked = events.filter((e) => e.type === "unit_attacked");
    expect(attacked.length).toBe(0);
  });
});

// ── flagPlannedActionsWasted ──────────────────────────────────────────────────

describe("flagPlannedActionsWasted", () => {
  it("emits waste events for dead unit in planA and planB", () => {
    const events: EngineEvent[] = [];
    const planA: RoundPlan = {
      bid: 0,
      freeMove: { unitId: "dead", from: cube(0, 1), to: cube(0, 2) },
      extras: [],
    };
    const planB: RoundPlan = {
      bid: 0,
      freeAction: { unitId: "dead", from: cube(1, 0), to: cube(0, 0), type: "attack" },
      extras: [{ kind: "second_attack", unitId: "dead", to: cube(0, 0) }],
    };

    flagPlannedActionsWasted(planA, planB, "dead", events);

    const wasted = events.filter((e) => e.type === "wasted_action");
    expect(wasted.length).toBe(3); // freeMove, freeAction, extra
  });

  it("only flags the dead unit's actions, not other units", () => {
    const events: EngineEvent[] = [];
    const planA: RoundPlan = {
      bid: 0,
      freeMove: { unitId: "alive", from: cube(0, 1), to: cube(0, 2) },
      extras: [],
    };
    const planB: RoundPlan = {
      bid: 0,
      freeAction: { unitId: "dead", from: cube(1, 0), to: cube(0, 0), type: "attack" },
      extras: [],
    };

    flagPlannedActionsWasted(planA, planB, "dead", events);

    const wasted = events.filter((e) => e.type === "wasted_action");
    expect(wasted.length).toBe(1); // only B's freeAction
  });
});
