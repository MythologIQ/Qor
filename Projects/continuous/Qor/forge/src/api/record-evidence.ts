import type { Context } from "hono";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SECRET_PATH = "/home/workspace/Projects/continuous/Qor/forge/.secrets/api_key";
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

function appendLedger(entry: Record<string, unknown>): void {
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
  const existing = existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, "utf-8") : "";
  writeFileSync(LEDGER_PATH, existing + line + "\n");
}

export default async function handler(c: Context) {
  if (!auth(c)) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json();
  const { sessionId, kind, payload } = body;
  if (!sessionId || !kind) {
    return c.json({ error: "Missing sessionId or kind" }, 400);
  }
  appendLedger({
    action: "record-evidence",
    sessionId,
    kind,
    payload: payload || {},
  });
  return c.json({ ok: true, sessionId, kind });
}
