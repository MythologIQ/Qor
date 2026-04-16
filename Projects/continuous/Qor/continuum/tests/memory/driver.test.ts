/**
 * Fail-closed driver tests.
 * No Neo4j required — we only validate env-var enforcement.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { getDriver, closeDriver, MissingEnvError } from "../../src/memory/driver";

beforeEach(async () => {
  await closeDriver();
  delete process.env.NEO4J_URI;
  delete process.env.NEO4J_USER;
  delete process.env.NEO4J_PASS;
});

describe("memory/driver fail-closed", () => {
  it("throws MissingEnvError when NEO4J_URI is absent", () => {
    expect(() => getDriver()).toThrow(MissingEnvError);
  });

  it("throws MissingEnvError when NEO4J_USER is absent", () => {
    process.env.NEO4J_URI = "bolt://localhost:7687";
    expect(() => getDriver()).toThrow(/NEO4J_USER/);
  });

  it("throws MissingEnvError when NEO4J_PASS is absent", () => {
    process.env.NEO4J_URI = "bolt://localhost:7687";
    process.env.NEO4J_USER = "neo4j";
    expect(() => getDriver()).toThrow(/NEO4J_PASS/);
  });

  it("closeDriver tolerates never-initialized driver", async () => {
    await expect(closeDriver()).resolves.toBeUndefined();
  });
});
