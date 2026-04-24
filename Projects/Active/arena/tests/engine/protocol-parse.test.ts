import { describe, expect, test } from "bun:test";
import { parseFrame } from "../../src/gateway/protocol.js";
import type { AckFrame, PlanFrame, EndFrame, EventFrame, HelloFrame, ReadyFrame, StateFrame } from "../../src/gateway/contract.js";

describe("parseFrame", () => {
  test("parses valid HELLO frame", () => {
    const raw = JSON.stringify({ type: "HELLO", matchId: "match-123", side: "A", seed: "abc123", boardSize: { width: 11, height: 11 }, timeBudgetMs: 5000, protocolVersion: "2.0" } satisfies HelloFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as HelloFrame).type).toBe("HELLO");
    expect((frame as HelloFrame).matchId).toBe("match-123");
    expect((frame as HelloFrame).side).toBe("A");
  });

  test("parses valid STATE frame", () => {
    const raw = JSON.stringify({
      type: "STATE",
      turn: 5,
      visible: [],
      units: [],
      score: { a: 0, b: 0 },
      deadline: Date.now() + 5000,
      roundCap: 48,
      budget: { freeMove: 1, freeAction: 1, apPool: 3, apCarry: 0 },
    } satisfies StateFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as StateFrame).type).toBe("STATE");
    expect((frame as StateFrame).turn).toBe(5);
    expect((frame as StateFrame).roundCap).toBe(48);
  });

  test("parses valid ACK frame with accepted true", () => {
    const frame = parseFrame(JSON.stringify({ type: "ACK", accepted: true } satisfies AckFrame));
    expect(frame).not.toBeNull();
    expect((frame as AckFrame).type).toBe("ACK");
    expect((frame as AckFrame).accepted).toBe(true);
  });

  test("parses valid ACK frame with accepted false and reason", () => {
    const frame = parseFrame(JSON.stringify({ type: "ACK", accepted: false, reason: "invalid_plan" } satisfies AckFrame));
    expect(frame).not.toBeNull();
    expect((frame as AckFrame).accepted).toBe(false);
    expect((frame as AckFrame).reason).toBe("invalid_plan");
  });

  test("parses valid EVENT frame", () => {
    const raw = JSON.stringify({ type: "EVENT", event: "unit_moved", payload: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: -1, s: 0 } }, timestamp: Date.now() } satisfies EventFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as EventFrame).type).toBe("EVENT");
    expect((frame as EventFrame).event).toBe("unit_moved");
  });

  test("parses valid END frame", () => {
    const raw = JSON.stringify({ type: "END", winner: "A", reason: "elimination", finalScore: { a: 10, b: 3 }, metrics: { totalActions: 42, avgDecisionMs: 150, invalidActions: 2 } } satisfies EndFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as EndFrame).type).toBe("END");
    expect((frame as EndFrame).winner).toBe("A");
    expect((frame as EndFrame).reason).toBe("elimination");
  });

  test("parses END frame with draw winner", () => {
    const frame = parseFrame(JSON.stringify({ type: "END", winner: "draw", reason: "round_cap", finalScore: { a: 5, b: 5 }, metrics: { totalActions: 100, avgDecisionMs: 80, invalidActions: 0 } } satisfies EndFrame));
    expect(frame).not.toBeNull();
    expect((frame as EndFrame).winner).toBe("draw");
  });

  test("parses valid READY frame", () => {
    const frame = parseFrame(JSON.stringify({ type: "READY", agentId: "agent-alpha", agentVersion: "1.0.0" } satisfies ReadyFrame));
    expect(frame).not.toBeNull();
    expect((frame as ReadyFrame).type).toBe("READY");
    expect((frame as ReadyFrame).agentId).toBe("agent-alpha");
  });

  test("parses valid PLAN frame with move", () => {
    const frame = parseFrame(JSON.stringify({
      type: "PLAN",
      plan: {
        bid: 0,
        extras: [],
        freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: -1, s: 0 } },
      },
      confidence: 0.95,
    } satisfies PlanFrame));
    expect(frame).not.toBeNull();
    expect((frame as PlanFrame).type).toBe("PLAN");
    expect((frame as PlanFrame).plan.freeMove?.unitId).toBe("u1");
  });

  test("parses valid PLAN frame with attack", () => {
    const frame = parseFrame(JSON.stringify({
      type: "PLAN",
      plan: {
        bid: 1,
        extras: [],
        freeAction: { unitId: "u2", type: "attack", from: { q: 2, r: -1, s: -1 }, to: { q: 3, r: -2, s: -1 } },
      },
      confidence: 0.8,
      metadata: { reasoning: "eliminate enemy unit" },
    } satisfies PlanFrame));
    expect(frame).not.toBeNull();
    expect((frame as PlanFrame).plan.freeAction?.type).toBe("attack");
    expect((frame as PlanFrame).metadata?.reasoning).toBe("eliminate enemy unit");
  });

  test("parses valid PLAN frame with pass", () => {
    const frame = parseFrame(JSON.stringify({
      type: "PLAN",
      plan: { bid: 0, extras: [] },
      confidence: 1.0,
    } satisfies PlanFrame));
    expect(frame).not.toBeNull();
    expect((frame as PlanFrame).plan.bid).toBe(0);
  });

  test("rejects malformed payloads", () => {
    expect(parseFrame("null")).toBeNull();
    expect(parseFrame("123")).toBeNull();
    expect(parseFrame("\"string\"")).toBeNull();
    expect(parseFrame("true")).toBeNull();
    expect(parseFrame("{\"matchId\":\"m1\"}")).toBeNull();
    expect(parseFrame("{\"type\":\"INVALID\",\"matchId\":\"m1\"}")).toBeNull();
    expect(parseFrame("{\"type\":\"HELLO\",\"mat")).toBeNull();
  });

  test("accepts encoded buffers and rejects unknown types", () => {
    const arrayBuffer = new TextEncoder().encode("{\"type\":\"HELLO\"}").buffer;
    expect((parseFrame(arrayBuffer) as HelloFrame).type).toBe("HELLO");
    const buffer = Buffer.from("{\"type\":\"HELLO\"}");
    expect((parseFrame(buffer) as HelloFrame).type).toBe("HELLO");
    expect(parseFrame("{\"type\":\"PING\"}")).toBeNull();
    expect(parseFrame("{\"type\":\"\"}")).toBeNull();
  });
});
