import { describe, it, expect } from "bun:test";
import {
  buildUpsertSemanticNodesCypher,
  buildUpsertSemanticEdgesCypher,
  buildTombstoneCypher,
  type SemanticEdgeInput,
  type SemanticNodeInput,
} from "../../src/memory/ops/semantic-helpers";

const node: SemanticNodeInput = {
  id: "n1",
  documentId: "d1",
  sourceChunkId: "c1",
  nodeType: "concept",
  label: "label",
  summary: "sum",
  fingerprint: "fp",
  attributes: { k: "v" },
  state: "active",
};

const edge: SemanticEdgeInput = {
  id: "e1",
  documentId: "d1",
  sourceChunkId: "c1",
  fromNodeId: "n1",
  toNodeId: "n2",
  edgeType: "rel",
  fingerprint: "fp",
  attributes: { k: "v" },
  state: "active",
};

describe("memory/ops/semantic-helpers", () => {
  it("upsert nodes includes partition + param array", () => {
    const spec = buildUpsertSemanticNodesCypher("shared-operational", [node]);
    expect(spec.cypher).toContain("UNWIND $nodes AS n");
    expect(spec.cypher).toContain("MERGE (s:SemanticNode {id: n.id})");
    expect(spec.params).toEqual({ partition: "shared-operational", nodes: [node] });
  });

  it("upsert edges preserves edge type via property, not label", () => {
    const spec = buildUpsertSemanticEdgesCypher("audit", [edge]);
    expect(spec.cypher).toContain("MERGE (a)-[r:SEMANTIC_EDGE {id: e.id}]->(b)");
    expect(spec.cypher).toContain("r.edge_type = e.edgeType");
    expect(spec.params).toEqual({ partition: "audit", edges: [edge] });
  });

  it("tombstone only rewrites state, filters by partition", () => {
    const spec = buildTombstoneCypher("agent-private:victor", ["x", "y"]);
    expect(spec.cypher).toContain("WHERE s.partition = $partition");
    expect(spec.cypher).toContain("SET s.state = 'tombstoned'");
    expect(spec.params).toEqual({ partition: "agent-private:victor", nodeIds: ["x", "y"] });
  });

  it("builders are pure (no I/O, deterministic)", () => {
    const a = buildUpsertSemanticNodesCypher("canonical", [node]);
    const b = buildUpsertSemanticNodesCypher("canonical", [node]);
    expect(a.cypher).toBe(b.cypher);
    expect(a.params).toEqual(b.params);
  });
});
