import { test, expect } from "bun:test";
import { validateApArithmetic } from "../../../src/gateway/validator/ap-arithmetic";
import type { ExtraEntry } from "../../../src/shared/types";

test("ap-arithmetic: bid 0 extras empty ok", () => {
  expect(validateApArithmetic({ bid: 0, extras: [] }, 3)).toEqual({ ok: true });
});

test("ap-arithmetic: bid within pool ok", () => {
  expect(validateApArithmetic({ bid: 2, extras: [] }, 3)).toEqual({ ok: true });
});

test("ap-arithmetic: extras cost within pool ok", () => {
  const extras: ExtraEntry[] = [
    { kind: "boosted_ability", unitId: "u1" },
    { kind: "defensive_stance", unitId: "u2" },
  ];
  expect(validateApArithmetic({ bid: 0, extras }, 3)).toEqual({ ok: true });
});

test("ap-arithmetic: extras cost exceeds pool", () => {
  const extras: ExtraEntry[] = [
    { kind: "boosted_ability", unitId: "u1" },
    { kind: "defensive_stance", unitId: "u2" },
    { kind: "reserve_overwatch", unitId: "u3" },
  ];
  expect(validateApArithmetic({ bid: 0, extras }, 3)).toEqual({ ok: false, reason: "ap_exceeds_pool" });
});

test("ap-arithmetic: bid + extras exceeds pool", () => {
  const extras: ExtraEntry[] = [{ kind: "boosted_ability", unitId: "u1" }];
  expect(validateApArithmetic({ bid: 3, extras }, 3)).toEqual({ ok: false, reason: "ap_exceeds_pool" });
});