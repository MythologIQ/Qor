/**
 * QoreLogic Heartbeat Module
 * Deterministic automation for agent autonomy
 */

export enum AutonomyLevel {
  NONE = 0,
  SUGGEST = 1,
  ASSISTED = 2,
  FULL = 3,
  DELEGATED = 4,
}

export type AgentMode = "idle" | "review" | "execute" | "govern";

export interface AgentContext {
  tier: number;
  mode: AgentMode;
  cadence: number;
  phase: { objective: string; name: string };
  progress: { completed: number; total: number };
  blockers: string[];
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

// Simple derivation - exports tasks from objective patterns
export async function deriveTasksFromContext(ctx: AgentContext) {
  const tasks: Task[] = [];
  const obj = ctx.phase.objective;

  if (obj.toLowerCase().includes("memory") || obj.toLowerCase().includes("operator")) {
    tasks.push({
      id: crypto.randomUUID(),
      title: "Document persistence layer",
      description: `Based on objective: ${obj}`,
      urgency: "medium",
      source: "phase_objective",
    });
  }

  if (obj.match(/\d+%/)) {
    const match = obj.match(/(\d+)%/);
    if (match) {
      const pct = parseInt(match[1]);
      const remaining = Math.ceil(((100 - pct) / 100) * 156);
      tasks.push({
        id: crypto.randomUUID(),
        title: `Identify remaining ${remaining} tasks`,
        description: `Gap analysis from ${pct}% completion`,
        urgency: "high",
        source: "progress_gap",
      });
    }
  }

  if (ctx.blockers.length > 0) {
    tasks.push({
      id: crypto.randomUUID(),
      title: `Resolve blockers`,
      description: ctx.blockers.join(", "),
      urgency: "high",
      source: "blockers",
    });
  }

  return {
    tasks,
    provenanceHash: hashData(obj + ctx.blockers.join("")),
    confidence: tasks.length > 0 ? 0.8 : 0.0,
    sources: ["phase_objective"],
  };
}

function hashData(data: string): string {
  return Array.from(data).reduce((hash, char) => {
    return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }, 0).toString(36);
}
