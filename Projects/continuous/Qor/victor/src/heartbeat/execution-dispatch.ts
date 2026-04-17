import type { ForgeTask } from "./forge-queue";
import type {
  ExecutionEvent,
  ExecutionEventStore,
  ExecutionStatus,
} from "../kernel/memory/store";

export interface ExecutionIntent {
  taskId: string;
  phaseId: string;
  source: string;
  title: string;
  description: string;
  acceptance: string[];
  urgency: "low" | "medium" | "high";
}

export interface ExecutionRunner {
  run(intent: ExecutionIntent): Promise<ExecutionResult>;
}

export interface ExecutionResult {
  status: "completed" | "blocked" | "failed" | "quarantined";
  summary: string;
  testsPassed?: number;
  filesChanged?: string[];
  acceptanceMet?: string[];
  reason?: string;
}

export function isImplementationSource(source: string): boolean {
  return source.startsWith("forge:queue:") || source === "lifecycle:implement";
}

export function hasExecutionEvidence(result: ExecutionResult): boolean {
  return Boolean(
    result.filesChanged?.length
      || (result.testsPassed ?? 0) > 0
      || result.acceptanceMet?.length,
  );
}

function toUrgency(priority: number | undefined): ExecutionIntent["urgency"] {
  if ((priority ?? 99) <= 2) return "high";
  if ((priority ?? 99) <= 5) return "medium";
  return "low";
}

export function toExecutionIntent(task: ForgeTask): ExecutionIntent {
  return {
    taskId: task.taskId,
    phaseId: task.phaseId,
    source: `forge:queue:${task.phaseId}`,
    title: task.title,
    description: task.description,
    acceptance: task.acceptance ?? [],
    urgency: toUrgency(task.priority),
  };
}

export interface DispatchOptions {
  runner?: ExecutionRunner;
  executionEventStore?: ExecutionEventStore;
  agentId?: string;
  now?: () => number;
  rng?: () => string;
}

function makeEventId(rng?: () => string): string {
  if (rng) return rng();
  return `exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toExecutionEvent(
  intent: ExecutionIntent,
  result: ExecutionResult,
  agentId: string,
  now: () => number,
  rng?: () => string,
): ExecutionEvent {
  return {
    id: makeEventId(rng),
    agentId,
    partition: `agent-private:${agentId}`,
    taskId: intent.taskId,
    phaseId: intent.phaseId,
    source: intent.source,
    status: result.status as ExecutionStatus,
    timestamp: now(),
    summary: result.summary,
    testsPassed: result.testsPassed,
    filesChanged: result.filesChanged,
    acceptanceMet: (result.acceptanceMet?.length ?? 0) > 0,
    verdict: result.reason,
  };
}

async function emitExecutionEvent(
  store: ExecutionEventStore,
  event: ExecutionEvent,
): Promise<void> {
  try {
    await store.record(event);
  } catch (err) {
    // Fail-open: dispatch must succeed even if memory emit fails.
    console.warn("execution-dispatch: emit failed", (err as Error).message);
  }
}

function classify(intent: ExecutionIntent, runner?: ExecutionRunner): ExecutionResult | null {
  if (intent.source === "blockers") {
    return {
      status: "blocked",
      summary: "Blocker tasks require intervention before execution.",
      reason: intent.description,
    };
  }
  if (isImplementationSource(intent.source) && !runner) {
    return {
      status: "blocked",
      summary: `Execution blocked: no implementation runner is wired for ${intent.source}.`,
      reason: "execution_runner_missing",
    };
  }
  if (intent.source.startsWith("lifecycle:") && !isImplementationSource(intent.source)) {
    return {
      status: "blocked",
      summary: `Lifecycle task requires explicit operator execution: ${intent.title}`,
      reason: "operator_execution_required",
    };
  }
  if (!isImplementationSource(intent.source) && intent.source !== "blockers") {
    return {
      status: "quarantined",
      summary: `Unknown task source: ${intent.source}`,
      reason: "unknown_task_kind",
    };
  }
  return null;
}

async function runImplementation(
  intent: ExecutionIntent,
  runner: ExecutionRunner,
): Promise<ExecutionResult> {
  const result = await runner.run(intent);
  if (result.status === "completed" && !hasExecutionEvidence(result)) {
    return {
      status: "quarantined",
      summary: `Execution quarantined: implementation runner returned completed without evidence for ${intent.source}.`,
      reason: "execution_evidence_missing",
    };
  }
  return result;
}

export async function dispatchExecution(
  intent: ExecutionIntent,
  runnerOrOptions?: ExecutionRunner | DispatchOptions,
): Promise<ExecutionResult> {
  const opts: DispatchOptions = typeof runnerOrOptions === "function"
    || (runnerOrOptions && "run" in runnerOrOptions)
    ? { runner: runnerOrOptions as ExecutionRunner }
    : (runnerOrOptions as DispatchOptions | undefined) ?? {};

  const early = classify(intent, opts.runner);
  const result = early ?? await runImplementation(intent, opts.runner!);

  if (opts.executionEventStore) {
    const event = toExecutionEvent(
      intent,
      result,
      opts.agentId ?? "victor",
      opts.now ?? (() => Date.now()),
      opts.rng,
    );
    await emitExecutionEvent(opts.executionEventStore, event);
  }

  return result;
}
