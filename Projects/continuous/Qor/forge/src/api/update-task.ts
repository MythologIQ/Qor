import type { Context } from "hono";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SECRET_PATH = "/home/workspace/Projects/continuous/Qor/forge/.secrets/api_key";
const PHASES_PATH =
  "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/path/phases.json";
const LEDGER_PATH =
  "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/ledger.jsonl";

export function auth(c: Context): boolean {
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
  const { taskId, newStatus } = body;
  if (!taskId || !newStatus) {
    return c.json({ error: "Missing taskId or newStatus" }, 400);
  }
  const valid = ["done", "active", "blocked", "pending"];
  if (!valid.includes(newStatus)) {
    return c.json({ error: `Invalid status. Must be: ${valid.join(", ")}` }, 400);
  }
  const phases = readPhases();
  for (const phase of phases) {
    const tasks = phase.tasks || [];
    const task = tasks.find((t: any) => t.taskId === taskId);
    if (task) {
      task.status = newStatus;
      writePhases(phases);
      appendLedger({ action: "update-task", taskId, newStatus, phase: phase.name });
      return c.json({ ok: true, taskId, newStatus });
    }
  }
  return c.json({ ok: false, error: `Task ${taskId} not found` }, 404);
}
