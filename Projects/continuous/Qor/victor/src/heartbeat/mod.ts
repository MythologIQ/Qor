/**
 * QoreLogic Heartbeat Module
 * Deterministic automation for agent autonomy
 */

import { readForgeQueue, type ForgeTask } from "./forge-queue";

const DEFAULT_FORGE_QUEUE_PATH =
  "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/path/phases.json";

export enum AutonomyLevel {
  NONE = 0,
  SUGGEST = 1,
  ASSISTED = 2,
  FULL = 3,
  DELEGATED = 4,
}

export type AgentMode = "idle" | "review" | "execute" | "govern";

export type LifecycleStage =
  | "needs_plan"
  | "needs_audit"
  | "needs_implement"
  | "needs_substantiate"
  | "needs_debug"
  | "complete";

export interface PhaseContext {
  objective: string;
  name: string;
  status: string;
  lifecycle?: LifecycleStage;
  hasPlan?: boolean;
  hasAudit?: boolean;
  hasImplementation?: boolean;
  hasSeal?: boolean;
  lastError?: string;
}

export interface AgentContext {
  tier: number;
  mode: AgentMode;
  cadence: number;
  phase: PhaseContext;
  progress: { completed: number; total: number };
  blockers: string[];
  forgeQueuePath?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  urgency: "low" | "medium" | "high";
  source: string;
}

export interface HeartbeatResult {
  status: "EXECUTED" | "AUTO_DERIVED" | "QUARANTINE" | "USER_PROMPT";
  tasks?: Task[];
  provenanceHash?: string;
  error?: string;
}

export async function heartbeat(ctx: AgentContext): Promise<HeartbeatResult> {
  return handleEmptyQueue(ctx);
}

export async function handleEmptyQueue(
  ctx: AgentContext
): Promise<HeartbeatResult> {
  const autonomy = deriveAutonomy(ctx);

  if (autonomy >= AutonomyLevel.ASSISTED) {
    const selfDerived = await deriveTasksFromContext(ctx);

    if (selfDerived.tasks.length > 0) {
      return {
        status: "AUTO_DERIVED",
        tasks: selfDerived.tasks,
        provenanceHash: selfDerived.provenanceHash,
      };
    }

    return {
      status: "QUARANTINE",
      error: "derivation_failed",
    };
  }

  return { status: "USER_PROMPT" };
}

export function deriveAutonomy(ctx: AgentContext): AutonomyLevel {
  const unattended = ctx.cadence >= 10;
  if (unattended && ctx.mode === "execute" && ctx.tier === 2) {
    return AutonomyLevel.FULL;
  }

  switch (ctx.tier) {
    case 1:
      return AutonomyLevel.SUGGEST;
    case 2:
      return AutonomyLevel.ASSISTED;
    case 3:
      return AutonomyLevel.FULL;
    case 4:
      return AutonomyLevel.DELEGATED;
    default:
      return AutonomyLevel.NONE;
  }
}

export function inferLifecycleStage(phase: PhaseContext): LifecycleStage {
  if (phase.lifecycle) return phase.lifecycle;
  if (phase.lastError) return "needs_debug";
  if (!phase.hasPlan) return "needs_plan";
  if (!phase.hasAudit) return "needs_audit";
  if (!phase.hasImplementation) return "needs_implement";
  if (!phase.hasSeal) return "needs_substantiate";
  return "complete";
}

const LIFECYCLE_TASKS: Record<LifecycleStage, (phase: PhaseContext) => Task | null> = {
  needs_plan: (p) => ({
    id: crypto.randomUUID(),
    title: `Create plan for: ${p.name}`,
    description: `Run /qor-plan to produce a blueprint for "${p.objective}"`,
    urgency: "high",
    source: "lifecycle:plan",
  }),
  needs_audit: (p) => ({
    id: crypto.randomUUID(),
    title: `Audit plan for: ${p.name}`,
    description: `Run /qor-audit to validate the blueprint against Section 4 Razor and security checks`,
    urgency: "high",
    source: "lifecycle:audit",
  }),
  needs_implement: (p) => ({
    id: crypto.randomUUID(),
    title: `Implement: ${p.name}`,
    description: `Run /qor-implement to build the approved blueprint with tests`,
    urgency: "high",
    source: "lifecycle:implement",
  }),
  needs_substantiate: (p) => ({
    id: crypto.randomUUID(),
    title: `Substantiate: ${p.name}`,
    description: `Run /qor-substantiate to verify Reality = Promise and seal the session`,
    urgency: "medium",
    source: "lifecycle:substantiate",
  }),
  needs_debug: (p) => ({
    id: crypto.randomUUID(),
    title: `Debug failure in: ${p.name}`,
    description: `Investigate error: ${p.lastError ?? "unknown"}. Fix and re-enter lifecycle.`,
    urgency: "high",
    source: "lifecycle:debug",
  }),
  complete: () => null,
};

export function forgeTaskToTask(ft: ForgeTask): Task {
  const urgency: Task["urgency"] =
    ft.priority <= 2 ? "high" : ft.priority <= 5 ? "medium" : "low";
  return {
    id: ft.taskId,
    title: ft.title,
    description: ft.description,
    urgency,
    source: `forge:queue:${ft.phaseId}`,
  };
}

export async function deriveTasksFromContext(ctx: AgentContext) {
  const tasks: Task[] = [];

  const forgeQueue = readForgeQueue(
    ctx.forgeQueuePath ?? DEFAULT_FORGE_QUEUE_PATH
  );
  if (forgeQueue.task) {
    tasks.push(forgeTaskToTask(forgeQueue.task));
  }

  if (tasks.length === 0) {
    const stage = inferLifecycleStage(ctx.phase);
    const lifecycleTask = LIFECYCLE_TASKS[stage](ctx.phase);
    if (lifecycleTask) tasks.push(lifecycleTask);
  }

  if (ctx.blockers.length > 0) {
    tasks.push({
      id: crypto.randomUUID(),
      title: "Resolve blockers",
      description: ctx.blockers.join(", "),
      urgency: "high",
      source: "blockers",
    });
  }

  const sources = tasks.some((t) => t.source.startsWith("forge:"))
    ? ["forge_queue", "phase_objective"]
    : ["lifecycle_stage", "phase_objective"];
  const obj = ctx.phase.objective;
  return {
    tasks,
    provenanceHash: hashData(sources[0] + obj + ctx.blockers.join("")),
    confidence: tasks.length > 0 ? 0.9 : 0.0,
    sources,
  };
}

function hashData(data: string): string {
  return Array.from(data).reduce((hash, char) => {
    return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }, 0).toString(36);
}
