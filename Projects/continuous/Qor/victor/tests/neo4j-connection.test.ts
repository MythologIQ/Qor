import { describe, it, expect, afterAll } from "bun:test";
import neo4j, { type Driver } from "neo4j-driver";

const URI = "bolt://localhost:7687";
const USER = "neo4j";
const PASS = "victor-memory-dev";

let driver: Driver;

function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASS));
  }
  return driver;
}

afterAll(async () => {
  if (driver) await driver.close();
});

describe("Neo4j Connection", () => {
  it("connects and executes a query", async () => {
    const session = getDriver().session();
    try {
      const result = await session.run("RETURN 1 AS n");
      expect(result.records[0].get("n").toNumber()).toBe(1);
    } finally {
      await session.close();
    }
  });

  it("authenticates with configured credentials", async () => {
    const session = getDriver().session();
    try {
      const result = await session.run("CALL dbms.showCurrentUser()");
      const username = result.records[0].get("username");
      expect(username).toBe("neo4j");
    } finally {
      await session.close();
    }
  });

  it("has schema constraints applied", async () => {
    const session = getDriver().session();
    try {
      const result = await session.run("SHOW CONSTRAINTS");
      expect(result.records.length).toBeGreaterThanOrEqual(10);
    } finally {
      await session.close();
    }
  });

  it("has indexes applied", async () => {
    const session = getDriver().session();
    try {
      const result = await session.run("SHOW INDEXES");
      const names = result.records.map((r) => r.get("name"));
      expect(names).toContain("source_document_path");
      expect(names).toContain("semantic_node_type");
    } finally {
      await session.close();
    }
  });

  it("can create and read a test node", async () => {
    const session = getDriver().session();
    try {
      await session.run(
        "CREATE (t:TestNode {id: 'conn-test', ts: $ts}) RETURN t",
        { ts: Date.now() }
      );
      const read = await session.run(
        "MATCH (t:TestNode {id: 'conn-test'}) RETURN t"
      );
      expect(read.records.length).toBe(1);
      await session.run("MATCH (t:TestNode {id: 'conn-test'}) DELETE t");
    } finally {
      await session.close();
    }
  });
});
