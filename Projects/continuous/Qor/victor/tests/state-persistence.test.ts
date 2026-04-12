import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import {
  applyHeartbeatOutcome,
  loadHeartbeatState,
  loadHeartbeatRecord,
  saveHeartbeatRecord,
  saveHeartbeatState,
} from "../src/heartbeat/state-persistence";
import type { HeartbeatRecord } from "../src/heartbeat/types";

const TMP_DIR = "/tmp/victor-heartbeat-state-test";
const STATE_PATH = `${TMP_DIR}/state.json`;
const RECORD_PATH = `${TMP_DIR}/heartbeat-records/tick-1.json`;

beforeEach(() => mkdirSync(TMP_DIR, { recursive: true }));
afterEach(() => rmSync(TMP_DIR, { recursive: true, force: true }));

describe("state persistence", () => {
  it("initializes defaults when file is missing", () => {
    const state = loadHeartbeatState(STATE_PATH);
    expect(state.totalTicks).toBe(0);
    expect(state.lastTickStatus).toBeNull();
  });

  it("persists and reloads saved state", () => {
    saveHeartbeatState(STATE_PATH, {
      consecutiveSuccesses: 2,
      consecutiveFailures: 0,
      consecutiveBlocked: 0,
      totalTicks: 2,
      lastTickTimestamp: "2026-04-07T00:00:00Z",
      lastTickStatus: "completed",
      lastClaimedTaskId: "t1",
      lastCompletedTaskId: "t1",
    });
    const reloaded = loadHeartbeatState(STATE_PATH);
    expect(reloaded.consecutiveSuccesses).toBe(2);
    expect(reloaded.lastCompletedTaskId).toBe("t1");
  });

  it("increments success streak on completed", () => {
    const next = applyHeartbeatOutcome(loadHeartbeatState(STATE_PATH), "completed", "2026-04-07T00:00:00Z", "t1");
    expect(next.consecutiveSuccesses).toBe(1);
    expect(next.consecutiveFailures).toBe(0);
  });

  it("increments blocked streak and resets success", () => {
    const prior = applyHeartbeatOutcome(loadHeartbeatState(STATE_PATH), "completed", "2026-04-07T00:00:00Z", "t1");
    const next = applyHeartbeatOutcome(prior, "blocked", "2026-04-07T00:01:00Z", "t2");
    expect(next.consecutiveSuccesses).toBe(0);
    expect(next.consecutiveBlocked).toBe(1);
  });

  it("increments failure streak on failed", () => {
    const next = applyHeartbeatOutcome(loadHeartbeatState(STATE_PATH), "failed", "2026-04-07T00:00:00Z", "t1");
    expect(next.consecutiveFailures).toBe(1);
  });

  it("treats no-op as non-successful but non-failing", () => {
    const prior = applyHeartbeatOutcome(loadHeartbeatState(STATE_PATH), "failed", "2026-04-07T00:00:00Z", "t1");
    const next = applyHeartbeatOutcome(prior, "no-op", "2026-04-07T00:01:00Z");
    expect(next.consecutiveSuccesses).toBe(0);
    expect(next.consecutiveFailures).toBe(0);
    expect(next.consecutiveBlocked).toBe(0);
    expect(next.lastTickStatus).toBe("no-op");
  });

  it("persists and reloads heartbeat records", () => {
    const record: HeartbeatRecord = {
      tickId: "tick-1",
      sessionId: "tick-1",
      startedAt: "2026-04-07T00:00:00Z",
      finishedAt: "2026-04-07T00:00:01Z",
      status: "no-op",
      branchHistory: ["observed", "persisted"],
      claimedTaskId: null,
      summary: "Observation completed without execution.",
      evidence: [{ kind: "project-scan", target: "forge-queue", status: "success", artifact: null }],
    };
    saveHeartbeatRecord(RECORD_PATH, record);
    expect(loadHeartbeatRecord(RECORD_PATH)).toEqual(record);
  });
});
