import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { EvidenceEntry, EvidenceKind } from "./contract";

const LEDGER_PATH = "/home/workspace/Projects/continuous/Qor/evidence/ledger.jsonl";

function ensureDir(): void {
  const dir = LEDGER_PATH.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function appendEvidence(entry: Omit<EvidenceEntry, "id" | "timestamp">): EvidenceEntry {
  ensureDir();
  const full: EvidenceEntry = {
    ...entry,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };
  appendFileSync(LEDGER_PATH, JSON.stringify(full) + "\n");
  return full;
}

export function readEvidence(filter?: {
  kind?: EvidenceKind;
  module?: string;
  since?: string;
  limit?: number;
}): EvidenceEntry[] {
  if (!existsSync(LEDGER_PATH)) return [];
  const lines = readFileSync(LEDGER_PATH, "utf-8").split("\n").filter(Boolean);
  let entries: EvidenceEntry[] = lines.map(l => JSON.parse(l));
  if (filter?.kind) entries = entries.filter(e => e.kind === filter.kind);
  if (filter?.module) entries = entries.filter(e => e.module === filter.module);
  if (filter?.since) entries = entries.filter(e => e.timestamp >= filter.since);
  if (filter?.limit) entries = entries.slice(-filter.limit);
  return entries;
}

export function getChainLength(): number {
  if (!existsSync(LEDGER_PATH)) return 0;
  return readFileSync(LEDGER_PATH, "utf-8").split("\n").filter(Boolean).length;
}
