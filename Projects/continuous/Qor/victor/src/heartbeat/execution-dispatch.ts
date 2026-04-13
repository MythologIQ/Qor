import type { ForgeTask } from "./forge-queue";

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

export async function dispatchExecution(
  intent: ExecutionIntent,
  runner?: ExecutionRunner,
): Promise<ExecutionResult> {
  if (intent.source === "blockers") {
    return {
      status: "blocked",
      summary: "Blocker tasks require intervention before execution.",
      reason: intent.description,
    };
  }

  if (isImplementationSource(intent.source)) {
    if (!runner) {
      return {
        status: "blocked",
        summary: `Execution blocked: no implementation runner is wired for ${intent.source}.`,
        reason: "execution_runner_missing",
      };
    }

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

  if (intent.source.startsWith("lifecycle:")) {
    return {
      status: "blocked",
      summary: `Lifecycle task requires explicit operator execution: ${intent.title}`,
      reason: "operator_execution_required",
    };
  }

  return {
    status: "quarantined",
    summary: `Unknown task source: ${intent.source}`,
    reason: "unknown_task_kind",
  };
}
