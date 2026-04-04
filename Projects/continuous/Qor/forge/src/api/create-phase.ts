import type { Context } from "hono";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SECRET_PATH = "/home/workspace/Projects/continuous/Qor/forge/.secrets/api_key";
const PHASES_PATH =
  "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/path/phases.json";
const LEDGER_PATH =
  "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/ledger.jsonl";

function auth(c: Context): boolean {
  const header = c.req.header("Authorization") || "";
  const token = header.replace("Bearer ", "").trim();
  if (!token) return false;
  try {
    const secret = readFileSync(SECRET_PATH, "utf-8").trim();
    return token === secret;
  } catch {
    return false;
  }
}

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
  const existing = existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, "utf-8") : "";
  writeFileSync(LEDGER_PATH, existing + line + "\n");
}

export default async function handler(c: Context) {
  if (!auth(c)) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json();
  const { name, objective, tasks } = body;
  if (!name || !objective) {
    return c.json({ error: "Missing name or objective" }, 400);
  }
  const taskList = Array.isArray(tasks) ? tasks : [];
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
    tasks: taskList.map((t: any, i: number) => ({
      taskId: `task_${phaseId}_${i}`,
      phaseId,
      title: t.title || `Task ${i + 1}`,
      description: t.description || "",
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
  return c.json({ ok: true, phaseId, name, taskCount: newPhase.tasks.length });
}
