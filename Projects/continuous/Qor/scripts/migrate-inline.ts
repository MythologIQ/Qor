import { ContinuumClient } from "../continuum/client/index";
import { readFileSync } from "node:fs";

const parsed = readFileSync("qora/data/ledger.jsonl", "utf-8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
console.log("Entries:", parsed.length);

const client = ContinuumClient.fromEnv();
let imported = 0;
for (const row of parsed) {
  try {
    const ts = typeof row.timestamp === "number" ? row.timestamp : Date.parse(row.timestamp);
    await client.call("events.ledger.append", {
      mode: "import", seq: row.seq, hash: row.hash, prevHash: row.prevHash,
      timestamp: ts, type: row.type, payload: row.payload || {},
      provenance: { ...(row.provenance || {}), migration_source: "jsonl-2026-05-04" }
    });
    imported++;
    console.log(`  imported seq=${row.seq}`);
  } catch (err: any) {
    if (err.message.includes("already") || err.message.includes("unique")) {
      console.log(`  skip seq=${row.seq} (exists)`);
    } else {
      console.error(`  ERROR seq=${row.seq}: ${err.message}`);
    }
  }
}
console.log(`Done: ${imported}/${parsed.length} imported`);
await client.close();
