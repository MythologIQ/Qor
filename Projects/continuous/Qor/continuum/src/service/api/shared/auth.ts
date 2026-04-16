import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const SECRET_PATHS: Record<string, string> = {
  forge: "/home/workspace/Projects/continuous/Qor/forge/.secrets/api_key",
  qora: "/home/workspace/Projects/continuous/Qor/qora/.secrets/api_key",
};

function getSecret(module: string): string | null {
  const envKey = `QOR_${module.toUpperCase()}_SECRET`;
  if (process.env[envKey]) return process.env[envKey]!;
  const path = SECRET_PATHS[module];
  if (!path) return process.env.QOR_EVIDENCE_SECRET ?? null;
  try { return readFileSync(path, "utf-8").trim(); } catch { return null; }
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function auth(req: Request, module = "forge"): boolean {
  const header = req.headers.get("authorization") || req.headers.get("x-api-key") || "";
  const token = header.replace("Bearer ", "").trim();
  if (!token) return false;
  const secret = getSecret(module);
  if (!secret) return false;
  return constantTimeEqual(token, secret);
}

export function uid(): string {
  return "gov_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
