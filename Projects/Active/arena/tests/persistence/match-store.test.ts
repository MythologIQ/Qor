import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { openDb, initDb } from "../../src/persistence/db";
import {
  saveMatch,
  appendEvents,
  getMatch,
  listMatchesByOperator,
  streamEvents,
  countEvents,
} from "../../src/persistence/match-store";
import { createOperator } from "../../src/identity/operator";
import { registerAgentVersion } from "../../src/identity/agent-version";

function setupWorld(db: Database): {
  opAId: number;
  opBId: number;
  agentAId: number;
  agentBId: number;
} {
  const a = createOperator(db, "alpha");
  const b = createOperator(db, "bravo");
  const av = registerAgentVersion(db, {
    operatorId: a.operator.id,
    code: "fn a(){}",
    config: "{}",
    modelId: "m-a",
    promptTemplate: "p",
  });
  const bv = registerAgentVersion(db, {
    operatorId: b.operator.id,
    code: "fn b(){}",
    config: "{}",
    modelId: "m-b",
    promptTemplate: "p",
  });
  return {
    opAId: a.operator.id,
    opBId: b.operator.id,
    agentAId: av.agentVersion.id,
    agentBId: bv.agentVersion.id,
  };
}

describe("match-store", () => {
  let db: Database;
  beforeEach(() => {
    db = openDb(":memory:");
    initDb(db);
  });

  test("saveMatch + getMatch roundtrip", () => {
    const w = setupWorld(db);
    saveMatch(db, {
      id: "m1",
      operatorAId: w.opAId,
      operatorBId: w.opBId,
      agentAId: w.agentAId,
      agentBId: w.agentBId,
      originTag: "synthetic",
      outcome: null,
      createdAt: 1_700_000_000,
    });
    const r = getMatch(db, "m1");
    expect(r).not.toBeNull();
    expect(r!.id).toBe("m1");
    expect(r!.operatorAId).toBe(w.opAId);
    expect(r!.originTag).toBe("synthetic");
    expect(r!.outcome).toBeNull();
  });

  test("getMatch unknown id → null", () => {
    expect(getMatch(db, "nope")).toBeNull();
  });

  test("appendEvents persists 50 events with correct seq + roundtrip count", () => {
    const w = setupWorld(db);
    saveMatch(db, {
      id: "m2",
      operatorAId: w.opAId,
      operatorBId: w.opBId,
      agentAId: w.agentAId,
      agentBId: w.agentBId,
      originTag: "synthetic",
      outcome: null,
      createdAt: 1,
    });
    const events = Array.from({ length: 50 }, (_, i) => ({
      seq: i + 1,
      eventType: "unit_moved",
      payload: JSON.stringify({ step: i + 1 }),
      ts: 100 + i,
    }));
    appendEvents(db, "m2", events);
    expect(countEvents(db, "m2")).toBe(50);
  });

  test("streamEvents yields events in seq order", () => {
    const w = setupWorld(db);
    saveMatch(db, {
      id: "m3",
      operatorAId: w.opAId,
      operatorBId: w.opBId,
      agentAId: w.agentAId,
      agentBId: w.agentBId,
      originTag: "synthetic",
      outcome: null,
      createdAt: 1,
    });
    appendEvents(
      db,
      "m3",
      [3, 1, 2].map((s) => ({
        seq: s,
        eventType: "x",
        payload: "{}",
        ts: s,
      })),
    );
    const seqs: number[] = [];
    for (const ev of streamEvents(db, "m3")) seqs.push(ev.seq);
    expect(seqs).toEqual([1, 2, 3]);
  });

  test("unique(match_id, seq) prevents duplicate seq inserts", () => {
    const w = setupWorld(db);
    saveMatch(db, {
      id: "m4",
      operatorAId: w.opAId,
      operatorBId: w.opBId,
      agentAId: w.agentAId,
      agentBId: w.agentBId,
      originTag: "synthetic",
      outcome: null,
      createdAt: 1,
    });
    appendEvents(db, "m4", [
      { seq: 1, eventType: "x", payload: "{}", ts: 1 },
    ]);
    expect(() =>
      appendEvents(db, "m4", [
        { seq: 1, eventType: "x", payload: "{}", ts: 2 },
      ]),
    ).toThrow();
  });

  test("listMatchesByOperator orders DESC by createdAt, respects limit", () => {
    const w = setupWorld(db);
    for (let i = 0; i < 5; i++) {
      saveMatch(db, {
        id: `m-${i}`,
        operatorAId: w.opAId,
        operatorBId: w.opBId,
        agentAId: w.agentAId,
        agentBId: w.agentBId,
        originTag: "synthetic",
        outcome: null,
        createdAt: 1_000 + i,
      });
    }
    const rows = listMatchesByOperator(db, w.opAId, 3);
    expect(rows.length).toBe(3);
    expect(rows[0].id).toBe("m-4");
    expect(rows[1].id).toBe("m-3");
    expect(rows[2].id).toBe("m-2");
    expect(rows[0].operatorAHandle).toBe("alpha");
  });

  test("listMatchesByOperator matches either operator side", () => {
    const w = setupWorld(db);
    saveMatch(db, {
      id: "m-b",
      operatorAId: w.opAId,
      operatorBId: w.opBId,
      agentAId: w.agentAId,
      agentBId: w.agentBId,
      originTag: "synthetic",
      outcome: null,
      createdAt: 1,
    });
    const forB = listMatchesByOperator(db, w.opBId);
    expect(forB.length).toBe(1);
    expect(forB[0].id).toBe("m-b");
    expect(forB[0].operatorBHandle).toBe("bravo");
  });

  test("listMatchesByOperator returns eventCount aggregate", () => {
    const w = setupWorld(db);
    saveMatch(db, {
      id: "m-ec",
      operatorAId: w.opAId,
      operatorBId: w.opBId,
      agentAId: w.agentAId,
      agentBId: w.agentBId,
      originTag: "synthetic",
      outcome: "A_wins",
      createdAt: 1,
    });
    appendEvents(db, "m-ec", [
      { seq: 1, eventType: "x", payload: "{}", ts: 1 },
      { seq: 2, eventType: "x", payload: "{}", ts: 2 },
    ]);
    const rows = listMatchesByOperator(db, w.opAId);
    expect(rows[0].eventCount).toBe(2);
    expect(rows[0].outcome).toBe("A_wins");
  });

  test("saveMatch with invalid operator FK fails", () => {
    expect(() =>
      saveMatch(db, {
        id: "m-bad",
        operatorAId: 999,
        operatorBId: 1000,
        agentAId: 1,
        agentBId: 2,
        originTag: "synthetic",
        outcome: null,
        createdAt: 1,
      }),
    ).toThrow();
  });

  test("appendEvents is transactional: partial failure rolls back", () => {
    const w = setupWorld(db);
    saveMatch(db, {
      id: "m-tx",
      operatorAId: w.opAId,
      operatorBId: w.opBId,
      agentAId: w.agentAId,
      agentBId: w.agentBId,
      originTag: "synthetic",
      outcome: null,
      createdAt: 1,
    });
    // First insert succeeds; duplicate seq in same batch must roll back both.
    expect(() =>
      appendEvents(db, "m-tx", [
        { seq: 1, eventType: "x", payload: "{}", ts: 1 },
        { seq: 1, eventType: "x", payload: "{}", ts: 2 },
      ]),
    ).toThrow();
    expect(countEvents(db, "m-tx")).toBe(0);
  });
});
