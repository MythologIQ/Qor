import { appendEvidence, readEvidence, getChainLength } from "../../../../evidence/log";
import type { EvidenceKind } from "../../../../evidence/contract";
import { auth } from "./shared/auth";

export async function qorEvidenceRoutes(path: string, url: URL, req: Request): Promise<Response | null> {
  if (path !== "/api/qor/evidence") return null;

  if (req.method === "GET") {
    const kind = url.searchParams.get("kind") as EvidenceKind | undefined;
    const module = url.searchParams.get("module") ?? undefined;
    const since = url.searchParams.get("since") ?? undefined;
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined;
    const entries = readEvidence({ kind, module, since, limit });
    return Response.json({ entries, total: getChainLength() });
  }

  if (req.method === "POST") {
    if (!auth(req, "qor")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const ALLOWED_KINDS = ["CapabilityReceipt", "PolicyDecision", "TestResult", "CodeDelta", "ReviewRecord", "ReleaseRecord", "MemoryRecall"];
    const ALLOWED_MODULES = ["victor", "qora", "forge", "continuum", "qor"];

    if (!body.kind || !ALLOWED_KINDS.includes(body.kind as string)) {
      return Response.json({ error: `Invalid or missing 'kind'. Allowed: ${ALLOWED_KINDS.join(", ")}` }, { status: 400 });
    }
    if (!body.source || typeof body.source !== "string" || !(body.source as string).trim()) {
      return Response.json({ error: "Missing or empty 'source' field" }, { status: 400 });
    }
    if (!body.module || !ALLOWED_MODULES.includes(body.module as string)) {
      return Response.json({ error: `Invalid or missing 'module'. Allowed: ${ALLOWED_MODULES.join(", ")}` }, { status: 400 });
    }

    const entry = appendEvidence({
      kind: body.kind as EvidenceKind,
      source: body.source as string,
      module: body.module as "victor" | "qora" | "forge" | "continuum" | "qor",
      workCellId: body.workCellId as string | undefined,
      payload: (body.payload as Record<string, unknown>) ?? {},
      confidence: typeof body.confidence === "number" ? body.confidence : 0.8,
      ingestionClass: "primitive",
      sourceRoute: "/api/qor/evidence",
      actor: req.headers.get("x-agent-id") || "anonymous",
    });
    return Response.json({ ok: true, id: entry.id, timestamp: entry.timestamp });
  }

  if (req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
    return Response.json({ error: "Method not allowed — evidence is append-only" }, { status: 405 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
