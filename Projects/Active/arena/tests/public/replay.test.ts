import { describe, it, expect } from "bun:test";
import type { MatchEvent } from "../../src/shared/types.ts";
import { Replay, type ReplayState } from "../../src/public/replay.ts";

function makeState(): ReplayState {
  return {
    cells: new Map(),
    units: new Map(),
    turn: 1,
    currentPlayer: "A",
    concluded: false,
    winner: null,
  };
}

function spawn(id: string, owner: "A" | "B", q = 0, r = 0, strength = 10): MatchEvent {
  return { type: "spawn", unitId: id, owner, q, r, strength } as MatchEvent;
}
function move(id: string, toQ: number, toR: number): MatchEvent {
  return { type: "move", unitId: id, toQ, toR } as MatchEvent;
}
function concluded(winner: "A" | "B"): MatchEvent {
  return { type: "concluded", winner } as MatchEvent;
}

describe("Replay", () => {
  describe("step()", () => {
    it("5 events → 5 states then null", () => {
      const replay = new Replay(makeState());
      replay.load([
        spawn("u1", "A", 0, 0),
        spawn("u2", "B", 1, 0),
        move("u1", 0, 1),
        { type: "attack", unitId: "u1", targetId: "u2", damage: 4, recoil: 0 } as MatchEvent,
        concluded("A"),
      ]);

      // 5 non-null states
      expect(replay.step()).not.toBeNull();
      expect(replay.step()).not.toBeNull();
      expect(replay.step()).not.toBeNull();
      expect(replay.step()).not.toBeNull();
      expect(replay.step()).not.toBeNull();
      // then null
      expect(replay.step()).toBeNull();
    });

    it("each step produces a distinct snapshot", () => {
      const replay = new Replay(makeState());
      replay.load([
        spawn("u1", "A", 0, 0),
        concluded("A"),
      ]);

      const s0 = replay.step();
      const s1 = replay.step();
      expect(s0).not.toBeNull();
      expect(s1).not.toBeNull();
      expect(s0).not.toEqual(s1);
    });
  });

  describe("reset()", () => {
    it("cursor is 0 after reset", () => {
      const replay = new Replay(makeState());
      replay.load([spawn("u1", "A", 0, 0)]);
      replay.step();
      expect(replay.cursor()).toBe(1);
      replay.reset();
      expect(replay.cursor()).toBe(0);
    });

    it("reset enables replaying from the start", () => {
      const replay = new Replay(makeState());
      replay.load([spawn("u1", "A", 0, 0), move("u1", 0, 1)]);

      const s0 = replay.step()!;
      const s1 = replay.step()!;
      expect(replay.step()).toBeNull();

      replay.reset();
      expect(replay.step()).not.toBeNull();
      expect(replay.step()).not.toBeNull();
      expect(replay.step()).toBeNull();
    });
  });

  describe("step past end", () => {
    it("step() returns null when exhausted and further calls remain null", () => {
      const replay = new Replay(makeState());
      replay.load([spawn("u1", "A", 0, 0)]);
      replay.step();
      expect(replay.step()).toBeNull();
      expect(replay.step()).toBeNull();
    });
  });
});