import { describe, it, expect } from "bun:test";
import {
  renderAuditTrail,
  renderMemoryOverview,
  renderNodeDetail,
  renderSearchResults,
} from "../src/kernel/memory/memory-operator-views";

describe("memory operator views", () => {
  it("renders overview stats", () => {
    const view = renderMemoryOverview({
      documents: [{ id: "d1" } as any],
      chunks: [{ id: "c1" } as any],
      nodes: [{ id: "n1", state: "active" } as any],
      cacheEntries: [{ id: "k1", status: "stale" } as any],
    });
    expect(view.kind).toBe("overview");
    expect((view.data as any).documentCount).toBe(1);
  });

  it("renders node detail", () => {
    const view = renderNodeDetail("n1", {
      nodes: [{ id: "n1" } as any],
      edges: [{ fromNodeId: "n1", toNodeId: "n2" } as any],
    });
    expect(view.kind).toBe("node-detail");
    expect((view.data as any).edges).toHaveLength(1);
  });

  it("renders search results", () => {
    const view = renderSearchResults("query", [
      { chunk: { id: "c1", documentId: "d1", text: "hello world" } as any, score: 0.9 },
    ]);
    expect(view.kind).toBe("search-results");
    expect((view.data as any).total).toBe(1);
  });

  it("renders audit trail", () => {
    const view = renderAuditTrail("n1", [{ action: "forget" }]);
    expect(view.kind).toBe("audit-trail");
    expect((view.data as any).total).toBe(1);
  });
});
