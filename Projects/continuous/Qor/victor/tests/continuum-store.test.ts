import { describe, it, expect } from "bun:test";
import { ContinuumStore } from "../src/kernel/memory/continuum-store";
import { createLearningStore, createExecutionEventStore } from "../src/kernel/memory/store";
import type { ContinuumClient } from "../../continuum/client";

class RecordingClient {
  public readonly calls: { op: string; params: unknown }[] = [];
  public closed = false;
  async call<T = unknown>(op: string, params: unknown): Promise<T> {
    this.calls.push({ op, params });
    if (op === "events.query" || op === "events.execution.query") return [] as unknown as T;
    if (op === "graph.loadDocumentSnapshot") return { nodes: [], edges: [] } as unknown as T;
    if (op === "search.chunks" || op === "search.chunksByVector") return [] as unknown as T;
    if (op === "search.semanticNodes" || op === "search.loadFreshCacheEntries") return [] as unknown as T;
    if (op === "search.expandNeighborhood") return { nodes: [], edges: [] } as unknown as T;
    if (op === "events.execution.record") return { id: "evt_1" } as unknown as T;
    return undefined as unknown as T;
  }
  async close(): Promise<void> { this.closed = true; }
}

function mkClient(): { fake: RecordingClient; typed: ContinuumClient } {
  const fake = new RecordingClient();
  return { fake, typed: fake as unknown as ContinuumClient };
}

describe("ContinuumStore (delegator)", () => {
  it("forwards events.initialize and close", async () => {
    const { fake, typed } = mkClient();
    const s = new ContinuumStore(typed);
    await s.initialize();
    await s.close();
    expect(fake.calls[0]).toEqual({ op: "events.initialize", params: {} });
    expect(fake.closed).toBe(true);
  });

  it("forwards learning ops to named op names", async () => {
    const { fake, typed } = mkClient();
    const s = new ContinuumStore(typed);
    await s.index({ id: "p1" } as never);
    await s.query({ limit: 5 } as never);
    await s.update("id1", { id: "id1" } as never);
    await s.updateHeatmap({ taskId: "t" } as never);
    const ops = fake.calls.map((c) => c.op);
    expect(ops).toEqual(["events.index", "events.query", "events.update", "events.updateHeatmap"]);
  });

  it("forwards graph ops to named op names", async () => {
    const { fake, typed } = mkClient();
    const s = new ContinuumStore(typed);
    await s.loadDocumentSnapshot("doc1");
    await s.upsertDocument({ id: "d1" } as never);
    await s.replaceDocumentChunks("d1", []);
    await s.upsertSemanticNodes([]);
    await s.markSemanticNodesTombstoned([]);
    await s.upsertSemanticEdges([]);
    await s.markSemanticEdgesTombstoned([]);
    await s.upsertCacheEntries("p1", []);
    await s.markCacheEntriesStale([]);
    const ops = fake.calls.map((c) => c.op);
    expect(ops).toEqual([
      "graph.loadDocumentSnapshot",
      "graph.upsertDocument",
      "graph.replaceDocumentChunks",
      "graph.upsertSemanticNodes",
      "graph.markSemanticNodesTombstoned",
      "graph.upsertSemanticEdges",
      "graph.markSemanticEdgesTombstoned",
      "graph.upsertCacheEntries",
      "graph.markCacheEntriesStale",
    ]);
  });

  it("forwards search ops to named op names", async () => {
    const { fake, typed } = mkClient();
    const s = new ContinuumStore(typed);
    await s.appendIngestionRun({ runId: "r1" } as never);
    await s.searchChunks("p1", "q", 5);
    await s.searchChunksByVector("p1", [0.1], 5);
    await s.searchSemanticNodes("p1", "q", 5);
    await s.expandNeighborhood([], 1);
    await s.loadFreshCacheEntries("p1");
    const ops = fake.calls.map((c) => c.op);
    expect(ops).toEqual([
      "search.appendIngestionRun",
      "search.chunks",
      "search.chunksByVector",
      "search.semanticNodes",
      "search.expandNeighborhood",
      "search.loadFreshCacheEntries",
    ]);
  });

  it("forwards execution event ops", async () => {
    const { fake, typed } = mkClient();
    const s = new ContinuumStore(typed);
    const r = await s.record({
      id: "e1", agentId: "victor", partition: "agent-private:victor",
      taskId: "t1", source: "forge:queue:p1", status: "completed", timestamp: 1,
    });
    expect(r.id).toBe("evt_1");
    await s.queryExecutions({ taskId: "t1" });
    expect(fake.calls.map((c) => c.op)).toEqual([
      "events.execution.record",
      "events.execution.query",
    ]);
  });

  it("factories produce ContinuumStore instances", () => {
    const { typed } = mkClient();
    const ls = createLearningStore(typed);
    const es = createExecutionEventStore(typed);
    expect(ls).toBeInstanceOf(ContinuumStore);
    expect(es).toBeInstanceOf(ContinuumStore);
  });
});
