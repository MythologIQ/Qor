import { describe, it, expect, afterAll } from "bun:test";
import {
  getAgentTimeline,
  getCrossAgentLinks,
  getEntityNetwork,
  getGraphStats,
  queryGraph,
  closeDriver,
} from "../src/service/graph-api";

afterAll(async () => {
  await closeDriver();
});

describe("Graph API", () => {
  it("queryGraph executes raw Cypher", async () => {
    const rows = await queryGraph("RETURN 1 AS n");
    expect(rows).toHaveLength(1);
    expect(rows[0].n).toBe(1);
  });

  it("getGraphStats returns node and edge counts", async () => {
    const stats = await getGraphStats();
    expect(stats.nodes).toBeInstanceOf(Array);
    expect(stats.edges).toBeInstanceOf(Array);
    expect((stats.nodes as unknown[]).length).toBeGreaterThan(0);
  });

  it("getAgentTimeline returns chronologically ordered records", async () => {
    const rows = await getAgentTimeline("victor");
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) {
      expect((rows[i].ts as number)).toBeGreaterThanOrEqual(rows[i - 1].ts as number);
    }
  });

  it("getAgentTimeline respects since filter", async () => {
    const all = await getAgentTimeline("victor");
    if (all.length < 2) return;
    const midTs = all[Math.floor(all.length / 2)].ts as number;
    const filtered = await getAgentTimeline("victor", midTs);
    expect(filtered.length).toBeLessThanOrEqual(all.length);
    for (const row of filtered) {
      expect((row.ts as number)).toBeGreaterThanOrEqual(midTs);
    }
  });

  it("getCrossAgentLinks finds connections between agents", async () => {
    const rows = await getCrossAgentLinks("victor", "qora");
    expect(rows).toBeInstanceOf(Array);
    // May be empty if no direct edges — that's valid
  });

  it("getEntityNetwork returns records mentioning an entity", async () => {
    // First find an entity that exists
    const entities = await queryGraph(
      "MATCH (e:Entity) RETURN e.name AS name LIMIT 1"
    );
    if (entities.length === 0) return;
    const entityName = entities[0].name as string;
    const rows = await getEntityNetwork(entityName);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("id");
    expect(rows[0]).toHaveProperty("agent");
  });
});
