import { describe, it, expect, beforeAll } from "bun:test";
import { embedText, recallSimilar, queryGraph, closeDriver } from "../src/service/graph-api";
import { afterAll } from "bun:test";

const TIMEOUT = 120_000;

afterAll(async () => {
  await queryGraph(
    "MATCH (n:Observation {id: $id}) DETACH DELETE n",
    { id: "test-recall-embed" }
  );
  await closeDriver();
});

describe("Semantic Recall", () => {
  beforeAll(async () => {
    const embedding = await embedText("Neo4j graph database memory system test");
    await queryGraph(
      `MERGE (n:Observation {id: $id})
       ON CREATE SET n.content = $content, n.agent = 'victor',
                     n.timestamp = $ts, n.embedding = $embedding`,
      {
        id: "test-recall-embed",
        content: "Neo4j graph database memory system test",
        ts: Date.now(),
        embedding,
      }
    );
  }, TIMEOUT);

  it("recallSimilar returns embedded nodes", async () => {
    const results = await recallSimilar("graph database memory", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty("id");
    expect(results[0]).toHaveProperty("score");
  }, TIMEOUT);

  it("recallSimilar ranks relevant content higher", async () => {
    const results = await recallSimilar("Neo4j graph database", 10);
    const testNode = results.find((r) => r.id === "test-recall-embed");
    expect(testNode).toBeDefined();
    expect(testNode!.score as number).toBeGreaterThan(0.5);
  }, TIMEOUT);
});
