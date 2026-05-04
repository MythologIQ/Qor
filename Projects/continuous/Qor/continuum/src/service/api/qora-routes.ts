import {
  appendLedgerEntry,
  queryLedgerEntries,
  getLastLedgerHash,
} from "../../memory/ops/ledger-events";
import { resolveTrustStage } from "../../../../evidence/trust-progression";
import { executeGovernedAction } from "../../../../evidence/governance-gate";
import { auth, uid } from "./shared/auth";
import { agentPrivate } from "../../memory/partitions";
import type { AgentContext } from "../../memory/access-policy";

const QORA_CTX: AgentContext = { agentId: "qora", partitions: [agentPrivate("qora"), "shared-operational", "canonical", "audit"] };

function maintenanceGuard(): Response | null {
  if (process.env.QORA_MAINTENANCE === "1") {
    return Response.json(
      { error: "qora_maintenance", message: "Qora ledger is in maintenance mode" },
      { status: 503 },
    );
  }
  return null;
}

export async function qoraRoutes(path: string, url: URL, req: Request): Promise<Response | null> {
  if (!path.startsWith("/api/qora")) return null;

  if (path === "/api/qora/status" && req.method === "GET") {
    const entries = await queryLedgerEntries({ limit: 1 }, QORA_CTX);
    const all = await queryLedgerEntries({ limit: 100000 }, QORA_CTX);
    return Response.json({
      status: "ok", totalEntries: all.length,
      lastEntry: entries[0] || null, source: "continuum",
    });
  }

  if (path === "/api/qora/entries" && req.method === "GET") {
    const limit = parseInt(url.searchParams.get("limit") ?? "50");
    const entries = await queryLedgerEntries({ limit }, QORA_CTX);
    return Response.json({ entries, total: entries.length });
  }

  if (path === "/api/qora/entry" && req.method === "GET") {
    const seq = parseInt(url.searchParams.get("seq") ?? "0");
    if (!seq) return Response.json({ error: "seq param required" }, { status: 400 });
    const entries = await queryLedgerEntries({ limit: 100000 }, QORA_CTX);
    const entry = entries.find((e: any) => e.seq === seq);
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
  const maint = maintenanceGuard();
  if (maint) return maint;

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

  const result = await appendLedgerEntry({
    type: String(type), payload: payload || {},
    provenance: provenance || { source: "api", tier: 1, autonomyLevel: 1 },
  }, QORA_CTX);
  return Response.json({ ok: true, seq: result.seq, hash: result.hash, governanceDecisionId: decision.decisionId });
}

async function handleRecordVeto(req: Request): Promise<Response> {
  const maint = maintenanceGuard();
  if (maint) return maint;

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

  const vetoPayload = { target, reason, severity: severity || "advisory" };
  const result = await appendLedgerEntry({
    type: "VETO", payload: vetoPayload,
    provenance: { source: source || "api", tier: 1, autonomyLevel: 0 },
  }, QORA_CTX);
  return Response.json({ ok: true, seq: result.seq, hash: result.hash, governanceDecisionId: decision.decisionId });
}
