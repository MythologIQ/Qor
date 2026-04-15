import { evaluate } from "../../../../evidence/evaluate";
import type { EvaluationRequest } from "../../../../evidence/contract";

export async function qorEvaluateRoutes(path: string, url: URL, req: Request): Promise<Response | null> {
  if (path !== "/api/qor/evaluate") return null;

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed. Use POST." }, { status: 405 });
  }

  let body: EvaluationRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.action || !body.agentId || !body.trustStage) {
    return Response.json({ error: "Missing required fields: action, agentId, trustStage" }, { status: 400 });
  }

  const result = evaluate(body);

  let memoryContext: unknown[] | undefined;
  try {
    const recall = await fetch(
      `http://localhost:4100/api/continuum/recall?q=${encodeURIComponent(body.action)}&k=3`,
      { signal: AbortSignal.timeout(2000) },
    );
    if (recall.ok) {
      const data = await recall.json();
      memoryContext = data.results ?? data;
    }
  } catch {}

  return Response.json({ ...result, memoryContext });
}
