import {
  applyHeartbeatOutcome,
  loadHeartbeatState,
  saveHeartbeatRecord,
  saveHeartbeatState,
  type HeartbeatPersistentState,
} from "./state-persistence";
import { readForgeQueue } from "./forge-queue";
import {
  buildTaskEvidence,
  claimTask,
  completeTask,
  loadForgeApiKey,
  blockTask,
  type CompletionReceipt,
  type WriteBackConfig,
} from "./forge-writeback";
import { dispatchExecution, toExecutionIntent } from "./execution-dispatch";
import {
  DEFAULT_FORGE_QUEUE_PATH,
  type AgentContext,
  type HeartbeatResult,
  type Task,
  forgeTaskToTask,
  handleEmptyQueue,
} from "./mod";
import type {
  HeartbeatBranch,
  HeartbeatEvidenceRef,
  HeartbeatRecord,
  HeartbeatRecordStatus,
} from "./types";

const DEFAULT_HEARTBEAT_STATE_PATH =
  "/home/workspace/Projects/continuous/Qor/.qore/projects/victor-resident/heartbeat-state.json";
const DEFAULT_HEARTBEAT_RECORDS_DIR =
  "/home/workspace/Projects/continuous/Qor/.qore/projects/victor-resident/heartbeat-records";
const DEFAULT_FORGE_SECRET_PATH =
  "/home/workspace/Projects/continuous/Qor/forge/.secrets/api_key";
const DEFAULT_FORGE_API_BASE = "http://localhost:3099";

export interface RuntimeAgentContext extends AgentContext {
  heartbeatStatePath?: string;
  heartbeatRecordsDir?: string;
  writeBackConfig?: WriteBackConfig;
  forgeApiKeyPath?: string;
}

export function resolveWriteBackConfig(
  ctx: RuntimeAgentContext,
): WriteBackConfig | null {
  if (ctx.writeBackConfig) return ctx.writeBackConfig;
  const forgeApiKey = loadForgeApiKey(ctx.forgeApiKeyPath ?? DEFAULT_FORGE_SECRET_PATH);
  if (!forgeApiKey) return null;
  return {
    forgeApiBase: DEFAULT_FORGE_API_BASE,
    forgeApiKey,
    agentId: "victor",
  };
}

function buildExecutedResult(
  task: Task,
  executionStatus: string,
  receipt?: CompletionReceipt,
): HeartbeatResult {
  return {
    status: "EXECUTED",
    tasks: [task],
    provenanceHash: receipt?.provenanceHash,
    executionStatus,
  };
}

function persistOutcome(
  path: string,
  outcome: HeartbeatRecordStatus,
  taskId?: string | null,
): HeartbeatPersistentState {
  const now = new Date().toISOString();
  const prior = loadHeartbeatState(path);
  const next = applyHeartbeatOutcome(prior, outcome, now, taskId);
  saveHeartbeatState(path, next);
  return next;
}

function createTickId(): string {
  return `tick-${Date.now()}`;
}

function buildRecordPath(recordsDir: string, tickId: string): string {
  return `${recordsDir}/${tickId}.json`;
}

function persistRecord(
  recordsDir: string,
  record: HeartbeatRecord,
): string {
  const recordPath = buildRecordPath(recordsDir, record.tickId);
  const sealedRecord: HeartbeatRecord = {
    ...record,
    branchHistory: record.branchHistory.includes("persisted")
      ? record.branchHistory
      : [...record.branchHistory, "persisted"],
  };
  saveHeartbeatRecord(recordPath, sealedRecord);
  return recordPath;
}

function finalizeTick(
  statePath: string,
  recordsDir: string,
  result: HeartbeatResult,
  status: HeartbeatRecordStatus,
  startedAt: string,
  branchHistory: HeartbeatBranch[],
  summary: string,
  evidence: HeartbeatEvidenceRef[],
  taskId?: string | null,
): HeartbeatResult {
  const tickId = createTickId();
  const recordPath = persistRecord(recordsDir, {
    tickId,
    sessionId: tickId,
    startedAt,
    finishedAt: new Date().toISOString(),
    status,
    branchHistory,
    claimedTaskId: taskId ?? null,
    summary,
    evidence,
  });
  persistOutcome(statePath, status, taskId);
  return {
    ...result,
    executionStatus: result.executionStatus ?? status,
    heartbeatStatus: status,
    heartbeatRecordPath: recordPath,
  };
}

