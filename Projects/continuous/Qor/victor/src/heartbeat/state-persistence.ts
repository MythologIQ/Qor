import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { HeartbeatRecord, HeartbeatRecordStatus } from "./types";

export interface HeartbeatPersistentState {
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  consecutiveBlocked: number;
  totalTicks: number;
  lastTickTimestamp: string | null;
  lastTickStatus: HeartbeatRecordStatus | null;
  lastClaimedTaskId: string | null;
  lastCompletedTaskId: string | null;
}

export const DEFAULT_HEARTBEAT_STATE: HeartbeatPersistentState = {
  consecutiveSuccesses: 0,
  consecutiveFailures: 0,
  consecutiveBlocked: 0,
  totalTicks: 0,
  lastTickTimestamp: null,
  lastTickStatus: null,
  lastClaimedTaskId: null,
  lastCompletedTaskId: null,
};

export function loadHeartbeatState(path: string): HeartbeatPersistentState {
  try {
    if (!existsSync(path)) return { ...DEFAULT_HEARTBEAT_STATE };
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return {
      ...DEFAULT_HEARTBEAT_STATE,
      ...raw,
    };
  } catch {
    return { ...DEFAULT_HEARTBEAT_STATE };
  }
}

export function saveHeartbeatState(
  path: string,
  state: HeartbeatPersistentState,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function loadHeartbeatRecord(path: string): HeartbeatRecord | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as HeartbeatRecord;
  } catch {
    return null;
  }
}

export function saveHeartbeatRecord(path: string, record: HeartbeatRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2));
}

export function applyHeartbeatOutcome(
  state: HeartbeatPersistentState,
  outcome: HeartbeatRecordStatus,
  tickTimestamp: string,
  taskId?: string | null,
): HeartbeatPersistentState {
  const next: HeartbeatPersistentState = {
    ...state,
    totalTicks: state.totalTicks + 1,
    lastTickTimestamp: tickTimestamp,
    lastTickStatus: outcome,
  };

  if (outcome === "completed") {
    next.consecutiveSuccesses += 1;
    next.consecutiveFailures = 0;
    next.consecutiveBlocked = 0;
    next.lastCompletedTaskId = taskId ?? state.lastCompletedTaskId;
    return next;
  }

  next.consecutiveSuccesses = 0;
  if (outcome === "blocked") {
    next.consecutiveFailures = 0;
    next.consecutiveBlocked += 1;
    return next;
  }
  if (outcome === "failed" || outcome === "quarantined") {
    next.consecutiveFailures += 1;
    next.consecutiveBlocked = 0;
    return next;
  }

  next.consecutiveFailures = 0;
  next.consecutiveBlocked = 0;
  return next;
}
