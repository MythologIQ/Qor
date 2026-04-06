/**
 * Forge Queue Reader — reads Forge's task queue and selects eligible work.
 * Victor reads this to know what Forge needs done next.
 */

import { readFileSync } from "fs";

export interface ForgeTask {
  taskId: string;
  phaseId: string;
  title: string;
  description: string;
  acceptance: string[];
  priority: number;
}

export interface ForgeQueueResult {
  task: ForgeTask | null;
  activePhase: { phaseId: string; name: string; objective: string } | null;
  queueDepth: number;
}

interface RawTask {
  taskId: string;
  phaseId: string;
  title: string;
  description: string;
  acceptance?: string[];
  status: string;
  priority?: number;
  children?: RawTask[];
}

interface RawPhase {
  phaseId: string;
  name: string;
  objective: string;
  status: string;
  tasks: RawTask[];
}

export function readForgeQueue(phasesPath: string): ForgeQueueResult {
  let raw: { phases: RawPhase[] };
  try {
    raw = JSON.parse(readFileSync(phasesPath, "utf-8"));
  } catch {
    return { task: null, activePhase: null, queueDepth: 0 };
  }

  const active = raw.phases.find(
    (p) => p.status === "active" || p.status === "in-progress"
  );
  if (!active) return { task: null, activePhase: null, queueDepth: 0 };

  const allTasks = flattenTasks(active.tasks, active.phaseId);
  const eligible = allTasks.filter(isTaskEligible);
  const next = selectNextTask(eligible);

  return {
    task: next,
    activePhase: {
      phaseId: active.phaseId,
      name: active.name,
      objective: active.objective,
    },
    queueDepth: eligible.length,
  };
}

function flattenTasks(tasks: RawTask[], phaseId: string): RawTask[] {
  const result: RawTask[] = [];
  for (const t of tasks) {
    result.push({ ...t, phaseId });
    if (t.children?.length) {
      result.push(...flattenTasks(t.children, phaseId));
    }
  }
  return result;
}

export function isTaskEligible(task: RawTask): boolean {
  return task.status === "pending" || task.status === "planned";
}

export function selectNextTask(tasks: RawTask[]): ForgeTask | null {
  if (tasks.length === 0) return null;

  const sorted = [...tasks].sort(
    (a, b) => (a.priority ?? 99) - (b.priority ?? 99)
  );
  const pick = sorted[0];

  return {
    taskId: pick.taskId,
    phaseId: pick.phaseId,
    title: pick.title,
    description: pick.description,
    acceptance: pick.acceptance ?? [],
    priority: pick.priority ?? 99,
  };
}
