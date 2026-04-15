import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { auth, uid } from "./shared/forge-auth";
import { resolveTrustStage } from "../../../../evidence/trust-progression";

const PHASES_PATH = "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/path/phases.json";
const LEDGER_PATH = "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/ledger.jsonl";
const EVIDENCE_LEDGER = "/home/workspace/Projects/continuous/Qor/evidence/ledger.jsonl";

const ACTION_SCORES: Record<string, number> = {
  "phase.create": 0.3, "task.update": 0.2, "risk.update": 0.3,
  "ledger.append": 0.2, "veto.record": 0.3,
};
const TRUST_CEIL: Record<string, number> = { cbt: 0.3, kbt: 0.5, ibt: 0.7 };

function readPhases() {
  try {
    const raw = JSON.parse(readFileSync(PHASES_PATH, "utf-8"));
    const c = Array.isArray(raw) ? raw : raw?.phases;
    return Array.isArray(c) ? c : [];
  } catch { return []; }
}

function writePhases(phases: unknown[]) {
  writeFileSync(PHASES_PATH, JSON.stringify({ phases }, null, 2));
}

function appendLedger(entry: Record<string, unknown>) {
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
  const existing = existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, "utf-8") : "";
  writeFileSync(LEDGER_PATH, existing + line + "\n");
}

function classifyEvidence(e: unknown): "full" | "lite" | "invalid" {
  if (!e || typeof e !== "object") return "invalid";
  const o = e as Record<string, unknown>;
  if ("entries" in o && "sessionId" in o && "intentId" in o) return "full";
  if ("intent" in o && "justification" in o && "inputs" in o && "expectedOutcome" in o) return "lite";
  return "invalid";
}

function validateEvidence(e: Record<string, unknown>, mode: string): boolean {
  if (mode === "full") return Boolean(e.id && e.sessionId && e.intentId && Array.isArray(e.entries) && e.entries.length > 0);
  const intent = e.intent, just = e.justification, inputs = e.inputs, outcome = e.expectedOutcome;
  return Boolean(
    typeof intent === "string" && intent.trim() &&
    typeof just === "string" && just.trim() &&
    Array.isArray(inputs) && inputs.length > 0 &&
    typeof outcome === "string" && outcome.trim()
  );
}

function recordDecision(d: Record<string, unknown>) {
  const dir = EVIDENCE_LEDGER.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const entry = {
    id: uid(), timestamp: d.timestamp, kind: "PolicyDecision",
    source: "governance-gate/" + String(d.module), module: d.module,
    payload: {
      decisionId: d.decisionId, action: d.action, result: d.result,
      evidenceMode: d.evidenceMode, riskScore: d.riskScore,
      confidence: d.confidence, agentId: d.agentId,
    },
    confidence: d.confidence,
  };
  appendFileSync(EVIDENCE_LEDGER, JSON.stringify(entry) + "\n");
}

function governanceGate(mod: string, action: string, agentId: string, evidence: unknown, trustStage = "kbt") {
  const decisionId = uid();
  const ts = new Date().toISOString();
  const mode = classifyEvidence(evidence);
  if (mode === "invalid" || !validateEvidence(evidence as Record<string, unknown>, mode)) {
    const d = { decisionId, timestamp: ts, module: mod, action, result: "Block", evidenceMode: mode === "invalid" ? "lite" : mode, riskScore: 0, confidence: 0, mitigation: "Governance violation: missing or invalid evidence", agentId };
    recordDecision(d);
    return { decision: d, allowed: false };
  }
  const risk = ACTION_SCORES[action] ?? 0.5;
  const allowed = risk < (TRUST_CEIL[trustStage] ?? 0.5);
  const conf = mode === "full" ? 0.9 : 0.63;
  const d = { decisionId, timestamp: ts, module: mod, action, result: allowed ? "Allow" : "Escalate", evidenceMode: mode, riskScore: risk, confidence: conf, mitigation: allowed ? undefined : `action '${action}' requires human approval`, agentId };
  recordDecision(d);
  return { decision: d, allowed };
}

