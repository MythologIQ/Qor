import { describe, it, expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { runHeartbeatTick } from "../src/heartbeat/runtime";

const TMP_DIR = "/tmp/victor-forge-e2e";
const PHASES_PATH = `${TMP_DIR}/phases.json`;
const STATE_PATH = `${TMP_DIR}/heartbeat-state.json`;
const RUNNER_TMP = `${TMP_DIR}/runner-workdir`;

describe("forge writeback e2e", () => {
  it("blocks a claimed forge task when no execution runner is wired", async () => {
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
            { taskId: "t1", phaseId: "p1", title: "Task", description: "desc", acceptance: [], status: "pending", priority: 1 },
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
    expect(result.executionStatus).toBe("blocked");
    expect(calls.some((call) => call.url.includes("/api/forge/update-task") && call.body.newStatus === "active")).toBe(true);
    expect(calls.some((call) => call.url.includes("/api/forge/update-task") && call.body.newStatus === "blocked")).toBe(true);
    expect(calls.some((call) => call.url.includes("/api/forge/update-task") && call.body.newStatus === "done")).toBe(false);
    expect(calls.some((call) => call.url.includes("/api/forge/record-evidence"))).toBe(false);
    const saved = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
    expect(saved.lastCompletedTaskId).toBeNull();
    expect(saved.lastClaimedTaskId).toBe("t1");

    globalThis.fetch = originalFetch;
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("claims and completes a forge task through the default directive runner", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    mkdirSync(RUNNER_TMP, { recursive: true });
    writeFileSync(PHASES_PATH, JSON.stringify({
      phases: [
        {
          phaseId: "p1",
          name: "Phase One",
          objective: "obj",
          ordinal: 1,
          status: "active",
          tasks: [
            {
              taskId: "t1",
              phaseId: "p1",
              title: "Task",
              description: [
                `WORKDIR: ${RUNNER_TMP}`,
                "RUN: printf 'export const runtime = 1;\\n' > runtime-generated.ts",
                "TEST: test -f runtime-generated.ts",
                "EXPECT-FILE: runtime-generated.ts",
              ].join("\n"),
              acceptance: ["AC1"],
              status: "pending",
              priority: 1,
            },
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
    expect(readFileSync(`${RUNNER_TMP}/runtime-generated.ts`, "utf-8")).toContain("runtime");

    globalThis.fetch = originalFetch;
    rmSync(TMP_DIR, { recursive: true, force: true });
  });
});
