import { readFileSync, writeFileSync, existsSync } from "node:fs";

const PHASES_PATH =
  "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/path/phases.json";
const LEDGER_PATH =
  "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/ledger.jsonl";

function readPhases(): any[] {
  try {
    const raw = JSON.parse(readFileSync(PHASES_PATH, "utf-8"));
    const candidate = Array.isArray(raw) ? raw : raw?.phases;
    return Array.isArray(candidate) ? candidate : [];
  } catch {
    return [];
  }
}

function writePhases(phases: any[]): void {
  writeFileSync(PHASES_PATH, JSON.stringify({ phases }, null, 2));
}

function appendLedger(entry: Record<string, unknown>): void {
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
  const existing = existsSync(LEDGER_PATH)
    ? readFileSync(LEDGER_PATH, "utf-8")
    : "";
  writeFileSync(LEDGER_PATH, existing + line + "\n");
}

export function updateTaskStatus(
  taskId: string,
  newStatus: "done" | "active" | "blocked" | "pending",
): { ok: boolean; error?: string } {
  const phases = readPhases();
  for (const phase of phases) {
    const tasks = phase.tasks || [];
    const task = tasks.find((t: any) => t.taskId === taskId);
    if (task) {
      task.status = newStatus;
      writePhases(phases);
      appendLedger({
        action: "update-task",
        taskId,
        newStatus,
        phase: phase.name,
      });
      return { ok: true };
    }
  }
  return { ok: false, error: `Task ${taskId} not found` };
}

export function createPhase(
  name: string,
  objective: string,
  tasks: Array<{ title: string; description: string }>,
): { ok: boolean; phaseId: string } {
  const phases = readPhases();
  const phaseId = `phase_${Date.now().toString(36)}`;
  const newPhase = {
    phaseId,
    projectId: "builder-console",
    ordinal: phases.length + 1,
    name,
    objective,
    sourceClusterIds: [],
    dependencies: [],
    nestedPrioritySummary: [],
    tasks: tasks.map((t, i) => ({
      taskId: `task_${phaseId}_${i}`,
      phaseId,
      title: t.title,
      description: t.description,
      acceptance: [],
      status: "pending",
      priority: 3,
      priorityLabel: "medium",
      children: [],
    })),
    status: "planned",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  phases.push(newPhase);
  writePhases(phases);
  appendLedger({ action: "create-phase", phaseId, name });
  return { ok: true, phaseId };
}

export function recordEvidence(
  sessionId: string,
  kind: string,
  payload: Record<string, unknown>,
): { ok: boolean } {
  appendLedger({
    action: "record-evidence",
    sessionId,
    kind,
    payload,
  });
  return { ok: true };
}

export function updateRisk(
  title: string,
  severity: string,
  owner: string,
): { ok: boolean } {
  appendLedger({
    action: "update-risk",
    title,
    severity,
    owner,
  });
  return { ok: true };
}
