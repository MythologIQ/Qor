/**
 * API Performance Benchmarks
 * 
 * Tests API endpoint response times under load:
 * - Single request latency
 * - Concurrent request throughput
 * - Pagination performance
 * - Batch operations
 * 
 * Uses mock HTTP server for isolation.
 * Run with: npm run test:perf or vitest run tests/performance/
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { VoidStore, type BatchThoughtInput } from "../../runtime/planning/VoidStore";
import { ViewStore } from "../../runtime/planning/ViewStore";

// Benchmark thresholds (in milliseconds)
const THRESHOLDS = {
  API_SINGLE_REQUEST: { warn: 50, fail: 200 },
  API_PAGINATED: { warn: 100, fail: 300 },
  API_BATCH_100: { warn: 200, fail: 500 },
  API_BATCH_1K: { warn: 1000, fail: 3000 },
  API_CONCURRENT_10: { warn: 500, fail: 2000 },
  API_CONCURRENT_50: { warn: 2000, fail: 5000 },
};

const SCALES = {
  SMALL: 1000,
  MEDIUM: 10000,
};

interface BenchmarkResult {
  name: string;
  scale: number;
  durationMs: number;
  threshold: { warn: number; fail: number };
  status: "pass" | "warn" | "fail";
  requestsPerSecond?: number;
}

const results: BenchmarkResult[] = [];

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
    content: `Thought ${index}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
    source: Math.random() > 0.3 ? "text" : "voice",
    capturedBy: "benchmark-user",
    tags: [`tag-${index % 10}`],
  };
}

// Simple mock API server
class MockApiServer {
  private server: Server | null = null;
  private store: VoidStore | null = null;
  private viewStore: ViewStore | null = null;
  public port: number = 0;

  async start(tempDir: string, projectId: string): Promise<number> {
    this.store = new VoidStore(tempDir, projectId);
    this.viewStore = new ViewStore(tempDir, projectId, "reveal");

    return new Promise((resolve) => {
      this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        const url = req.url || "/";
        const method = req.method || "GET";

        // Set JSON content type
        res.setHeader("Content-Type", "application/json");

        try {
          // Route: GET /api/projects/:projectId/void/thoughts
          if (url.includes("/void/thoughts") && method === "GET") {
            const urlObj = new URL(url, `http://localhost`);
            const page = parseInt(urlObj.searchParams.get("page") || "1");
            const limit = parseInt(urlObj.searchParams.get("limit") || "50");

            const result = await this.store!.getThoughts({
              offset: (page - 1) * limit,
              limit,
            });

            res.writeHead(200);
            res.end(
              JSON.stringify({
                data: result.thoughts,
                meta: {
                  pagination: {
                    page,
                    limit,
                    total: result.total,
                    hasMore: result.hasMore,
                  },
                },
              }),
            );
            return;
          }

          // Route: GET /api/projects/:projectId/void/thoughts/:thoughtId
          const singleThoughtMatch = url.match(/\/void\/thoughts\/([^/]+)$/);
          if (singleThoughtMatch && method === "GET") {
            const thoughtId = singleThoughtMatch[1];
            const thought = await this.store!.getThought(thoughtId);

            if (thought) {
              res.writeHead(200);
              res.end(JSON.stringify({ data: thought }));
            } else {
              res.writeHead(404);
              res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Thought not found" } }));
            }
            return;
          }

          // Route: POST /api/projects/:projectId/void/thoughts
          if (url.includes("/void/thoughts") && method === "POST") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", async () => {
              try {
                const data = JSON.parse(body);
                const thought = {
                  thoughtId: `thought-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  projectId: "perf-test",
                  ...data,
                  capturedAt: new Date().toISOString(),
                  status: data.status || "raw",
                };
                await this.store!.addThought(thought, "api");
                res.writeHead(201);
                res.end(JSON.stringify({ data: thought }));
              } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: { code: "BAD_REQUEST" } }));
              }
            });
            return;
          }

          // Route: POST /api/projects/:projectId/void/thoughts/batch
          if (url.includes("/void/thoughts/batch") && method === "POST") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", async () => {
              try {
                const { thoughts } = JSON.parse(body);
                const result = await this.store!.addThoughtsBatch(thoughts, { skipDuplicates: false });
                res.writeHead(201);
                res.end(JSON.stringify({ data: result }));
              } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: { code: "BAD_REQUEST" } }));
              }
            });
            return;
          }

          // Route: GET /api/projects/:projectId/reveal
          if (url.includes("/reveal") && method === "GET") {
            const data = await this.viewStore!.read();
            res.writeHead(200);
            res.end(JSON.stringify({ data }));
            return;
          }

          // Route: PUT /api/projects/:projectId/reveal
          if (url.includes("/reveal") && method === "PUT") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", async () => {
              try {
                const { data } = JSON.parse(body);
                await this.viewStore!.write(data, "api");
                res.writeHead(200);
                res.end(JSON.stringify({ data }));
              } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: { code: "BAD_REQUEST" } }));
              }
            });
            return;
          }

          // Health check
          if (url === "/health") {
            res.writeHead(200);
            res.end(JSON.stringify({ status: "ok" }));
            return;
          }

          // 404 for unknown routes
          res.writeHead(404);
          res.end(JSON.stringify({ error: { code: "NOT_FOUND" } }));
        } catch (e) {
          res.writeHead(500);
          res.end(
            JSON.stringify({
              error: { code: "INTERNAL_ERROR", message: e instanceof Error ? e.message : "Unknown error" },
            }),
          );
        }
      });

      this.server.listen(0, () => {
        const address = this.server!.address();
        if (address && typeof address === "object") {
          this.port = address.port;
          resolve(this.port);
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

// HTTP client helpers
async function httpGet(port: number, path: string): Promise<{ status: number; body: unknown }> {
  const http = await import("http");
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path,
        method: "GET",
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: JSON.parse(body),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function httpPost(
  port: number,
  path: string,
  data: unknown,
): Promise<{ status: number; body: unknown }> {
  const http = await import("http");
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: JSON.parse(responseBody),
          });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function httpPut(
  port: number,
  path: string,
  data: unknown,
): Promise<{ status: number; body: unknown }> {
  const http = await import("http");
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path,
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: JSON.parse(responseBody),
          });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

describe("API Performance Benchmarks", () => {
  let server: MockApiServer;
  let tempDir: string;
  let port: number;
  const projectId = "perf-test-project";

  beforeAll(async () => {
    tempDir = join(tmpdir(), `api-perf-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    server = new MockApiServer();
    port = await server.start(tempDir, projectId);
  });

  afterAll(async () => {
    await server.stop();
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Single Request Latency", () => {
    it("GET /health - baseline", async () => {
      const result = await benchmarkAsync(
        "GET /health",
        1,
        THRESHOLDS.API_SINGLE_REQUEST,
        async () => {
          const res = await httpGet(port, "/health");
          expect(res.status).toBe(200);
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("GET /void/thoughts - empty store", async () => {
      const result = await benchmarkAsync(
        "GET /void/thoughts - empty",
        1,
        THRESHOLDS.API_SINGLE_REQUEST,
        async () => {
          const res = await httpGet(port, `/api/projects/${projectId}/void/thoughts`);
          expect(res.status).toBe(200);
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("POST /void/thoughts - single create", async () => {
      const result = await benchmarkAsync(
        "POST /void/thoughts - single",
        1,
        THRESHOLDS.API_SINGLE_REQUEST,
        async () => {
          const res = await httpPost(port, `/api/projects/${projectId}/void/thoughts`, {
            content: "Test thought",
            source: "text",
            capturedBy: "benchmark",
          });
          expect(res.status).toBe(201);
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });
  });

  describe("Paginated Requests", () => {
    beforeEach(async () => {
      // Populate store with 1000 thoughts
      const thoughts = Array.from({ length: 1000 }, (_, i) => generateThought(i));
      await httpPost(port, `/api/projects/${projectId}/void/thoughts/batch`, { thoughts });
    });

    it("GET /void/thoughts - page 1", async () => {
      const result = await benchmarkAsync(
        "GET /void/thoughts - page 1",
        50,
        THRESHOLDS.API_PAGINATED,
        async () => {
          const res = await httpGet(port, `/api/projects/${projectId}/void/thoughts?page=1&limit=50`);
          expect(res.status).toBe(200);
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("GET /void/thoughts - page 10", async () => {
      const result = await benchmarkAsync(
        "GET /void/thoughts - page 10",
        50,
        THRESHOLDS.API_PAGINATED,
        async () => {
          const res = await httpGet(port, `/api/projects/${projectId}/void/thoughts?page=10&limit=50`);
          expect(res.status).toBe(200);
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("GET /void/thoughts - large page size", async () => {
      const result = await benchmarkAsync(
        "GET /void/thoughts - limit 200",
        200,
        { warn: 200, fail: 500 },
        async () => {
          const res = await httpGet(port, `/api/projects/${projectId}/void/thoughts?page=1&limit=200`);
          expect(res.status).toBe(200);
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });
  });

  describe("Batch Operations", () => {
    it("POST /void/thoughts/batch - 100 thoughts", async () => {
      const thoughts = Array.from({ length: 100 }, (_, i) => generateThought(i));

      const result = await benchmarkAsync(
        "POST /void/thoughts/batch - 100",
        100,
        THRESHOLDS.API_BATCH_100,
        async () => {
          const res = await httpPost(port, `/api/projects/${projectId}/void/thoughts/batch`, {
            thoughts,
          });
          expect(res.status).toBe(201);
        },
      );

      result.requestsPerSecond = Math.round(100 / (result.durationMs / 1000));
      expect(result.status).not.toBe("fail");
      console.log(
        `[BENCH] ${result.name}: ${result.durationMs}ms (${result.requestsPerSecond} req/s, ${result.status})`,
      );
    });

    it("POST /void/thoughts/batch - 1K thoughts", async () => {
      const thoughts = Array.from({ length: 1000 }, (_, i) => generateThought(i));

      const result = await benchmarkAsync(
        "POST /void/thoughts/batch - 1K",
        1000,
        THRESHOLDS.API_BATCH_1K,
        async () => {
          const res = await httpPost(port, `/api/projects/${projectId}/void/thoughts/batch`, {
            thoughts,
          });
          expect(res.status).toBe(201);
        },
      );

      result.requestsPerSecond = Math.round(1000 / (result.durationMs / 1000));
      console.log(
        `[BENCH] ${result.name}: ${result.durationMs}ms (${result.requestsPerSecond} req/s, ${result.status})`,
      );
    });
  });

  describe("Concurrent Requests", () => {
    beforeEach(async () => {
      // Populate store with 100 thoughts for concurrent reads
      const thoughts = Array.from({ length: 100 }, (_, i) => generateThought(i));
      await httpPost(port, `/api/projects/${projectId}/void/thoughts/batch`, { thoughts });
    });

    it("10 concurrent GET requests", async () => {
      const concurrent = 10;
      const result = await benchmarkAsync(
        "10 concurrent GETs",
        concurrent,
        THRESHOLDS.API_CONCURRENT_10,
        async () => {
          const promises = Array.from({ length: concurrent }, () =>
            httpGet(port, `/api/projects/${projectId}/void/thoughts?page=1&limit=10`),
          );
          const responses = await Promise.all(promises);
          responses.forEach((r) => expect(r.status).toBe(200));
        },
      );

      result.requestsPerSecond = Math.round(concurrent / (result.durationMs / 1000));
      expect(result.status).not.toBe("fail");
      console.log(
        `[BENCH] ${result.name}: ${result.durationMs}ms (${result.requestsPerSecond} req/s, ${result.status})`,
      );
    });

    it("50 concurrent GET requests", async () => {
      const concurrent = 50;
      const result = await benchmarkAsync(
        "50 concurrent GETs",
        concurrent,
        THRESHOLDS.API_CONCURRENT_50,
        async () => {
          const promises = Array.from({ length: concurrent }, (_, i) =>
            httpGet(port, `/api/projects/${projectId}/void/thoughts?page=${(i % 10) + 1}&limit=10`),
          );
          const responses = await Promise.all(promises);
          responses.forEach((r) => expect(r.status).toBe(200));
        },
      );

      result.requestsPerSecond = Math.round(concurrent / (result.durationMs / 1000));
      console.log(
        `[BENCH] ${result.name}: ${result.durationMs}ms (${result.requestsPerSecond} req/s, ${result.status})`,
      );
    });

    it("10 concurrent POST requests", async () => {
      const concurrent = 10;
      const result = await benchmarkAsync(
        "10 concurrent POSTs",
        concurrent,
        THRESHOLDS.API_CONCURRENT_10,
        async () => {
          const promises = Array.from({ length: concurrent }, (_, i) =>
            httpPost(port, `/api/projects/${projectId}/void/thoughts`, {
              content: `Concurrent thought ${i}`,
              source: "text",
              capturedBy: "benchmark",
            }),
          );
          const responses = await Promise.all(promises);
          responses.forEach((r) => expect(r.status).toBe(201));
        },
      );

      result.requestsPerSecond = Math.round(concurrent / (result.durationMs / 1000));
      expect(result.status).not.toBe("fail");
      console.log(
        `[BENCH] ${result.name}: ${result.durationMs}ms (${result.requestsPerSecond} req/s, ${result.status})`,
      );
    });
  });

  describe("View Store API", () => {
    it("GET /reveal - read", async () => {
      const result = await benchmarkAsync(
        "GET /reveal",
        1,
        THRESHOLDS.API_SINGLE_REQUEST,
        async () => {
          const res = await httpGet(port, `/api/projects/${projectId}/reveal`);
          expect(res.status).toBe(200);
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });

    it("PUT /reveal - write", async () => {
      const data = {
        clusters: [
          { clusterId: "c1", name: "Test Cluster", thoughts: ["t1", "t2"] },
        ],
      };

      const result = await benchmarkAsync(
        "PUT /reveal",
        1,
        THRESHOLDS.API_SINGLE_REQUEST,
        async () => {
          const res = await httpPut(port, `/api/projects/${projectId}/reveal`, { data });
          expect(res.status).toBe(200);
        },
      );

      expect(result.status).not.toBe("fail");
      console.log(`[BENCH] ${result.name}: ${result.durationMs}ms (${result.status})`);
    });
  });
});

// Summary report
describe("API Performance Summary", () => {
  it("should print API benchmark summary", () => {
    console.log("\n" + "=".repeat(60));
    console.log("API PERFORMANCE BENCHMARK SUMMARY");
    console.log("=".repeat(60));

    if (results.length === 0) {
      console.log("No API benchmarks run yet.");
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
      const extra = r.requestsPerSecond ? ` (${r.requestsPerSecond} req/s)` : "";
      console.log(
        r.name.padEnd(40) +
          r.scale.toString().padStart(10) +
          `${r.durationMs}ms${extra}`.padStart(12) +
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

    expect(true).toBe(true);
  });
});
