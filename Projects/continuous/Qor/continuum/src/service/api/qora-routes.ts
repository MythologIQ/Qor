import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resolveTrustStage } from "../../../../evidence/trust-progression";
import { executeGovernedAction } from "../../../../evidence/governance-gate";
import { auth, uid } from "./shared/auth";

const LEDGER_PATH = "/home/workspace/Projects/continuous/Qor/qora/data/ledger.jsonl";

function parseLedger() {
  try {
    if (!existsSync(LEDGER_PATH)) return [];
    return readFileSync(LEDGER_PATH, "utf-8").trim().split("\n").filter(Boolean).map((l: string) => JSON.parse(l));
  } catch { return []; }
}

function computeHash(prev: string, type: string, payload: unknown): string {
  return Buffer.from(JSON.stringify({ prev, type, payload })).toString("base64").slice(0, 32);
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

  if (!auth(req, "qora")) return Response.json({ error: "Unauthorized" }, { status: 401 });
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
  const { decision, allowed } = await executeGovernedAction({
    module: "qora", action: "ledger.append", agentId,
    payload: body as Record<string, unknown>,
    evidence: body.evidence as any,
    trustStage: resolveTrustStage(agentId),
  });
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
  const { decision, allowed } = await executeGovernedAction({
    module: "qora", action: "veto.record", agentId,
    payload: body as Record<string, unknown>,
    evidence: body.evidence as any,
    trustStage: resolveTrustStage(agentId),
  });
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
