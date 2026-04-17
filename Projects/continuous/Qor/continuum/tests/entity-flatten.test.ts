import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import neo4j, { type Driver, type Session } from "neo4j-driver";
import { flattenEntity, getEntities, ensureEntity } from "../src/ingest/memory-to-graph";

const URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const USER = process.env.NEO4J_USER ?? "neo4j";
const PASS = (() => {
  const v = process.env.NEO4J_PASS;
  if (!v) throw new Error("NEO4J_PASS required for entity-flatten integration test");
  return v;
})();
let driver: Driver;
let session: Session;

beforeAll(() => {
  driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASS));
  session = driver.session();
});

afterAll(async () => {
  await session.close();
  await driver.close();
});

describe("flattenEntity", () => {
  it("passes plain string entities through unchanged", () => {
    const result = flattenEntity("Victor");
    expect(result.name).toBe("Victor");
    expect(result.meta).toBeUndefined();
  });

  it("extracts name from object with name field", () => {
    const result = flattenEntity({ name: "Qor", type: "project", status: "active" });
    expect(result.name).toBe("Qor");
    expect(result.meta).toEqual({ type: "project", status: "active" });
  });

  it("extracts name from object with entity field", () => {
    const result = flattenEntity({ entity: "Qor" });
    expect(result.name).toBe("Qor");
    expect(result.meta).toBeUndefined();
  });

  it("returns empty name for objects without name/entity field", () => {
    const result = flattenEntity({ foo: "bar" });
    expect(result.name).toBe("");
  });

  it("returns empty name for null/undefined", () => {
    const result = flattenEntity(null);
    expect(result.name).toBe("");
  });
});

describe("getEntities (flattened)", () => {
  it("handles plain string arrays", () => {
    const record: any = { type: "observation", content: "test", metadata: { entities: ["Victor", "Qora"] } };
    const result = getEntities(record);
    expect(result).toEqual(["Victor", "Qora"]);
  });

  it("flattens object entities to strings", () => {
    const record: any = {
      type: "observation",
      content: "test",
      metadata: { entities: [{ name: "Qor", type: "project" }, "Victor"] },
    };
    const result = getEntities(record);
    expect(result).toEqual(["Qor", "Victor"]);
  });

  it("filters out empty names", () => {
    const record: any = { type: "observation", content: "test", metadata: { entities: [null, "", "Victor"] } };
    const result = getEntities(record);
    expect(result).toEqual(["Victor"]);
  });
});

describe("ensureEntity with metadata", () => {
  it("creates entity with type and status properties", async () => {
    await ensureEntity(session, "test-entity-meta", { type: "project", status: "active" });
    const r = await session.run("MATCH (e:Entity {name: $n}) RETURN e", { n: "test-entity-meta" });
    expect(r.records.length).toBe(1);
    const props = r.records[0].get("e").properties;
    expect(props.type).toBe("project");
    expect(props.status).toBe("active");
    await session.run("MATCH (e:Entity {name: $n}) DETACH DELETE e", { n: "test-entity-meta" });
  });

  it("rejects disallowed metadata keys", async () => {
    await ensureEntity(session, "test-entity-safe", { type: "project", evil: "DROP" } as any);
    const r = await session.run("MATCH (e:Entity {name: $n}) RETURN e", { n: "test-entity-safe" });
    const props = r.records[0].get("e").properties;
    expect(props.type).toBe("project");
    expect(props.evil).toBeUndefined();
    await session.run("MATCH (e:Entity {name: $n}) DETACH DELETE e", { n: "test-entity-safe" });
  });
});
