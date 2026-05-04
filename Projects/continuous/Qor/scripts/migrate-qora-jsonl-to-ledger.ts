import { readFileSync, existsSync } from "node:fs";
import { appendLedgerEntry } from "../continuum/src/memory/ops/ledger-events";
import { agentPrivate, type Partition } from "../continuum/src/memory/partitions";
import type { AgentContext } from "../continuum/src/memory/access-policy";
import { getDriver } from "../continuum/src/memory/driver";
import { initializeSchema } from "../continuum/src/memory/schema";

const JSONL_PATH = "/home/workspace/Projects/continuous/Qor/qora/data/ledger.jsonl";
const QORA_CTX: AgentContext = { agentId: "qora", partitions: [agentPrivate("qora"), "shared-operational", "canonical", "audit"] };

interface JsonlRow {
  seq: number;
  timestamp: string | number;
  type: string;
  hash: string;
  prevHash: string;
  payload: unknown;
  provenance?: unknown;
}

function normalizeTimestamp(val: string | number): number {
  if (typeof val === "number") return val;
  const parsed = Date.parse(val);
  if (!Number.isFinite(parsed)) throw new Error(`invalid timestamp: ${val}`);
  return parsed;
}

async function main() {
  if (!existsSync(JSONL_PATH)) {
    console.log("No JSONL file found. Nothing to migrate.");
    process.exit(0);
  }
  if (process.env.QOR_LEDGER_IMPORT !== "1") {
    console.error("QOR_LEDGER_IMPORT=1 required");
    process.exit(1);
  }

  await initializeSchema(getDriver());

  const raw = readFileSync(JSONL_PATH, "utf-8").trim();
  if (!raw) { console.log("Empty JSONL."); process.exit(0); }

  const rows: JsonlRow[] = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  console.log(`Migrating ${rows.length} entries from JSONL...`);

  let imported = 0;
  for (const row of rows) {
    try {
      await appendLedgerEntry({
        mode: "import",
        seq: row.seq,
        hash: row.hash,
        prevHash: row.prevHash,
        timestamp: normalizeTimestamp(row.timestamp),
        type: row.type,
        payload: row.payload || {},
        provenance: { ...row.provenance, migration_source: "jsonl-2026-05-03" },
      }, QORA_CTX);
      imported++;
    } catch (err: any) {
      if (err?.message?.includes("already exists") || err?.message?.includes("unique")) {
        console.log(`  Skipping seq=${row.seq} (already imported)`);
      } else {
        console.error(`  Error at seq=${row.seq}: ${err.message}`);
      }
    }
  }
  console.log(`Migration complete: ${imported}/${rows.length} imported`);
}

main().catch((err) => { console.error(`Migration failed: ${err.message}`); process.exit(1); });
