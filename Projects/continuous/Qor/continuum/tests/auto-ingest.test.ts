import { describe, it, expect, afterAll } from "bun:test";
import { ingestAll } from "../src/ingest/memory-to-graph";
import { writeFileSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = "/home/workspace/.continuum/memory/victor";
const TIMEOUT = 120_000;

afterAll(() => {
  const testFile = join(TEST_DIR, "_test-auto-ingest.json");
  try { rmSync(testFile); } catch {}
});

describe("Auto-Ingestion", () => {
  it("is idempotent — same totals on repeated runs", async () => {
    const first = await ingestAll();
    const second = await ingestAll();
    expect(second.total).toBe(first.total);
    expect(second.agents).toBe(first.agents);
  }, TIMEOUT);

  it("picks up new records on next sync", async () => {
    const before = await ingestAll();
    const testFile = join(TEST_DIR, "_test-auto-ingest.json");
    const record = {
      id: `test-auto-ingest-${Date.now()}`,
      type: "observation",
      agent: "victor",
      content: { raw: "Auto-ingest test record", entities: [] },
      provenance: { createdAt: Date.now(), source: "test" },
    };
    writeFileSync(testFile, JSON.stringify(record));

    const after = await ingestAll();
    expect(after.total).toBeGreaterThan(before.total);
  }, TIMEOUT);
});
