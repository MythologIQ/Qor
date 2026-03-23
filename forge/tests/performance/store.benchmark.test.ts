/**
 * Store Performance Benchmarks
 * 
 * Tests store read/write latency at scale:
 * - 1K thoughts (baseline)
 * - 10K thoughts (medium scale)
 * - 100K thoughts (large scale)
 * 
 * Uses temporary directories for isolation.
 * Run with: npm run test:perf or vitest run tests/performance/
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { VoidStore, type BatchThoughtInput, type BatchImportResult } from "../../runtime/planning/VoidStore";
import { ViewStore } from "../../runtime/planning/ViewStore";
import type { VoidThought } from "@mythologiq/qore-contracts";

// Benchmark thresholds (in milliseconds)
// Note: CI environments have more variability than local development
const THRESHOLDS = {
  VOID_ADD_SINGLE: { warn: 50, fail: 200 },  // Single write includes dir create, stat, index update - CI variability
  VOID_ADD_BATCH_1K: { warn: 500, fail: 2000 },
  VOID_ADD_BATCH_10K: { warn: 5000, fail: 15000 },
  VOID_GET_PAGINATED: { warn: 50, fail: 200 },
  VOID_GET_BY_ID_INDEXED: { warn: 50, fail: 200 },  // Index lookup with CI variability
  VOID_GET_BY_ID_SCAN: { warn: 100, fail: 500 },
  VOID_COUNT: { warn: 50, fail: 200 },  // More realistic for CI
  VIEW_READ: { warn: 5, fail: 20 },
  VIEW_WRITE: { warn: 10, fail: 50 },
};

// Scale sizes for benchmarks
const SCALES = {
  SMALL: 1000,   // 1K thoughts
  MEDIUM: 10000, // 10K thoughts
  LARGE: 100000, // 100K thoughts (optional, slow)
};

interface BenchmarkResult {
  name: string;
  scale: number;
  durationMs: number;
  threshold: { warn: number; fail: number };
  status: "pass" | "warn" | "fail";
  opsPerSecond?: number;
}

const results: BenchmarkResult[] = [];

function benchmark(
  name: string,
  scale: number,
  threshold: { warn: number; fail: number },
  fn: () => Promise<void> | void,
): BenchmarkResult {
  const start = performance.now();
  fn();
  const durationMs = performance.now() - start;

  let status: "pass" | "warn" | "fail" = "pass";
  if (durationMs > threshold.fail) {
    status = "fail";
  } else if (durationMs > threshold.warn) {
    status = "warn";
  }

  const result: BenchmarkResult = {
    name,
    scale,
    durationMs: Math.round(durationMs * 100) / 100,
    threshold,
    status,
  };

  results.push(result);
  return result;
}

async function benchmarkAsync(
  name: string,
  scale: number,
  threshold: { warn: number; fail: number },
  fn: () => Promise<void>,
): Promise<BenchmarkResult> {
  const start = performance.now();
  await fn();
  const durationMs = performance.now() - start;

  let status: "pass" | "warn" | "fail" = "pass";
  if (durationMs > threshold.fail) {
    status = "fail";
  } else if (durationMs > threshold.warn) {
    status = "warn";
  }

  const result: BenchmarkResult = {
    name,
    scale,
    durationMs: Math.round(durationMs * 100) / 100,
    threshold,
    status,
  };

  results.push(result);
  return result;
}

function generateThought(index: number): BatchThoughtInput {
  return {
    content: `Thought ${index}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
    source: Math.random() > 0.3 ? "text" : "voice",
    capturedBy: "benchmark-user",
    tags: [`tag-${index % 10}`, `batch-${Math.floor(index / 1000)}`],
  };
}

describe("VoidStore Performance Benchmarks", () => {
  let tempDir: string;
  let store: VoidStore;
  const projectId = "perf-test-project";

  beforeEach(async () => {
    tempDir = join(tmpdir(), `void-perf-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    store = new VoidStore(tempDir, projectId);
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Write Performance", () => {
    it("addThought - single write", async () => {
      const thought: VoidThought = {
        thoughtId: "thought-test-001",
        projectId,
        content: "Test thought content",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "benchmark",
        tags: ["test"],
        status: "raw",
      };

      const result = await benchmarkAsync(
        "addThought - single",
        1,
        THRESHOLDS.VOID_ADD_SINGLE,
        async () => {
          await store.addThought(thought, "benchmark");
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("addThoughtsBatch - 1K thoughts", async () => {
      const thoughts: BatchThoughtInput[] = Array.from(
        { length: SCALES.SMALL },
        (_, i) => generateThought(i),
      );

      let totalSucceeded = 0;
      const result = await benchmarkAsync(
        "addThoughtsBatch - 1K",
        SCALES.SMALL,
        THRESHOLDS.VOID_ADD_BATCH_1K,
        async () => {
          const batchResult = await store.addThoughtsBatch(thoughts, { skipDuplicates: false });
          totalSucceeded = batchResult.totalSucceeded;
        },
      );

      result.opsPerSecond = Math.round(SCALES.SMALL / (result.durationMs / 1000));

      expect(result.status).not.toBe("fail");
      expect(totalSucceeded).toBe(SCALES.SMALL);
      console.log(
        `[BENCH] ${result.name}: ${result.durationMs}ms (${result.opsPerSecond} ops/s, ${result.status})`,
      );
    });

    it("addThoughtsBatch - 10K thoughts", async () => {
      const thoughts: BatchThoughtInput[] = Array.from(
        { length: SCALES.MEDIUM },
        (_, i) => generateThought(i),
      );

      const result = await benchmarkAsync(
        "addThoughtsBatch - 10K",
        SCALES.MEDIUM,
        THRESHOLDS.VOID_ADD_BATCH_10K,
        async () => {
          const res = await store.addThoughtsBatch(thoughts, { skipDuplicates: false });
          expect(res.totalSucceeded).toBe(SCALES.MEDIUM);
        },
      );

      result.opsPerSecond = Math.round(SCALES.MEDIUM / (result.durationMs / 1000));

      expect(result.status).not.toBe("fail");
      console.log(
        `[BENCH] ${result.name}: ${result.durationMs}ms (${result.opsPerSecond} ops/s, ${result.status})`,
      );
    });
  });

  describe("Read Performance", () => {
    beforeEach(async () => {
      // Pre-populate store with test data
      const thoughts: BatchThoughtInput[] = Array.from(
        { length: SCALES.MEDIUM },
        (_, i) => generateThought(i),
      );
      await store.addThoughtsBatch(thoughts, { skipDuplicates: false });
      
      // Warm-up read to ensure file system cache is primed
      // This prevents the first benchmark from being artificially slow
      await store.getThoughts({ offset: 0, limit: 1 });
    });

    it("getThoughts - paginated (page 1, limit 50)", async () => {
      const result = await benchmarkAsync(
        "getThoughts - paginated",
        50,
        THRESHOLDS.VOID_GET_PAGINATED,
        async () => {
          const res = await store.getThoughts({ offset: 0, limit: 50 });
          expect(res.thoughts.length).toBe(50);
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("getThoughts - paginated with filter", async () => {
      const result = await benchmarkAsync(
        "getThoughts - filtered",
        50,
        THRESHOLDS.VOID_GET_PAGINATED,
        async () => {
          const res = await store.getThoughts({
            offset: 0,
            limit: 50,
            filter: { status: "raw" },
          });
          expect(res.thoughts.length).toBeLessThanOrEqual(50);
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("getThought - by ID (indexed)", async () => {
      // First, build the index
      await store.buildIndex();

      // Get a known thought ID
      const allThoughts = await store.getThoughts({ limit: 1 });
      const thoughtId = allThoughts.thoughts[0]?.thoughtId;
      expect(thoughtId).toBeDefined();

      const result = await benchmarkAsync(
        "getThought - indexed",
        1,
        THRESHOLDS.VOID_GET_BY_ID_INDEXED,
        async () => {
          const thought = await store.getThought(thoughtId!);
          expect(thought).not.toBeNull();
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("getThoughtCount - fast count", async () => {
      const result = await benchmarkAsync(
        "getThoughtCount",
        1,
        THRESHOLDS.VOID_COUNT,
        async () => {
          const count = await store.getThoughtCount();
          expect(count).toBe(SCALES.MEDIUM);
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("getAllThoughts - full scan (baseline)", async () => {
      // This is expected to be slow - measuring for baseline
      const result = await benchmarkAsync(
        "getAllThoughts - full scan",
        SCALES.MEDIUM,
        { warn: 500, fail: 2000 },
        async () => {
          const thoughts = await store.getAllThoughts();
          expect(thoughts.length).toBe(SCALES.MEDIUM);
        },
      );

      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
      // Don't fail on this - it's a baseline measurement
    });
  });

  describe("Index Performance", () => {
    it("buildIndex - 10K thoughts", async () => {
      const thoughts: BatchThoughtInput[] = Array.from(
        { length: SCALES.MEDIUM },
        (_, i) => generateThought(i),
      );
      await store.addThoughtsBatch(thoughts, { skipDuplicates: false });

      const result = await benchmarkAsync(
        "buildIndex - 10K",
        SCALES.MEDIUM,
        { warn: 1000, fail: 5000 },
        async () => {
          const count = await store.buildIndex();
          expect(count).toBe(SCALES.MEDIUM);
        },
      );

      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });
  });
});

describe("ViewStore Performance Benchmarks", () => {
  let tempDir: string;
  let store: ViewStore;
  const projectId = "perf-test-project";

  beforeEach(async () => {
    tempDir = join(tmpdir(), `view-perf-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    store = new ViewStore(tempDir, projectId, "reveal");
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Read/Write Performance", () => {
    it("write - small data (< 1KB)", async () => {
      const data = {
        clusters: [
          { clusterId: "c1", name: "Cluster 1", thoughts: ["t1", "t2"] },
        ],
      };

      const result = await benchmarkAsync(
        "ViewStore.write - small",
        1,
        THRESHOLDS.VIEW_WRITE,
        async () => {
          await store.write(data, "benchmark");
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("write - medium data (~100KB)", async () => {
      const clusters = Array.from({ length: 100 }, (_, i) => ({
        clusterId: `cluster-${i}`,
        name: `Cluster ${i}`,
        thoughts: Array.from({ length: 50 }, (_, j) => `thought-${i}-${j}`),
        notes: "A".repeat(100), // ~100 bytes of notes per cluster
      }));

      const data = { clusters };

      const result = await benchmarkAsync(
        "ViewStore.write - medium",
        100,
        { warn: 50, fail: 200 },
        async () => {
          await store.write(data, "benchmark");
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("read - small data (< 1KB)", async () => {
      const data = {
        clusters: [
          { clusterId: "c1", name: "Cluster 1", thoughts: ["t1", "t2"] },
        ],
      };
      await store.write(data, "benchmark");

      const result = await benchmarkAsync(
        "ViewStore.read - small",
        1,
        THRESHOLDS.VIEW_READ,
        async () => {
          const read = await store.read();
          expect(read).not.toBeNull();
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("read - medium data (~100KB)", async () => {
      const clusters = Array.from({ length: 100 }, (_, i) => ({
        clusterId: `cluster-${i}`,
        name: `Cluster ${i}`,
        thoughts: Array.from({ length: 50 }, (_, j) => `thought-${i}-${j}`),
        notes: "A".repeat(100),
      }));
      await store.write({ clusters }, "benchmark");

      const result = await benchmarkAsync(
        "ViewStore.read - medium",
        100,
        { warn: 20, fail: 100 },
        async () => {
          const read = await store.read();
          expect(read).not.toBeNull();
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });
  });
});

// Summary report at the end
describe("Performance Summary", () => {
  it("should print benchmark summary", () => {
    console.log("\n" + "=".repeat(60));
    console.log("PERFORMANCE BENCHMARK SUMMARY");
    console.log("=".repeat(60));

    if (results.length === 0) {
      console.log("No benchmarks run yet.");
      return;
    }

    console.log(
      "Name".padEnd(40) +
        "Scale".padStart(10) +
        "Duration".padStart(12) +
        "Threshold".padStart(12) +
        "Status".padStart(8),
    );
    console.log("-".repeat(82));

    for (const r of results) {
      console.log(
        r.name.padEnd(40) +
          r.scale.toString().padStart(10) +
          `${r.durationMs}ms`.padStart(12) +
          `<${r.threshold.warn}ms`.padStart(12) +
          r.status.toUpperCase().padStart(8),
      );
    }

    console.log("=".repeat(60));

    const failed = results.filter((r) => r.status === "fail");
    const warned = results.filter((r) => r.status === "warn");

    console.log(`Total: ${results.length}, Pass: ${results.length - failed.length - warned.length}, Warn: ${warned.length}, Fail: ${failed.length}`);

    if (failed.length > 0) {
      console.log("\nFAILURES:");
      failed.forEach((r) => console.log(`  - ${r.name}: ${r.durationMs}ms (threshold: ${r.threshold.fail}ms)`));
    }

    // This test always passes - it's just reporting
    expect(true).toBe(true);
  });
});
