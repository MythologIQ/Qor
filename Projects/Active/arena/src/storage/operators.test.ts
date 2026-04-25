import { describe, test, expect, beforeEach } from "bun:test";
import { getDb, initSchema, resetDb } from "./db";
import { registerOperator, authenticateOperator } from "./operators";

describe("operators storage", () => {
  beforeEach(() => {
    process.env.ARENA_DB = ":memory:";
    resetDb();
    initSchema();
  });

  test("registerOperator returns valid shape", () => {
    const result = registerOperator("TestPlayer");
    expect(result.operator.handle).toBe("TestPlayer");
    expect(result.operator.handle_normalized).toBe("testplayer");
    expect(result.apiKey).toMatch(/^ak_[0-9a-f]{48}$/);
    expect(result.operator.id).toBeGreaterThan(0);
  });

  test("duplicate handle throws", () => {
    registerOperator("UniqueHandle");
    expect(() => registerOperator("UniqueHandle")).toThrow();
  });

  test("duplicate normalized handle throws", () => {
    registerOperator("MyHandle");
    expect(() => registerOperator("myhandle")).toThrow();
  });

  test("authenticateOperator returns operator for valid key", () => {
    const result = registerOperator("AuthTest");
    const auth = authenticateOperator(result.apiKey);
    expect(auth).not.toBeNull();
    expect(auth!.handle).toBe("AuthTest");
  });

  test("authenticateOperator returns null for unknown key", () => {
    expect(authenticateOperator("ak_nonexistent")).toBeNull();
  });

  test("short handle throws", () => {
    expect(() => registerOperator("ab")).toThrow(/3-32/);
  });
});
