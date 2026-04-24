import { describe, expect, test } from "bun:test";
import {
  buildSpectatorFrames,
  classifyMomentum,
  projectLiveSpectatorMatch,
  projectPublicMatch,
} from "../../src/projection/public-match.ts";

const input = {
  matchId: "match-demo-1",
  mode: "demo" as const,
  round: 4,
  roundCap: 18,
  phase: "Pressure Build",
  pressure: 42,
  headline: "Blue pushes center.",
  featuredEvent: "Center lane flips blue.",
  board: [
    { q: 0, r: 0, s: 0, terrain: "plain", controlledBy: "A" as const },
  ],
  units: [
    { id: "u1", side: "A" as const, q: 0, r: 0, s: 0, hp: 5, strength: 4, type: "interceptor" },
  ],
  territories: { A: 11, B: 9 },
  agents: [
    {
      id: "agent-a",
      side: "A" as const,
      operator: "Blue Horizon",
      modelId: "minimax/m2.7",
      status: "acting",
      totalMs: 180,
      totalActions: 2,
      invalidCount: 0,
    },
    {
      id: "agent-b",
      side: "B" as const,
      operator: "Red Morrow",
      modelId: "minimax/m2.7",
      status: "observing",
      totalMs: 200,
      totalActions: 2,
      invalidCount: 1,
    },
  ],
  reasoning: [
    { agentId: "agent-a", side: "A" as const, text: "Take the center." },
    { agentId: "agent-b", side: "B" as const, text: "Hold for counter." },
  ],
  feed: [
    { round: 4, side: "A" as const, kind: "move" as const, headline: "Advance", detail: "Blue steps up." },
  ],
};

describe("projectPublicMatch", () => {
  test("projects stable numeric shares and side panels", () => {
    const projection = projectPublicMatch(input);
    expect(projection.board.controlShare.A).toBe(55);
    expect(projection.board.controlShare.B).toBe(45);
    expect(projection.board.momentum).toBe("blue");
    expect(projection.sides.A.operator).toBe("Blue Horizon");
    expect(projection.sides.B.reasoning).toHaveLength(1);
    expect(projection.outcome).toBeNull();
  });

  test("is byte-stable for the same input", () => {
    const a = JSON.stringify(projectPublicMatch(input));
    const b = JSON.stringify(projectPublicMatch(input));
    expect(a).toBe(b);
  });
});

describe("classifyMomentum", () => {
  test("treats small share deltas as even", () => {
    expect(classifyMomentum(52, 48)).toBe("even");
  });
});

describe("live spectator adapters", () => {
  test("projects deterministic live inputs and builds MATCH_* frames", () => {
    const projection = projectLiveSpectatorMatch({
      match: {
        id: "match-live-1",
        operatorAId: 1,
        operatorBId: 2,
        agentAId: 11,
        agentBId: 22,
        originTag: "ladder",
        outcome: "A_wins",
        createdAt: 1,
      },
      operatorA: "Blue Horizon",
      operatorB: "Red Morrow",
      events: [
        { matchId: "match-live-1", seq: 1, eventType: "unit_moved", payload: '{"step":1}', ts: 10 },
        { matchId: "match-live-1", seq: 2, eventType: "unit_attacked", payload: '{"step":2}', ts: 20 },
      ],
    });
    const a = JSON.stringify(projection);
    const b = JSON.stringify(projectLiveSpectatorMatch({
      match: {
        id: "match-live-1",
        operatorAId: 1,
        operatorBId: 2,
        agentAId: 11,
        agentBId: 22,
        originTag: "ladder",
        outcome: "A_wins",
        createdAt: 1,
      },
      operatorA: "Blue Horizon",
      operatorB: "Red Morrow",
      events: [
        { matchId: "match-live-1", seq: 1, eventType: "unit_moved", payload: '{"step":1}', ts: 10 },
        { matchId: "match-live-1", seq: 2, eventType: "unit_attacked", payload: '{"step":2}', ts: 20 },
      ],
    }));
    expect(a).toBe(b);

    const frames = buildSpectatorFrames(projection);
    expect(frames[0]?.type).toBe("MATCH_HELLO");
    expect(frames[1]?.type).toBe("MATCH_STATE");
    expect(frames.some((frame) => frame.type === "MATCH_EVENT")).toBe(true);
    expect(frames.at(-1)?.type).toBe("MATCH_END");
  });
});
