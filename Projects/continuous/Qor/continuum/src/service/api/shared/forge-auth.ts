import { readFileSync, existsSync } from "node:fs";

const SECRET_PATH = "/home/workspace/Projects/continuous/Qor/forge/.secrets/api_key";

export function auth(req: Request): boolean {
  const header = req.headers.get("authorization") || req.headers.get("x-api-key") || "";
  const token = header.replace("Bearer ", "").trim();
  if (!token) return false;
  try { return token === readFileSync(SECRET_PATH, "utf-8").trim(); } catch { return false; }
}

export function uid(): string {
  return "gov_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
