import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveTrustStage } from "../../../../evidence/trust-progression";
import { uid } from "./shared/forge-auth";

const SECRET_PATH = "/home/workspace/Projects/continuous/Qor/qora/.secrets/api_key";
const LEDGER_PATH = "/home/workspace/Projects/continuous/Qor/qora/data/ledger.jsonl";
const EVIDENCE_LEDGER = "/home/workspace/Projects/continuous/Qor/evidence/ledger.jsonl";

const ACTION_SCORES: Record<string, number> = {
  "phase.create": 0.3, "task.update": 0.2, "risk.update": 0.3,
  "ledger.append": 0.2, "veto.record": 0.3,
};
const TRUST_CEIL: Record<string, number> = { cbt: 0.3, kbt: 0.5, ibt: 0.7 };

function auth(req: Request): boolean {
  const header = req.headers.get("authorization") || req.headers.get("x-api-key") || "";
  const token = header.replace("Bearer ", "").trim();
  if (!token) return false;
  try { return token === readFileSync(SECRET_PATH, "utf-8").trim(); } catch { return false; }
}

function parseLedger() {
  try {
    if (!existsSync(LEDGER_PATH)) return [];
    return readFileSync(LEDGER_PATH, "utf-8").trim().split("\n").filter(Boolean).map((l: string) => JSON.parse(l));
  } catch { return []; }
}

function computeHash(prev: string, type: string, payload: unknown): string {
  return Buffer.from(JSON.stringify({ prev, type, payload })).toString("base64").slice(0, 32);
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
  return Boolean(typeof intent === "string" && intent.trim() && typeof just === "string" && just.trim() && Array.isArray(inputs) && inputs.length > 0 && typeof outcome === "string" && outcome.trim());
}

function recordDecision(d: Record<string, unknown>) {
  const dir = EVIDENCE_LEDGER.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(EVIDENCE_LEDGER, JSON.stringify({
    id: uid(), timestamp: d.timestamp, kind: "PolicyDecision",
    source: "governance-gate/" + String(d.module), module: d.module,
    payload: { decisionId: d.decisionId, action: d.action, result: d.result, evidenceMode: d.evidenceMode, riskScore: d.riskScore, confidence: d.confidence, agentId: d.agentId },
    confidence: d.confidence,
  }) + "\n");
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

export async function qoraRoutes(path: string, url: URL, req: Request): Promise<Response | null> {
  if (!path.startsWith("/api/qora")) return null;

  if (path === "/api/qora/status" && req.method === "GET") {
    const entries = parseLedger();
    return Response.json({ status: "ok", totalEntries: entries.length, lastEntry: entries[entries.length - 1] || null });
  }

  if (path === "/api/qora/entries" && req.method === "GET") {
    const entries = parseLedger();
    const limit = parseInt(url.searchParams.get("limit") ?? "50");
    return Response.json({ entries: entries.slice(-limit), total: entries.length });
  }

  if (path === "/api/qora/entry" && req.method === "GET") {
    const seq = parseInt(url.searchParams.get("seq") ?? "0");
    if (!seq) return Response.json({ error: "seq param required" }, { status: 400 });
    const entries = parseLedger();
    const entry = entries.find((e: Record<string, unknown>) => e.seq === seq);
    if (!entry) return Response.json({ error: "Entry not found" }, { status: 404 });
    return Response.json(entry);
  }

  // Write endpoints require auth
  if (!auth(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });

  if (path === "/api/qora/append-entry") return handleAppendEntry(req);
  if (path === "/api/qora/record-veto") return handleRecordVeto(req);

  return null;
}

async function handleAppendEntry(req: Request): Promise<Response> {
  const body = await req.json() as Record<string, unknown>;
  const { type, payload, provenance } = body;
  if (!type) return Response.json({ error: "Missing type" }, { status: 400 });
  const agentId = String(body.agentId || "operator");
  const { decision, allowed } = governanceGate("qora", "ledger.append", agentId, body.evidence, resolveTrustStage(agentId));
  if (!allowed) return Response.json({ error: "Governance violation", decision: decision.result, decisionId: decision.decisionId, mitigation: decision.mitigation }, { status: 403 });
  const dir = dirname(LEDGER_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const entries = parseLedger();
  const prevHash = entries.length > 0 ? (entries[entries.length - 1] as Record<string, unknown>).hash as string : "genesis";
  const seq = entries.length + 1;
  const hash = computeHash(prevHash, String(type), payload);
  const entry = { seq, timestamp: new Date().toISOString(), type, hash, prevHash, payload: payload || {}, provenance: provenance || { source: "api", tier: 1, autonomyLevel: 1 }, governanceDecisionId: decision.decisionId };
  const existing = existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, "utf-8") : "";
  writeFileSync(LEDGER_PATH, existing + JSON.stringify(entry) + "\n");
  return Response.json({ ok: true, seq, hash, governanceDecisionId: decision.decisionId });
}

async function handleRecordVeto(req: Request): Promise<Response> {
  const body = await req.json() as Record<string, unknown>;
  const agentId = String(body.agentId || "operator");
  const { decision, allowed } = governanceGate("qora", "veto.record", agentId, body.evidence, resolveTrustStage(agentId));
  if (!allowed) return Response.json({ error: "Governance violation", decision: decision.result, decisionId: decision.decisionId, mitigation: decision.mitigation }, { status: 403 });
  const { target, reason, severity, source } = body;
  if (!target || !reason) return Response.json({ error: "Missing target or reason" }, { status: 400 });
  const dir = dirname(LEDGER_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const entries = parseLedger();
  const prevHash = entries.length > 0 ? (entries[entries.length - 1] as Record<string, unknown>).hash as string : "genesis";
  const seq = entries.length + 1;
  const vetoPayload = { target, reason, severity: severity || "advisory" };
  const hash = computeHash(prevHash, "VETO", vetoPayload);
  const entry = { seq, timestamp: new Date().toISOString(), type: "VETO", hash, prevHash, payload: vetoPayload, provenance: { source: source || "api", tier: 1, autonomyLevel: 0 }, governanceDecisionId: decision.decisionId };
  const existing = existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, "utf-8") : "";
  writeFileSync(LEDGER_PATH, existing + JSON.stringify(entry) + "\n");
  return Response.json({ ok: true, seq, hash, governanceDecisionId: decision.decisionId });
}
