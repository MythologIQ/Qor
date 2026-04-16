import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const FORGE_ROUTES = readFileSync("/home/workspace/Projects/continuous/Qor/continuum/src/service/api/forge-routes.ts", "utf-8");
const QORA_ROUTES = readFileSync("/home/workspace/Projects/continuous/Qor/continuum/src/service/api/qora-routes.ts", "utf-8");

describe("governance deduplication", () => {
  test("forge-routes does not define ACTION_SCORES", () => {
    expect(FORGE_ROUTES).not.toContain("const ACTION_SCORES");
  });

  test("forge-routes does not define TRUST_CEIL", () => {
    expect(FORGE_ROUTES).not.toContain("const TRUST_CEIL");
  });

  test("forge-routes does not define governanceGate function", () => {
    expect(FORGE_ROUTES).not.toContain("function governanceGate");
  });

  test("forge-routes imports executeGovernedAction from evidence", () => {
    expect(FORGE_ROUTES).toContain('import { executeGovernedAction } from "../../../../evidence/governance-gate"');
  });

  test("qora-routes does not define ACTION_SCORES", () => {
    expect(QORA_ROUTES).not.toContain("const ACTION_SCORES");
  });

  test("qora-routes does not define TRUST_CEIL", () => {
    expect(QORA_ROUTES).not.toContain("const TRUST_CEIL");
  });

  test("qora-routes does not define governanceGate function", () => {
    expect(QORA_ROUTES).not.toContain("function governanceGate");
  });

  test("qora-routes imports executeGovernedAction from evidence", () => {
    expect(QORA_ROUTES).toContain('import { executeGovernedAction } from "../../../../evidence/governance-gate"');
  });

  test("forge-routes imports auth from shared/auth (not forge-auth)", () => {
    expect(FORGE_ROUTES).toContain('from "./shared/auth"');
    expect(FORGE_ROUTES).not.toContain('from "./shared/forge-auth"');
  });

  test("qora-routes imports auth from shared/auth (not forge-auth)", () => {
    expect(QORA_ROUTES).toContain('from "./shared/auth"');
    expect(QORA_ROUTES).not.toContain('from "./shared/forge-auth"');
  });

  test("no timing-vulnerable === comparison in auth paths", () => {
    const authTs = readFileSync("/home/workspace/Projects/continuous/Qor/continuum/src/service/api/shared/auth.ts", "utf-8");
    expect(authTs).toContain("timingSafeEqual");
    expect(authTs).not.toMatch(/token\s*===\s*/);
  });
});
