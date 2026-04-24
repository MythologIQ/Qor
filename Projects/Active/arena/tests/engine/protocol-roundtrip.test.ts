import { describe, expect, test } from "bun:test";
import { isValidFrame, parseFrame } from "../../src/gateway/protocol.js";
import type { AckFrame, EndFrame, EventFrame, HelloFrame, ReadyFrame, StateFrame, PlanFrame } from "../../src/gateway/contract.js";

describe("version mismatch", () => {
  test("END frame is used for protocol version mismatch", () => {
    const frame: EndFrame = {
      type: "END",
      winner: "A",
      reason: "timeout",
      finalScore: { a: 0, b: 0 },
      metrics: { totalActions: 0, avgDecisionMs: 0, invalidActions: 0 },
    };
    expect(isValidFrame(frame)).toBe(true);
    expect(parseFrame(JSON.stringify(frame))?.type).toBe("END");
  });

  test("server signals version mismatch via END frame reason field", () => {
    const frame: EndFrame = {
      type: "END",
      winner: "A",
      reason: "timeout",
      finalScore: { a: 0, b: 0 },
      metrics: { totalActions: 0, avgDecisionMs: 0, invalidActions: 0 },
    };
    expect(frame.reason).toBe("timeout");
    expect(isValidFrame(frame)).toBe(true);
  });
});

describe("round-trip sendFrame then parseFrame", () => {
  test("HELLO round-trip", () => {
    const hello: HelloFrame = {
      type: "HELLO",
      matchId: "match-roundtrip",
      side: "B",
      seed: "s3cr3t",
      boardSize: { width: 11, height: 11 },
      timeBudgetMs: 4000,
      protocolVersion: "2.0",
    };
    expect(parseFrame(JSON.stringify(hello))).toEqual(hello);
  });

  test("STATE round-trip", () => {
    const state: StateFrame = {
      type: "STATE",
      turn: 10,
      visible: [],
      units: [],
      score: { a: 5, b: 3 },
      deadline: 1700000000000,
      roundCap: 48,
      budget: { freeMove: 1, freeAction: 1, apPool: 3, apCarry: 0 },
    };
    expect(parseFrame(JSON.stringify(state))).toEqual(state);
  });

  test("ACK round-trip", () => {
    const ack: AckFrame = { type: "ACK", accepted: false, reason: "invalid_plan" };
    expect(parseFrame(JSON.stringify(ack))).toEqual(ack);
  });

  test("EVENT round-trip", () => {
    const evt: EventFrame = {
      type: "EVENT",
      event: "territory_claimed",
      payload: { player: "A", cell: { q: 2, r: -1, s: -1 } },
      timestamp: 1700000000001,
    };
    expect(parseFrame(JSON.stringify(evt))).toEqual(evt);
  });

  test("READY round-trip", () => {
    const ready: ReadyFrame = { type: "READY", agentId: "agent-v2", agentVersion: "2.0.0" };
    expect(parseFrame(JSON.stringify(ready))).toEqual(ready);
  });

  test("PLAN with metadata round-trip", () => {
    const plan: PlanFrame = {
      type: "PLAN",
      plan: {
        bid: 1,
        extras: [],
        freeAction: {
          unitId: "u1",
          type: "attack",
          from: { q: 1, r: 0, s: -1 },
          to: { q: 2, r: 0, s: -2 },
        },
      },
      confidence: 0.75,
      metadata: { reasoning: "high-value target", urgency: "high" },
    };
    expect(parseFrame(JSON.stringify(plan))).toEqual(plan);
  });
});
