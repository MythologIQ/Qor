import { describe, it, expect, beforeEach } from "bun:test";
import { Moltbook, type MoltEntry, type MoltEntryType } from "../src/moltbook/ledger";

function makeProvenance() {
  return { source: "test-agent", tier: 1, autonomyLevel: 1 };
}

describe("Moltbook", () => {
  let book: Moltbook;

  beforeEach(() => {
    book = new Moltbook();
  });

  it("starts with empty entries", () => {
    expect(book.getEntries()).toEqual([]);
  });

  it("appends an entry with genesis prevHash", () => {
    const entry = book.append("HEARTBEAT", { pulse: 1 }, makeProvenance());
    expect(entry.seq).toBe(1);
    expect(entry.prevHash).toBe("genesis");
    expect(entry.type).toBe("HEARTBEAT");
    expect(entry.hash).toBeTruthy();
  });

  it("chains entries correctly", () => {
    const e1 = book.append("HEARTBEAT", {}, makeProvenance());
    const e2 = book.append("TASK_COMPLETE", { task: "x" }, makeProvenance());
    expect(e2.prevHash).toBe(e1.hash);
    expect(e2.seq).toBe(2);
  });

  it("stores payload and provenance", () => {
    const payload = { target: "build-123", reason: "quality" };
    const prov = { source: "victor", tier: 2, autonomyLevel: 3 };
    const entry = book.append("VETO", payload, prov);
    expect(entry.payload).toEqual(payload);
    expect(entry.provenance).toEqual(prov);
  });

  it("filters by type", () => {
    book.append("HEARTBEAT", {}, makeProvenance());
    book.append("VETO", {}, makeProvenance());
    book.append("HEARTBEAT", {}, makeProvenance());
    const heartbeats = book.getEntries({ type: "HEARTBEAT" });
    expect(heartbeats.length).toBe(2);
    expect(heartbeats.every(e => e.type === "HEARTBEAT")).toBe(true);
  });

  it("filters by since timestamp", () => {
    const e1 = book.append("HEARTBEAT", {}, makeProvenance());
    const e2 = book.append("VETO", {}, makeProvenance());
    const filtered = book.getEntries({ since: e2.timestamp });
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered[filtered.length - 1].seq).toBe(e2.seq);
  });

  it("verifies chain integrity on valid chain", () => {
    book.append("HEARTBEAT", {}, makeProvenance());
    book.append("TASK_COMPLETE", {}, makeProvenance());
    book.append("AUDIT", {}, makeProvenance());
    expect(book.getChainIntegrity()).toEqual({ valid: true });
  });

  it("reports valid for empty chain", () => {
    expect(book.getChainIntegrity()).toEqual({ valid: true });
  });

  it("generates different hashes for chained entries", () => {
    const e1 = book.append("HEARTBEAT", { a: 1 }, makeProvenance());
    const e2 = book.append("HEARTBEAT", { a: 2 }, makeProvenance());
    expect(e1.hash).not.toBe(e2.hash);
  });

  it("timestamps entries with ISO format", () => {
    const entry = book.append("HEARTBEAT", {}, makeProvenance());
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