export async function runHeartbeatTick(
  ctx: RuntimeAgentContext,
): Promise<HeartbeatResult> {
  const queue = readForgeQueue(ctx.forgeQueuePath ?? DEFAULT_FORGE_QUEUE_PATH);
  const statePath = ctx.heartbeatStatePath ?? DEFAULT_HEARTBEAT_STATE_PATH;
  const recordsDir = ctx.heartbeatRecordsDir ?? DEFAULT_HEARTBEAT_RECORDS_DIR;
  const startedAt = new Date().toISOString();

  if (!queue.task) {
    const fallback = await handleEmptyQueue(ctx);
    if (fallback.status === "QUARANTINE") {
      return finalizeTick(
        statePath,
        recordsDir,
        fallback,
        "quarantined",
        startedAt,
        ["observed", "quarantined"],
        fallback.error ?? "Heartbeat quarantined after empty-queue derivation failure.",
        [{ kind: "project-scan", target: "forge-queue", status: "failure", artifact: null }],
      );
    }

    if (fallback.status === "USER_PROMPT") {
      return finalizeTick(
        statePath,
        recordsDir,
        fallback,
        "blocked",
        startedAt,
        ["observed", "blocked"],
        "Heartbeat blocked: no eligible work and autonomy level requires user input.",
        [{ kind: "project-scan", target: "forge-queue", status: "success", artifact: null }],
      );
    }

    return finalizeTick(
      statePath,
      recordsDir,
      fallback,
      "no-op",
      startedAt,
      ["observed"],
      "Heartbeat observed state and derived follow-up work, but no governed claim or remediation occurred.",
      [{ kind: "project-scan", target: "forge-queue", status: "success", artifact: null }],
    );
  }

  const writeBack = resolveWriteBackConfig(ctx);
  if (!writeBack) {
    return finalizeTick(
      statePath,
      recordsDir,
      { status: "QUARANTINE", error: "missing_writeback_config" },
      "quarantined",
      startedAt,
      ["observed", "quarantined"],
      "Heartbeat quarantined: missing Forge write-back configuration.",
      [{ kind: "task-writeback", target: "writeback-config", status: "missing", artifact: null }],
    );
  }

  const task = forgeTaskToTask(queue.task);
  const claimed = await claimTask(writeBack, queue.task.taskId);
  if (!claimed) {
    return finalizeTick(
      statePath,
      recordsDir,
      { status: "QUARANTINE", error: "claim_failed", tasks: [task] },
      "quarantined",
      startedAt,
      ["observed", "claimed", "quarantined"],
      `Heartbeat quarantined: failed to claim task ${queue.task.taskId}.`,
      [{ kind: "task-writeback", target: queue.task.taskId, status: "failure", artifact: null }],
      queue.task.taskId,
    );
  }

  const claimedState = loadHeartbeatState(statePath);
  saveHeartbeatState(statePath, { ...claimedState, lastClaimedTaskId: queue.task.taskId });

  const result = await dispatchExecution(toExecutionIntent(queue.task));
  if (result.status === "completed") {
    const evidence = buildTaskEvidence(queue.task.taskId, queue.task.phaseId, writeBack.agentId, {
      testsPassed: result.testsPassed,
      filesChanged: result.filesChanged,
      acceptanceMet: result.acceptanceMet,
    });
    const receipt = await completeTask(writeBack, queue.task.taskId, queue.task.phaseId, evidence);
    return finalizeTick(
      statePath,
      recordsDir,
      buildExecutedResult(task, result.status, receipt),
      "completed",
      startedAt,
      ["observed", "claimed", "executed"],
      result.summary,
      [{
        kind: "task-writeback",
        target: queue.task.taskId,
        status: receipt ? "success" : "missing",
        artifact: receipt?.provenanceHash ?? null,
      }],
      queue.task.taskId,
    );
  }

  if (result.status === "blocked") {
    const receipt = await blockTask(
      writeBack,
      queue.task.taskId,
      queue.task.phaseId,
      result.reason ?? result.summary,
    );
    return finalizeTick(
      statePath,
      recordsDir,
      buildExecutedResult(task, result.status, receipt),
      "blocked",
      startedAt,
      ["observed", "claimed", "blocked"],
      result.summary,
      [{
        kind: "task-writeback",
        target: queue.task.taskId,
        status: receipt ? "success" : "missing",
        artifact: receipt?.provenanceHash ?? null,
      }],
      queue.task.taskId,
    );
  }

  return finalizeTick(
    statePath,
    recordsDir,
    {
      status: "QUARANTINE",
      error: result.reason ?? result.summary,
      tasks: [task],
      executionStatus: result.status,
    },
    result.status === "failed" ? "failed" : "quarantined",
    startedAt,
    ["observed", "claimed", result.status === "failed" ? "failed" : "quarantined"],
    result.summary,
    [{ kind: "task-writeback", target: queue.task.taskId, status: "failure", artifact: null }],
    queue.task.taskId,
  );
}
