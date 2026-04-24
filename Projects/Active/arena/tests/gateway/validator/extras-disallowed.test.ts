import { describe, it, expect } from "bun:test";
import { validateExtrasDisallowed } from "../../../src/gateway/validator/extras-disallowed";
import type { RoundPlan } from "../../../src/shared/types";

describe("validateExtrasDisallowed", () => {
  it("empty extras passes", () => {
    const plan: RoundPlan = { bid: 0, extras: [] };
    expect(validateExtrasDisallowed(plan)).toEqual({ ok: true });
  });

  it("single extra rejected with EXTRAS_NOT_IMPLEMENTED", () => {
    const plan: RoundPlan = { bid: 0, extras: [{ kind: "boosted_ability", unitId: "u1" }] };
    const r = validateExtrasDisallowed(plan);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("EXTRAS_NOT_IMPLEMENTED");
  });

  it("multiple extras rejected", () => {
    const plan: RoundPlan = {
      bid: 0,
      extras: [
        { kind: "defensive_stance", unitId: "u1" },
        { kind: "reserve_overwatch", unitId: "u2" },
      ],
    };
    const r = validateExtrasDisallowed(plan);
    expect(r.ok).toBe(false);
  });
});
