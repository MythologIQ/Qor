import { describe, it, beforeEach, expect } from "bun:test";
import { createOperator, getOperatorByToken } from "./operators";
import { initSchema, getDb } from "./db";

describe("operators storage", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM operators");
  });

  it("createOperator returns valid shape", () => {
    const { operator, apiKey } = createOperator("TestHandle");
    expect(operator.id).toBeGreaterThan(0);
    expect(operator.handle).toBe("TestHandle");
    expect(operator.handleNormalized).toBe("testhandle");
    expect(operator.apiKey).toBe(apiKey);
    expect(apiKey).toHaveLength(32);
    expect(operator.createdAt).toBeGreaterThan(0);
  });

  it("duplicate handle throws", () => {
    createOperator("DupHandle");
    expect(() => createOperator("DupHandle")).toThrow();
  });

  it("getOperatorByToken works", () => {
    const { operator, apiKey } = createOperator("TokenTest");
    const found = getOperatorByToken(apiKey);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(operator.id);
    expect(found!.handle).toBe("TokenTest");
  });

  it("getOperatorByToken returns null for bad token", () => {
    expect(getOperatorByToken("deadbeefdeadbeefdeadbeefdeadbeef")).toBeNull();
  });

  it("handle normalization strips spaces and lowercases", () => {
    const { operator } = createOperator("  My-Handle  ");
    expect(operator.handleNormalized).toBe("my-handle");
  });
});