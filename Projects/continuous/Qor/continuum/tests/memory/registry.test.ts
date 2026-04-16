import { describe, it, expect } from "bun:test";
import {
  OP_TABLE,
  UnknownOpError,
  dispatchOp,
  listOps,
} from "../../src/memory/ops/registry";
import type { AgentContext } from "../../src/memory/access-policy";

describe("memory/ops/registry", () => {
  it("contains learning, execution, graph, and search ops", () => {
    const names = listOps();
    expect(names).toContain("events.index");
    expect(names).toContain("events.query");
    expect(names).toContain("events.update");
    expect(names).toContain("events.updateHeatmap");
    expect(names).toContain("events.execution.record");
    expect(names).toContain("events.execution.query");
    expect(names).toContain("graph.upsertDocument");
    expect(names).toContain("graph.replaceDocumentChunks");
    expect(names).toContain("graph.upsertSemanticNodes");
    expect(names).toContain("graph.upsertSemanticEdges");
    expect(names).toContain("graph.upsertCacheEntries");
    expect(names).toContain("graph.markCacheEntriesStale");
    expect(names).toContain("search.chunks");
    expect(names).toContain("search.chunksByVector");
    expect(names).toContain("search.semanticNodes");
    expect(names).toContain("search.expandNeighborhood");
  });

  it("OP_TABLE is frozen", () => {
    expect(Object.isFrozen(OP_TABLE)).toBe(true);
  });

  it("dispatchOp throws UnknownOpError on missing handler", () => {
    const ctx: AgentContext = { agentId: "victor", partitions: [] };
    expect(() => dispatchOp("no.such.op", {}, ctx)).toThrow(UnknownOpError);
  });

  it("listOps returns sorted names", () => {
    const names = listOps();
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});
