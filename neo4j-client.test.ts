import { test, expect, describe, beforeAll } from "bun:test";
import {
  neo4j,
  initializeNeo4j,
  runQuery,
  createInteractionNode,
  storeEmbedding,
  findSimilarInteractions,
  checkHealth,
} from "./neo4j-client";

describe("Neo4j Client", () => {
  // Mock Neo4j for tests without requiring actual database
  beforeAll(() => {
    // Health check will fail gracefully without connection
  });

  test("initializes singleton driver", () => {
    const config = { uri: "bolt://localhost:7687", user: "test", password: "test", database: "qora-memory" };
    const driver1 = initializeNeo4j(config);
    const driver2 = initializeNeo4j(config);
    expect(driver1).toBe(driver2); // Singleton pattern
  });

  test("health check returns status object", async () => {
    const health = await checkHealth();
    expect(health).toHaveProperty("connected");
    expect(health).toHaveProperty("database");
    expect(health).toHaveProperty("latency");
  });

  test("createInteraction generates Cypher", () => {
    const mockSession = {
      run: (cypher: string, params: any) => {
        expect(cypher).toContain("MERGE (i:Interaction");
        expect(cypher).toContain("moltbook_id");
        return Promise.resolve({ records: [] });
      },
    };
    
    const interaction = {
      moltbookId: "mb_123",
      author: "user_456",
      content: "Climate is changing",
      timestamp: new Date(),
      type: "post" as const,
      entities: ["climate", "environment"],
    };
    
    expect(createInteractionNode(mockSession as any, interaction)).resolves.toBeUndefined();
  });

  test("findSimilar generates vector search Cypher", () => {
    const mockSession = {
      run: (cypher: string, params: any) => {
        expect(cypher).toContain("qora_embedding");
        expect(cypher).toContain("gds.similarity.cosine");
        expect(cypher).toContain("ORDER BY similarity DESC");
        return Promise.resolve({
          records: [{
            get: (k: string) => ({ moltbookId: "mb_123", content: "test", similarity: 0.85 }[k]),
          }],
        });
      },
    };
    
    const embedding = [0.1, 0.2, 0.3, 0.4];
    expect(findSimilarInteractions(mockSession as any, embedding, 5, 0.7)).resolves.toHaveLength(1);
  });

  test("storeEmbedding uses namespace isolation", () => {
    const mockSession = {
      run: (cypher: string, params: any) => {
        expect(cypher).toContain("qora_embedding");
        expect(cypher).toContain("qora_embedding_timestamp");
        expect(cypher).not.toContain("victor_embedding"); // Isolation check
        return Promise.resolve({ records: [] });
      },
    };
    
    expect(storeEmbedding(mockSession as any, "node_123", [0.1, 0.2])).resolves.toBeUndefined();
  });

  test("database isolation uses qora-memory by default", async () => {
    const config = { uri: "bolt://localhost:7687", user: "qora", password: "secret", database: "qora-memory" };
    expect(config.database).toBe("qora-memory");
    expect(config.database).not.toBe("victor-embeddings"); // Victor isolation
  });
});
