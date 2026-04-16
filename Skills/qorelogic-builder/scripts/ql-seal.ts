#!/usr/bin/env bun
/**
 * ql-seal — Cryptographic session sealing
 * 
 * Usage:
 *   bun ql-seal.ts --operation "Description" --persona "Governor|Judge|Specialist" [--file path] [--details text]
 *   bun ql-seal.ts [project-root] --operation "Description" --persona "Governor"
 * 
 * Appends a signed entry to docs/META_LEDGER.md
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

interface SealEntry {
  operation: string;
  persona: "Governor" | "Judge" | "Specialist";
  file?: string;
  details?: string;
}

function parseArgs(): { projectRoot: string; entry: SealEntry } {
  const args = Bun.argv.slice(2);
  let projectRoot = ".";
  const entry: SealEntry = {
    operation: "SESSION_CLOSE",
    persona: "Specialist",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--operation" && args[i + 1]) {
      entry.operation = args[i + 1];
      i++;
    } else if (arg === "--persona" && args[i + 1]) {
      entry.persona = args[i + 1] as SealEntry["persona"];
      i++;
    } else if (arg === "--file" && args[i + 1]) {
      entry.file = args[i + 1];
      i++;
    } else if (arg === "--details" && args[i + 1]) {
      entry.details = args[i + 1];
      i++;
    } else if (!arg.startsWith("--") && i === 0) {
      projectRoot = arg;
    }
  }

  return { projectRoot, entry };
}

function computeHash(previousHash: string, timestamp: string, operation: string, file: string | undefined, persona: string): string {
  const data = `${previousHash}|${timestamp}|${operation}|${file || ""}|${persona}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getPreviousHash(ledgerPath: string): string {
  if (!fs.existsSync(ledgerPath)) {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }

  const content = fs.readFileSync(ledgerPath, "utf-8");
  const hashMatches = content.match(/- \*\*Hash:\*\* `([^`]+)`/g);
  
  if (hashMatches && hashMatches.length > 0) {
    const lastMatch = hashMatches[hashMatches.length - 1];
    const hashMatch = lastMatch.match(/`([^`]+)`/);
    if (hashMatch) {
      return hashMatch[1];
    }
  }

  return "0000000000000000000000000000000000000000000000000000000000000000";
}

function seal() {
  const { projectRoot, entry } = parseArgs();
  const ledgerPath = path.join(projectRoot, "docs/META_LEDGER.md");

  if (!fs.existsSync(ledgerPath)) {
    console.error("❌ META_LEDGER.md not found. Run ql-bootstrap first.");
    process.exit(1);
  }

  const timestamp = new Date().toISOString();
  const previousHash = getPreviousHash(ledgerPath);
  const hash = computeHash(previousHash, timestamp, entry.operation, entry.file, entry.persona);

  const entryText = `

## Entry — ${timestamp.split("T")[0]}

- **Hash:** \`${hash}\`
- **Previous:** \`${previousHash}\`
- **Timestamp:** ${timestamp}
- **Operation:** ${entry.operation}
${entry.file ? `- **File:** ${entry.file}` : ""}
- **Persona:** ${entry.persona}
${entry.details ? `- **Details:** ${entry.details}` : ""}

---

`;

  fs.appendFileSync(ledgerPath, entryText, "utf-8");

  console.log(`🔐 Sealed entry to META_LEDGER.md`);
  console.log(`   Hash: ${hash.substring(0, 16)}...`);
  console.log(`   Operation: ${entry.operation}`);
  console.log(`   Persona: ${entry.persona}`);
}

seal();
