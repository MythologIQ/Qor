import { readFileSync, writeFileSync, existsSync } from "node:fs";

const LEDGER_PATH =
  "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/ledger.jsonl";

export interface LedgerEntry {
  timestamp: string;
  action: string;
  [key: string]: unknown;
}

export function readLedger(): LedgerEntry[] {
  if (!existsSync(LEDGER_PATH)) return [];
  try {
    return readFileSync(LEDGER_PATH, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export function appendLedger(entry: Omit<LedgerEntry, "timestamp">): void {
  const line = JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  const existing = existsSync(LEDGER_PATH)
    ? readFileSync(LEDGER_PATH, "utf-8")
    : "";
  writeFileSync(LEDGER_PATH, existing + line + "\n");
}

export function recentEntries(count: number): LedgerEntry[] {
  return readLedger().slice(-count);
}

export function entriesByAction(action: string): LedgerEntry[] {
  return readLedger().filter((e) => e.action === action);
}
