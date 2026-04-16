import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PATHS, parseLedger } from "./status";

const SECRET_PATH = "/home/workspace/Projects/continuous/Qor/qora/.secrets/api_key";

export function auth(token: string): boolean {
  if (!token) return false;
  try {
    const secret = readFileSync(SECRET_PATH, "utf-8").trim();
    return token === secret;
  } catch {
    return false;
  }
}

function computeHash(prev: string, type: string, payload: unknown): string {
  const data = JSON.stringify({ prev, type, payload });
  return Buffer.from(data).toString("base64").slice(0, 32);
}

export function appendEntry(
  type: string,
  payload: unknown,
  provenance: { source: string; tier: number; autonomyLevel: number },
): { ok: boolean; seq: number; hash: string } {
  const dir = dirname(PATHS.ledgerPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const entries = parseLedger(PATHS.ledgerPath);
  const prevHash = entries.length > 0 ? entries[entries.length - 1].hash : "genesis";
  const seq = entries.length + 1;
  const hash = computeHash(prevHash, type, payload);

  const entry = {
    seq,
    timestamp: new Date().toISOString(),
    type,
    hash,
    prevHash,
    payload,
    provenance,
  };

  const existing = existsSync(PATHS.ledgerPath)
    ? readFileSync(PATHS.ledgerPath, "utf-8")
    : "";
  writeFileSync(PATHS.ledgerPath, existing + JSON.stringify(entry) + "\n");

  return { ok: true, seq, hash };
}
