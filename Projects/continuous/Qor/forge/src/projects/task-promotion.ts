import { isPlannedTaskState } from "../../../qor/contracts/task-lifecycle";

interface RawTask {
  taskId?: string;
  phaseId?: string;
  title: string;
  description?: string;
  acceptance?: string[];
  status: string;
  priority?: number | string;
  priorityLabel?: string;
  children?: RawTask[];
}

interface RawPhase {
  phaseId: string;
  status: string;
  tasks: RawTask[];
}

function normalizePriority(priority: number | string | undefined): number {
  if (typeof priority === "number") return priority;
  if (typeof priority === "string") {
    const match = priority.match(/^P(\d+)$/i);
    if (match) return Number(match[1]);
    const parsed = Number(priority);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 99;
}

function canPromoteChildren(parent: RawTask): boolean {
  return parent.status === "done" || parent.status === "complete" || parent.status === "active";
}

function buildPromotedTask(parent: RawTask, child: RawTask, phaseId: string, index: number): RawTask {
  return {
    taskId: `${parent.taskId}__child_${index + 1}`,
    phaseId,
    title: child.title,
    description: child.description ?? parent.description ?? "",
    acceptance: child.acceptance ?? [],
    status: "planned",
    priority: normalizePriority(child.priority),
    priorityLabel: child.priorityLabel ?? parent.priorityLabel ?? "promoted-child",
    children: [],
  };
}

export function promoteClaimableChildTasks(phases: RawPhase[]): boolean {
  let changed = false;
  for (const phase of phases) {
    if (phase.status !== "active" && phase.status !== "in-progress") continue;
    const existingIds = new Set(phase.tasks.map((task) => task.taskId).filter(Boolean));
    const promoted: RawTask[] = [];
    for (const parent of phase.tasks) {
      if (!parent.taskId || !canPromoteChildren(parent)) continue;
      const children = parent.children ?? [];
      children.forEach((child, index) => {
        if (!isPlannedTaskState(child.status)) return;
        const promotedId = `${parent.taskId}__child_${index + 1}`;
        if (existingIds.has(promotedId)) return;
        promoted.push(buildPromotedTask(parent, child, phase.phaseId, index));
        existingIds.add(promotedId);
        changed = true;
      });
    }
    if (promoted.length > 0) {
      phase.tasks.push(...promoted);
    }
  }
  return changed;
}

export function toSortablePriority(priority: number | string | undefined): number {
  return normalizePriority(priority);
}
