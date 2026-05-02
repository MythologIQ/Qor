import { describe, test, expect } from "bun:test";
import { computeHash } from "../../src/shared/hash-chain";

describe("hash-chain", () => {
  test("deterministic", () => {
    const a = computeHash("genesis", "test", { x: 1 });
    const b = computeHash("genesis", "test", { x: 1 });
    expect(a).toBe(b);
  });

  test("input sensitivity — different prev", () => {
    expect(computeHash("a", "t", {})).not.toBe(computeHash("b", "t", {}));
  });

  test("prev sensitivity: changing prev changes hash", () => {
    expect(computeHash("prev-a", "t", {})).not.toBe(computeHash("prev-b", "t", {}));
  });

  test("known limitation: 32-char truncation collapses small differences", () => {
    const full = Buffer.from(JSON.stringify({ prev: "g", type: "t", payload: { x: 1 } })).toString("base64");
    expect(computeHash("g", "t", { x: 1 })).toBe(full.slice(0, 32));
    expect(full.length).toBeGreaterThan(32);
  });
});
