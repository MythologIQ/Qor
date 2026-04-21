import { describe, expect, test } from "bun:test";
import { pairRound, type Standing } from "../../src/tournament/swiss.ts";

describe("Swiss pairing", () => {
  test("4 players round 1 → 2 pairs", () => {
    const standings: Standing[] = [
      { operatorId: 1, score: 0 },
      { operatorId: 2, score: 0 },
      { operatorId: 3, score: 0 },
      { operatorId: 4, score: 0 },
    ];
    const pairings = pairRound(standings, new Set<string>());
    expect(pairings.length).toBe(2);
    const players = pairings.flatMap((p) => [p.player1, p.player2]);
    expect(players.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  test("round 2 avoids rematches", () => {
    const standings: Standing[] = [
      { operatorId: 1, score: 3 },
      { operatorId: 2, score: 3 },
      { operatorId: 3, score: 0 },
      { operatorId: 4, score: 0 },
    ];
    const priorPairings = new Set<string>(["1:2", "3:4"]);
    const pairings = pairRound(standings, priorPairings);
    expect(pairings.length).toBe(2);
    for (const p of pairings) {
      const key = p.player1 < p.player2 ? `${p.player1}:${p.player2}` : `${p.player2}:${p.player1}`;
      expect(priorPairings.has(key)).toBe(false);
    }
  });

  test("odd count leaves one player unpaired", () => {
    const standings: Standing[] = [
      { operatorId: 1, score: 3 },
      { operatorId: 2, score: 3 },
      { operatorId: 3, score: 3 },
      { operatorId: 4, score: 0 },
      { operatorId: 5, score: 0 },
    ];
    const pairings = pairRound(standings, new Set<string>());
    const paired = pairings.flatMap((p) => [p.player1, p.player2]);
    expect(paired.length).toBe(4);
    expect(paired.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  test("stability: same standings produce same order", () => {
    const standings: Standing[] = [
      { operatorId: 3, score: 1 },
      { operatorId: 1, score: 1 },
      { operatorId: 2, score: 0 },
    ];
    const pairings1 = pairRound(standings, new Set<string>());
    const pairings2 = pairRound(standings, new Set<string>());
    const flat1 = pairings1.flatMap((p) => [p.player1, p.player2]).sort((a, b) => a - b);
    const flat2 = pairings2.flatMap((p) => [p.player1, p.player2]).sort((a, b) => a - b);
    expect(flat1).toEqual(flat2);
  });
});