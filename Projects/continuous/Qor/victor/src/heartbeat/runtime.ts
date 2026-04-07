import {
  applyHeartbeatOutcome,
  loadHeartbeatState,
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

const DEFAULT_HEARTBEAT_STATE_PATH =
  "/home/workspace/Projects/continuous/Qor/.qore/projects/victor-resident/heartbeat-state.json";
const DEFAULT_FORGE_SECRET_PATH =
  "/home/workspace/Projects/continuous/Qor/forge/.secrets/api_key";
const DEFAULT_FORGE_API_BASE = "http://localhost:3099";

export interface RuntimeAgentContext extends AgentContext {
  heartbeatStatePath?: string;
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
  outcome: HeartbeatPersistentState["lastTickStatus"],
  taskId?: string | null,
): HeartbeatPersistentState {
  const now = new Date().toISOString();
  const prior = loadHeartbeatState(path);
  const next = applyHeartbeatOutcome(prior, outcome, now, taskId);
  saveHeartbeatState(path, next);
  return next;
}

export async function runHeartbeatTick(
  ctx: RuntimeAgentContext,
): Promise<HeartbeatResult> {
  const queue = readForgeQueue(ctx.forgeQueuePath ?? DEFAULT_FORGE_QUEUE_PATH);
  const statePath = ctx.heartbeatStatePath ?? DEFAULT_HEARTBEAT_STATE_PATH;

  if (!queue.task) {
    const fallback = await handleEmptyQueue(ctx);
    const status = fallback.status === "QUARANTINE" ? "quarantined" : null;
    if (status) persistOutcome(statePath, status);
    return fallback;
  }

  const writeBack = resolveWriteBackConfig(ctx);
  if (!writeBack) {
    persistOutcome(statePath, "quarantined");
    return { status: "QUARANTINE", error: "missing_writeback_config" };
  }

  const task = forgeTaskToTask(queue.task);
  const claimed = await claimTask(writeBack, queue.task.taskId);
  if (!claimed) {
    persistOutcome(statePath, "quarantined", queue.task.taskId);
    return { status: "QUARANTINE", error: "claim_failed", tasks: [task] };
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
    persistOutcome(statePath, "completed", queue.task.taskId);
    return buildExecutedResult(task, result.status, receipt);
  }

  if (result.status === "blocked") {
    const receipt = await blockTask(
      writeBack,
      queue.task.taskId,
      queue.task.phaseId,
      result.reason ?? result.summary,
    );
    persistOutcome(statePath, "blocked", queue.task.taskId);
    return buildExecutedResult(task, result.status, receipt);
  }

  persistOutcome(statePath, result.status === "failed" ? "failed" : "quarantined", queue.task.taskId);
  return {
    status: "QUARANTINE",
    error: result.reason ?? result.summary,
    tasks: [task],
    executionStatus: result.status,
  };
}
