import { describe, it, expect, afterAll } from "bun:test";
import {
  cosineSimilarity,
  computeCentroid,
  clusterByCosineSimilarity,
  labelCluster,
  createClusterNode,
  reconcileClusters,
} from "../src/derive/semantic-cluster";
import { closeDriver } from "../src/service/graph-api";
import type { SemanticNode, Cluster } from "../src/derive/types";

afterAll(async () => {
  await closeDriver();
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe("computeCentroid", () => {
  it("averages embeddings", () => {
    const c = computeCentroid([[2, 4], [4, 6]]);
    expect(c).toEqual([3, 5]);
  });

  it("returns empty for no embeddings", () => {
    expect(computeCentroid([])).toEqual([]);
  });
});

describe("clusterByCosineSimilarity", () => {
  it("groups similar records", () => {
    const records = [
      { id: "a", embedding: [1, 0, 0], content: "test a", entities: ["e1"] },
      { id: "b", embedding: [0.99, 0.01, 0], content: "test b", entities: ["e1"] },
      { id: "c", embedding: [0, 0, 1], content: "test c", entities: ["e2"] },
    ];
    const clusters = clusterByCosineSimilarity(records, 0.9);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(2);
  });

  it("keeps dissimilar records separate", () => {
    const records = [
      { id: "a", embedding: [1, 0], content: "a", entities: [] },
      { id: "b", embedding: [0, 1], content: "b", entities: [] },
    ];
    const clusters = clusterByCosineSimilarity(records, 0.9);
    expect(clusters).toHaveLength(0); // neither forms a 2+ member cluster
  });

  it("returns empty for empty input", () => {
    expect(clusterByCosineSimilarity([])).toHaveLength(0);
  });
});

describe("labelCluster", () => {
  it("picks most frequent entities", () => {
    const cluster: Cluster = {
      members: [],
      centroid: [],
      entities: ["neo4j", "neo4j", "victor", "forge", "neo4j"],
    };
    const label = labelCluster(cluster);
    expect(label).toContain("neo4j");
  });

  it("returns unnamed for empty entities", () => {
    const cluster: Cluster = { members: [], centroid: [], entities: [] };
    expect(labelCluster(cluster)).toBe("unnamed-cluster");
  });
});

describe("createClusterNode", () => {
  it("creates semantic node with cluster subtype", () => {
    const cluster: Cluster = {
      members: [
        { id: "a", embedding: [1, 0], content: "a" },
        { id: "b", embedding: [0.9, 0.1], content: "b" },
      ],
      centroid: [0.95, 0.05],
      entities: ["neo4j"],
    };
    const node = createClusterNode(cluster);
    expect(node.type).toBe("semantic");
    expect(node.subtype).toBe("cluster");
    expect(node.episodicCount).toBe(2);
    expect(node.embedding).toEqual([0.95, 0.05]);
  });
});

describe("reconcileClusters", () => {
  const existing: SemanticNode[] = [{
    id: "old-1", type: "semantic", subtype: "cluster",
    label: "test", entities: [], confidence: 0.5,
    episodicCount: 5, firstSeen: "2026-01-01", lastSeen: "2026-01-01",
    embedding: [1, 0, 0],
  }];

  it("merges overlapping clusters", () => {
    const newNodes: SemanticNode[] = [{
      id: "new-1", type: "semantic", subtype: "cluster",
      label: "test", entities: [], confidence: 0.8,
      episodicCount: 10, firstSeen: "2026-01-01", lastSeen: "2026-04-01",
      embedding: [0.99, 0.01, 0],
    }];
    const { create, merge, retire } = reconcileClusters(newNodes, existing);
    expect(merge).toHaveLength(1);
    expect(create).toHaveLength(0);
    expect(retire).toHaveLength(0);
  });

  it("retires dissolved clusters", () => {
    const { retire } = reconcileClusters([], existing);
    expect(retire).toHaveLength(1);
    expect(retire[0]).toBe("old-1");
  });

  it("creates genuinely new clusters", () => {
    const newNodes: SemanticNode[] = [{
      id: "brand-new", type: "semantic", subtype: "cluster",
      label: "new", entities: [], confidence: 0.5,
      episodicCount: 3, firstSeen: "2026-04-01", lastSeen: "2026-04-01",
      embedding: [0, 0, 1],
    }];
    const { create, retire } = reconcileClusters(newNodes, existing);
    expect(create).toHaveLength(1);
    expect(retire).toHaveLength(1);
  });
});
