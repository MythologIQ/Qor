import { describe, it, expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { runHeartbeatTick } from "../src/heartbeat/runtime";

const TMP_DIR = "/tmp/victor-forge-e2e";
const PHASES_PATH = `${TMP_DIR}/phases.json`;
const STATE_PATH = `${TMP_DIR}/heartbeat-state.json`;

describe("forge writeback e2e", () => {
  it("claims and completes a forge task through the runtime path", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(PHASES_PATH, JSON.stringify({
      phases: [
        {
          phaseId: "p1",
          name: "Phase One",
          objective: "obj",
          ordinal: 1,
          status: "active",
          tasks: [
            { taskId: "t1", phaseId: "p1", title: "Task", description: "desc", status: "pending", priority: 1 },
          ],
        },
      ],
    }));

    const calls: Array<{ url: string; body: any }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any, opts: any) => {
      calls.push({ url: String(url), body: JSON.parse(opts.body) });
      if (String(url).includes("record-evidence")) {
        return new Response(JSON.stringify({ entryId: "ev-1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const result = await runHeartbeatTick({
      tier: 2,
      mode: "execute",
      cadence: 30,
      phase: { objective: "obj", name: "phase", status: "active" },
      progress: { completed: 0, total: 1 },
      blockers: [],
      forgeQueuePath: PHASES_PATH,
      heartbeatStatePath: STATE_PATH,
      writeBackConfig: {
        forgeApiBase: "http://localhost:3099",
        forgeApiKey: "test-key",
        agentId: "victor",
      },
    });

    expect(result.status).toBe("EXECUTED");
    expect(result.executionStatus).toBe("completed");
    expect(calls.some((call) => call.url.includes("/api/forge/update-task") && call.body.newStatus === "active")).toBe(true);
    expect(calls.some((call) => call.url.includes("/api/forge/update-task") && call.body.newStatus === "done")).toBe(true);
    expect(calls.some((call) => call.url.includes("/api/forge/record-evidence"))).toBe(true);
    const saved = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
    expect(saved.lastCompletedTaskId).toBe("t1");

    globalThis.fetch = originalFetch;
    rmSync(TMP_DIR, { recursive: true, force: true });
  });
});
