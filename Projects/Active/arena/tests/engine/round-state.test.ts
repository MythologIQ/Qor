import { describe, expect, test } from "bun:test";
import {
  applyCarryover,
  deductBid,
  newBudget,
  roundEndCarryover,
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

  test("roundEndCarryover clamps unspent AP at MAX_CARRY", () => {
    const b = { freeMove: 0, freeAction: 0, apPool: 4, apCarry: 0 };
    expect(roundEndCarryover(b)).toBe(MAX_CARRY);
  });

  test("roundEndCarryover returns 0 for empty pool", () => {
    const b = { freeMove: 0, freeAction: 0, apPool: 0, apCarry: 0 };
    expect(roundEndCarryover(b)).toBe(0);
  });

  test("roundEndCarryover preserves single-unit value below cap", () => {
    const b = { freeMove: 0, freeAction: 0, apPool: 1, apCarry: 0 };
    expect(roundEndCarryover(b)).toBe(1);
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
});
