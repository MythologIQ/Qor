import { describe, it, expect, afterAll } from "bun:test";
import {
  findCoOccurrences,
  createSemanticNode,
  mergeSemanticNode,
  deriveIncrementalSemantic,
  getSemanticNodes,
} from "../src/derive/semantic-derive";
import { closeDriver } from "../src/service/graph-api";
import type { EpisodicRecord, SemanticNode } from "../src/derive/types";

afterAll(async () => {
  await closeDriver();
});

function makeRecord(id: string, entities: string[], ts = 1000): EpisodicRecord {
  return { id, content: "test", agent: "victor", type: "observation", timestamp: ts, entities };
}

describe("findCoOccurrences", () => {
  it("finds entity pairs above threshold", () => {
    const records = [
      makeRecord("r1", ["neo4j", "victor"]),
      makeRecord("r2", ["neo4j", "victor"]),
      makeRecord("r3", ["neo4j", "victor"]),
    ];
    const result = findCoOccurrences(records, 3);
    expect(result).toHaveLength(1);
    expect(result[0].entityA).toBe("neo4j");
    expect(result[0].entityB).toBe("victor");
    expect(result[0].count).toBe(3);
  });

  it("ignores pairs below threshold", () => {
    const records = [
      makeRecord("r1", ["neo4j", "victor"]),
      makeRecord("r2", ["neo4j", "victor"]),
    ];
    const result = findCoOccurrences(records, 3);
    expect(result).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    expect(findCoOccurrences([])).toHaveLength(0);
  });
});

describe("createSemanticNode", () => {
  it("creates node with correct structure", () => {
    const cooc = {
      entityA: "neo4j", entityB: "victor",
      count: 5, recordIds: ["r1", "r2", "r3", "r4", "r5"],
      firstSeen: "1000", lastSeen: "5000",
    };
    const node = createSemanticNode(cooc);
    expect(node.type).toBe("semantic");
    expect(node.subtype).toBe("co-occurrence");
    expect(node.entities).toEqual(["neo4j", "victor"]);
    expect(node.confidence).toBe(0.25); // 5/20
    expect(node.episodicCount).toBe(5);
  });

  it("caps confidence at 1.0", () => {
    const cooc = {
      entityA: "a", entityB: "b",
      count: 30, recordIds: [], firstSeen: "0", lastSeen: "0",
    };
    expect(createSemanticNode(cooc).confidence).toBe(1.0);
  });
});

describe("mergeSemanticNode", () => {
  it("updates count, confidence, and lastSeen", () => {
    const node: SemanticNode = {
      id: "test", type: "semantic", subtype: "co-occurrence",
      label: "a + b", entities: ["a", "b"],
      confidence: 0.5, episodicCount: 10,
      firstSeen: "1000", lastSeen: "5000",
    };
    const merged = mergeSemanticNode(node, ["r1", "r2"], "9000");
    expect(merged.episodicCount).toBe(12);
    expect(merged.confidence).toBe(0.6);
    expect(merged.lastSeen).toBe("9000");
    expect(merged.firstSeen).toBe("1000");
  });
});

describe("deriveIncrementalSemantic", () => {
  const existing: SemanticNode[] = [{
    id: "sem-cooc-a-b", type: "semantic", subtype: "co-occurrence",
    label: "a + b", entities: ["a", "b"],
    confidence: 0.5, episodicCount: 10,
    firstSeen: "1000", lastSeen: "5000",
  }];

  it("merges into existing node when pair already tracked", () => {
    const record = makeRecord("r1", ["a", "b"], 6000);
    const results = deriveIncrementalSemantic(record, existing);
    expect(results).toHaveLength(1);
    expect(results[0].episodicCount).toBe(11);
  });

  it("returns empty for untracked pairs", () => {
    const record = makeRecord("r1", ["x", "y"], 6000);
    const results = deriveIncrementalSemantic(record, existing);
    expect(results).toHaveLength(0);
  });
});

describe("getSemanticNodes (integration)", () => {
  it("returns array from graph", async () => {
    const nodes = await getSemanticNodes(5);
    expect(nodes).toBeInstanceOf(Array);
  });
});