export async function forgeRoutes(path: string, url: URL, req: Request): Promise<Response | null> {
  if (!path.startsWith("/api/forge")) return null;

  // Status (read-only, no auth)
  if (path === "/api/forge/status" && req.method === "GET") {
    return handleStatus();
  }

  // All write endpoints require auth
  if (!auth(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (path === "/api/forge/create-phase" && req.method === "POST") return handleCreatePhase(req);
  if (path === "/api/forge/update-task" && req.method === "POST") return handleUpdateTask(req);
  if (path === "/api/forge/update-risk" && req.method === "POST") return handleUpdateRisk(req);
  if (path === "/api/forge/record-evidence" && req.method === "POST") return handleRecordEvidence(req);

  return null;
}

async function handleStatus(): Promise<Response> {
  const phases = readPhases();
  const entries: unknown[] = [];
  try {
    if (existsSync(LEDGER_PATH)) {
      const lines = readFileSync(LEDGER_PATH, "utf-8").trim().split("\n").filter(Boolean);
      for (const line of lines) { try { entries.push(JSON.parse(line)); } catch {} }
    }
  } catch {}
  const activePhase = phases.find((p: Record<string, unknown>) =>
    ["planned", "in-progress", "active"].includes(String(p.status))
  );
  return Response.json({ phases, activePhase, totalPhases: phases.length, totalEntries: entries.length, entries });
}

async function handleCreatePhase(req: Request): Promise<Response> {
  const body = await req.json() as Record<string, unknown>;
  const { name, objective, tasks } = body;
  if (!name || !objective) return Response.json({ error: "Missing name or objective" }, { status: 400 });
  const agentId = String(body.agentId || "operator");
  const { decision, allowed } = governanceGate("forge", "phase.create", agentId, body.evidence, resolveTrustStage(agentId));
  if (!allowed) return Response.json({ error: "Governance violation", decision: decision.result, decisionId: decision.decisionId, mitigation: decision.mitigation }, { status: 403 });
  const taskList = Array.isArray(tasks) ? tasks : [];
  const phases = readPhases();
  const phaseId = "phase_" + Date.now().toString(36);
  const newPhase = {
    phaseId, projectId: "builder-console", ordinal: phases.length + 1, name, objective,
    sourceClusterIds: [], dependencies: [], nestedPrioritySummary: [],
    tasks: taskList.map((t: Record<string, unknown>, i: number) => ({
      taskId: "task_" + phaseId + "_" + i, phaseId, title: t.title || "Task " + (i + 1),
      description: t.description || "", acceptance: [], status: "pending", priority: 3, priorityLabel: "medium", children: [],
    })),
    status: "planned", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  phases.push(newPhase);
  writePhases(phases);
  appendLedger({ action: "create-phase", phaseId, name, governanceDecisionId: decision.decisionId });
  return Response.json({ ok: true, phaseId, name, taskCount: newPhase.tasks.length, governanceDecisionId: decision.decisionId });
}

async function handleUpdateTask(req: Request): Promise<Response> {
  const body = await req.json() as Record<string, unknown>;
  const { taskId, newStatus } = body;
  if (!taskId || !newStatus) return Response.json({ error: "Missing taskId or newStatus" }, { status: 400 });
  const valid = ["done", "active", "blocked", "pending", "complete", "in-progress"];
  if (!valid.includes(String(newStatus))) return Response.json({ error: "Invalid status" }, { status: 400 });
  const agentId = String(body.agentId || "operator");
  const { decision, allowed } = governanceGate("forge", "task.update", agentId, body.evidence, resolveTrustStage(agentId));
  if (!allowed) return Response.json({ error: "Governance violation", decision: decision.result, decisionId: decision.decisionId, mitigation: decision.mitigation }, { status: 403 });
  const phases = readPhases();
  for (const phase of phases) {
    const tasks = (phase as Record<string, unknown>).tasks as Record<string, unknown>[] || [];
    const task = tasks.find(t => t.taskId === taskId);
    if (task) {
      task.status = newStatus;
      writePhases(phases);
      appendLedger({ action: "update-task", taskId, newStatus, phase: (phase as Record<string, unknown>).name, governanceDecisionId: decision.decisionId });
      return Response.json({ ok: true, taskId, newStatus, governanceDecisionId: decision.decisionId });
    }
  }
  return Response.json({ ok: false, error: `Task ${taskId} not found` }, { status: 404 });
}

async function handleUpdateRisk(req: Request): Promise<Response> {
  const body = await req.json() as Record<string, unknown>;
  const agentId = String(body.agentId || "operator");
  const { decision, allowed } = governanceGate("forge", "risk.update", agentId, body.evidence, resolveTrustStage(agentId));
  if (!allowed) return Response.json({ error: "Governance violation", decision: decision.result, decisionId: decision.decisionId, mitigation: decision.mitigation }, { status: 403 });
  const { title, severity, owner } = body;
  if (!title || !severity || !owner) return Response.json({ error: "Missing title, severity, or owner" }, { status: 400 });
  appendLedger({ action: "update-risk", title, severity, owner, governanceDecisionId: decision.decisionId });
  return Response.json({ ok: true, title, severity, owner, governanceDecisionId: decision.decisionId });
}

async function handleRecordEvidence(req: Request): Promise<Response> {
  const body = await req.json() as Record<string, unknown>;
  const { sessionId, kind, payload } = body;
  const ALLOWED_KINDS = ["CapabilityReceipt", "PolicyDecision", "TestResult", "CodeDelta", "ReviewRecord", "ReleaseRecord", "MemoryRecall"];
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) return Response.json({ error: "Missing sessionId" }, { status: 400 });
  if (!kind || !ALLOWED_KINDS.includes(String(kind))) return Response.json({ error: `Invalid kind. Allowed: ${ALLOWED_KINDS.join(", ")}` }, { status: 400 });
  appendLedger({ action: "record-evidence", sessionId, kind, payload: payload || {}, ingestionClass: "primitive", sourceRoute: "/api/forge/record-evidence", actor: "forge" });
  return Response.json({ ok: true, sessionId, kind });
}
