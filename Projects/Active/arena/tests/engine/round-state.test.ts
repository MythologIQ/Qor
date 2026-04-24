import { describe, expect, test } from "bun:test";
import {
  applyCarryover,
  applyEndOfRound,
  deductBid,
  newBudget,
  PASS_PLAN,
} from "../../src/engine/round-state";
import { AP_CAP, BASE_AP, MAX_CARRY } from "../../src/engine/constants";

describe("round-state primitives", () => {
  test("newBudget seeds defaults", () => {
    const b = newBudget();
    expect(b.freeMove).toBe(1);
    expect(b.freeAction).toBe(1);
    expect(b.apPool).toBe(BASE_AP);
    expect(b.apCarry).toBe(0);
  });

  test("applyCarryover adds carry to BASE_AP capped at AP_CAP", () => {
    const prev = { freeMove: 0, freeAction: 0, apPool: 0, apCarry: 1 };
    const next = applyCarryover(prev);
    expect(next.apPool).toBe(BASE_AP + 1);
    expect(next.freeMove).toBe(1);
    expect(next.freeAction).toBe(1);
    expect(next.apCarry).toBe(0);
  });

  test("applyCarryover clamps at AP_CAP", () => {
    const prev = { freeMove: 0, freeAction: 0, apPool: 0, apCarry: 99 };
    const next = applyCarryover(prev);
    expect(next.apPool).toBe(AP_CAP);
  });

  test("deductBid drains pool by bid amount", () => {
    const b = { freeMove: 1, freeAction: 1, apPool: 3, apCarry: 0 };
    expect(deductBid(b, 2).apPool).toBe(1);
  });

  test("deductBid clamps over-bid at apPool", () => {
    const b = { freeMove: 1, freeAction: 1, apPool: 3, apCarry: 0 };
    expect(deductBid(b, 99).apPool).toBe(0);
  });

  test("deductBid ignores negative bid", () => {
    const b = { freeMove: 1, freeAction: 1, apPool: 3, apCarry: 0 };
    expect(deductBid(b, -5).apPool).toBe(3);
  });

  test("applyEndOfRound: both slots unused refunds +2 (capped at AP_CAP)", () => {
    const b = { freeMove: 1, freeAction: 1, apPool: 1, apCarry: 0 };
    const n = applyEndOfRound(b);
    expect(n.apPool).toBe(Math.min(1 + 2, AP_CAP));
    expect(n.freeMove).toBe(0);
    expect(n.freeAction).toBe(0);
  });

  test("applyEndOfRound: one slot refunds +1", () => {
    const b = { freeMove: 1, freeAction: 0, apPool: 0, apCarry: 0 };
    const n = applyEndOfRound(b);
    expect(n.apPool).toBe(1);
  });

  test("applyEndOfRound: both slots used refunds 0", () => {
    const b = { freeMove: 0, freeAction: 0, apPool: 2, apCarry: 0 };
    const n = applyEndOfRound(b);
    expect(n.apPool).toBe(2);
  });

  test("applyEndOfRound: apCarry = min(apPoolAfter, MAX_CARRY)", () => {
    const b = { freeMove: 1, freeAction: 1, apPool: AP_CAP, apCarry: 0 };
    const n = applyEndOfRound(b);
    expect(n.apCarry).toBe(MAX_CARRY);
  });

  test("applyEndOfRound: does not exceed AP_CAP", () => {
    const b = { freeMove: 1, freeAction: 1, apPool: AP_CAP, apCarry: 0 };
    const n = applyEndOfRound(b);
    expect(n.apPool).toBe(AP_CAP);
  });

  test("applyEndOfRound then applyCarryover composes cleanly", () => {
    const b = { freeMove: 1, freeAction: 1, apPool: 1, apCarry: 0 };
    const end = applyEndOfRound(b);
    const next = applyCarryover(end);
    expect(next.apPool).toBeLessThanOrEqual(AP_CAP);
    expect(next.freeMove).toBe(1);
    expect(next.freeAction).toBe(1);
    expect(next.apCarry).toBe(0);
  });

  test("PASS_PLAN is safe fallback", () => {
    expect(PASS_PLAN.bid).toBe(0);
    expect(PASS_PLAN.extras).toEqual([]);
  });
});
