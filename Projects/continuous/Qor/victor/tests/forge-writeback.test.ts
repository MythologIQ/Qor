import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import {
  loadForgeApiKey,
  claimTask,
  completeTask,
  blockTask,
  buildTaskEvidence,
  type WriteBackConfig,
} from "../src/heartbeat/forge-writeback";

const TMP_DIR = "/tmp/forge-writeback-test";

const testConfig: WriteBackConfig = {
  forgeApiBase: "http://localhost:19999",
  forgeApiKey: "test-key-abc",
  agentId: "victor",
};

beforeEach(() => mkdirSync(TMP_DIR, { recursive: true }));
afterEach(() => rmSync(TMP_DIR, { recursive: true, force: true }));

describe("loadForgeApiKey", () => {
  it("reads key from file", () => {
    const keyPath = `${TMP_DIR}/api_key`;
    writeFileSync(keyPath, "my-secret-key\n");
    expect(loadForgeApiKey(keyPath)).toBe("my-secret-key");
  });

  it("returns null for missing file", () => {
    expect(loadForgeApiKey("/nonexistent/key")).toBeNull();
  });
});

describe("buildTaskEvidence", () => {
  it("constructs correct evidence shape", () => {
    const ev = buildTaskEvidence("task_1", "phase_1", "victor", {
      testsPassed: 5,
      filesChanged: ["a.ts", "b.ts"],
      acceptanceMet: ["AC1", "AC2"],
    });
    expect(ev.kind).toBe("CapabilityReceipt");
    expect(ev.payload.taskId).toBe("task_1");
    expect(ev.payload.phaseId).toBe("phase_1");
    expect(ev.payload.actor).toBe("victor");
    expect(ev.payload.action).toBe("task-completion");
    expect(ev.payload.testsPassed).toBe(5);
    expect(ev.payload.filesChanged).toEqual(["a.ts", "b.ts"]);
    expect(ev.payload.acceptanceMet).toEqual(["AC1", "AC2"]);
  });

  it("handles missing optional fields", () => {
    const ev = buildTaskEvidence("task_2", "phase_2", "victor", {});
    expect(ev.payload.testsPassed).toBeUndefined();
    expect(ev.payload.filesChanged).toBeUndefined();
  });

  it("includes sessionId", () => {
    const ev = buildTaskEvidence("task_3", "phase_3", "victor", {});
    expect(ev.sessionId).toMatch(/^session-/);
  });
});

describe("claimTask", () => {
  it("sends correct payload structure", async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const result = await claimTask(testConfig, "task_abc");
    expect(result).toBe(true);
    expect(capturedBody.taskId).toBe("task_abc");
    expect(capturedBody.newStatus).toBe("active");

    globalThis.fetch = originalFetch;
  });

  it("returns false on HTTP error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("err", { status: 500 });

    const result = await claimTask(testConfig, "task_abc");
    expect(result).toBe(false);

    globalThis.fetch = originalFetch;
  });
});

describe("completeTask", () => {
  it("returns receipt with provenanceHash", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      if (String(url).includes("record-evidence")) {
        return new Response(JSON.stringify({ entryId: "ev_123" }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const evidence = buildTaskEvidence("task_1", "phase_1", "victor", {});
    const receipt = await completeTask(testConfig, "task_1", "phase_1", evidence);

    expect(receipt.taskId).toBe("task_1");
    expect(receipt.phaseId).toBe("phase_1");
    expect(receipt.status).toBe("done");
    expect(receipt.evidenceId).toBe("ev_123");
    expect(receipt.provenanceHash).toBeDefined();
    expect(receipt.timestamp).toBeDefined();

    globalThis.fetch = originalFetch;
  });

  it("throws on update-task failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("err", { status: 500 });

    const evidence = buildTaskEvidence("task_1", "phase_1", "victor", {});
    await expect(
      completeTask(testConfig, "task_1", "phase_1", evidence)
    ).rejects.toThrow("update-task failed");

    globalThis.fetch = originalFetch;
  });
});

describe("blockTask", () => {
  it("returns blocked receipt", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 });

    const receipt = await blockTask(testConfig, "task_1", "phase_1", "dependency missing");
    expect(receipt.status).toBe("blocked");
    expect(receipt.taskId).toBe("task_1");
    expect(receipt.provenanceHash).toBeDefined();

    globalThis.fetch = originalFetch;
  });
});
