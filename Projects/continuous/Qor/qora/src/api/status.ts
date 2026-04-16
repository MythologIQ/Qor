import { readFileSync, existsSync } from "node:fs";

export const PATHS = {
  qoraRoot: "/home/workspace/Projects/continuous/Qor/qora",
  ledgerPath: "/home/workspace/Projects/continuous/Qor/qora/data/ledger.jsonl",
  statePath: "/home/workspace/Projects/continuous/Qor/qora/state.json",
  governancePath: "/home/workspace/Projects/continuous/Qor/qora/docs/GOVERNANCE.md",
} as const;

export interface LedgerEntry {
  seq: number;
  timestamp: string;
  type: string;
  hash: string;
  prevHash: string;
  payload: unknown;
  provenance: { source: string; tier: number; autonomyLevel: number };
}

export function readLedgerLines(path: string): string[] {
  try {
    return existsSync(path)
      ? readFileSync(path, "utf-8").trim().split("\n").filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function parseLedger(path: string): LedgerEntry[] {
  const lines = readLedgerLines(path);
  const entries: LedgerEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {}
  }
  return entries;
}

export function countByType(entries: LedgerEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }
  return counts;
}

export function latestEntry(entries: LedgerEntry[]): LedgerEntry | null {
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

export function verifyChain(entries: LedgerEntry[]): { valid: boolean; brokenAt?: number } {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].prevHash !== entries[i - 1].hash) {
      return { valid: false, brokenAt: i };
    }
  }
  return { valid: true };
}

export function timeRange(entries: LedgerEntry[]): { from: string; to: string } | null {
  if (entries.length === 0) return null;
  return {
    from: entries[0].timestamp,
    to: entries[entries.length - 1].timestamp,
  };
}

export function buildQoraStatus() {
  const entries = parseLedger(PATHS.ledgerPath);
  const chain = verifyChain(entries);
  const counts = countByType(entries);
  const latest = latestEntry(entries);
  const range = timeRange(entries);

  return {
    entity: "qora",
    status: chain.valid ? "healthy" : "chain-broken",
    entryCount: entries.length,
    typeCounts: counts,
    chainIntegrity: chain,
    latestEntry: latest
      ? { seq: latest.seq, type: latest.type, timestamp: latest.timestamp }
      : null,
    timeRange: range,
  };
}
