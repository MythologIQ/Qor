#!/usr/bin/env bun
/**
 * ql-check — Run QoreLogic Tribunal Gates on files
 * 
 * Usage:
 *   bun ql-check.ts <file> [--operation read|write|create|delete]
 *   bun ql-check.ts --all [--project-root .]
 */

import { parseArgs } from "node:util";
import * as fs from "fs";
import * as path from "path";

// Import from qorelogic-gates (would be proper module import in real setup)
// For now, inline the core functions

type Persona = "Governor" | "Judge" | "Specialist";
type RiskLevel = "L1" | "L2" | "L3";
type Operation = "read" | "write" | "create" | "delete";

const RAZOR_CONFIG = {
  MAX_FUNCTION_LINES: 40,
  MAX_FILE_LINES: 250,
  MAX_INDENT_DEPTH: 3,
};

const SECURITY_PATHS = [
  /\/security\//i,
  /\/auth\//i,
  /\/pii\//i,
  /\/secrets\//i,
  /\/credentials\//i,
];

const SECURITY_PATTERNS = [
  { pattern: /\/\/\s*TODO/i, name: "TODO" },
  { pattern: /\/\/\s*FIXME/i, name: "FIXME" },
  { pattern: /\/\/\s*HACK/i, name: "HACK" },
  { pattern: /pass\s*[=:]\s*['"`][^'"`]+['"`]/i, name: "HARDCODED_PASSWORD" },
  { pattern: /api[_-]?key\s*[=:]\s*['"`][^'"`]+['"`]/i, name: "HARDCODED_API_KEY" },
  { pattern: /secret\s*[=:]\s*['"`][^'"`]+['"`]/i, name: "HARDCODED_SECRET" },
];

interface Violation {
  type: string;
  message: string;
  file: string;
  line?: number;
  severity: "error" | "warning" | "info";
}

// Razor enforcement
function enforceRazor(content: string, filePath: string): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split("\n");

  if (lines.length > RAZOR_CONFIG.MAX_FILE_LINES) {
    violations.push({
      type: "FILE_LENGTH",
      message: `File exceeds ${RAZOR_CONFIG.MAX_FILE_LINES} lines (${lines.length})`,
      file: filePath,
      severity: "error",
    });
  }

  // Simplified function length check
  let inFunction = false;
  let functionStart = 0;
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFunction && /function\s+\w+|=>\s*{|\(\s*\)\s*{/.test(line)) {
      inFunction = true;
      functionStart = i;
      braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
    } else if (inFunction) {
      braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceCount <= 0) {
        const length = i - functionStart + 1;
        if (length > RAZOR_CONFIG.MAX_FUNCTION_LINES) {
          violations.push({
            type: "FUNCTION_LENGTH",
            message: `Function exceeds ${RAZOR_CONFIG.MAX_FUNCTION_LINES} lines (${length})`,
            file: filePath,
            line: functionStart + 1,
            severity: "error",
          });
        }
        inFunction = false;
      }
    }
  }

  return violations;
}

// Security stub detection
function detectSecurityStubs(content: string, filePath: string): { violations: Violation[]; riskLevel: RiskLevel } {
  const violations: Violation[] = [];
  const isSecurityPath = SECURITY_PATHS.some((p) => p.test(filePath));

  if (!isSecurityPath) {
    return { violations, riskLevel: "L1" };
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const { pattern, name } of SECURITY_PATTERNS) {
      if (pattern.test(lines[i])) {
        violations.push({
          type: "SECURITY_ISSUE",
          message: `Security issue detected (${name})`,
          file: filePath,
          line: i + 1,
          severity: "error",
        });
      }
    }
  }

  return { violations, riskLevel: "L3" };
}

// Main tribunal gate
function tribunalGate(content: string, filePath: string, operation: Operation): {
  allowed: boolean;
  persona: Persona;
  violations: Violation[];
  riskLevel: RiskLevel;
} {
  const violations: Violation[] = [];
  const isSecurityPath = SECURITY_PATHS.some((p) => p.test(filePath));
  const persona: Persona = isSecurityPath ? "Judge" : "Specialist";

  if (operation === "read") {
    return { allowed: true, persona, violations: [], riskLevel: "L1" };
  }

  // Apply Razor
  violations.push(...enforceRazor(content, filePath));

  // Apply Security Detection
  const securityResult = detectSecurityStubs(content, filePath);
  violations.push(...securityResult.violations);

  const hasErrors = violations.some((v) => v.severity === "error");

  return {
    allowed: !hasErrors && !isSecurityPath,
    persona,
    violations,
    riskLevel: securityResult.riskLevel,
  };
}

// CLI
const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    operation: {
      type: "string",
      default: "write",
    },
    "project-root": {
      type: "string",
      default: ".",
    },
    all: {
      type: "boolean",
      default: false,
    },
    json: {
      type: "boolean",
      default: false,
    },
  },
  strict: false,
});

const operation = values.operation as Operation;
const projectRoot = values["project-root"] || ".";
const useJson = values.json;

function formatResult(result: ReturnType<typeof tribunalGate>, filePath: string) {
  if (useJson) {
    return JSON.stringify({ file: filePath, ...result }, null, 2);
  }

  const status = result.allowed ? "✅ PASS" : "❌ BLOCK";
  const lines = [
    `${status} ${filePath}`,
    `  Persona: ${result.persona}`,
    `  Risk: ${result.riskLevel}`,
  ];

  if (result.violations.length > 0) {
    lines.push(`  Violations:`);
    for (const v of result.violations) {
      lines.push(`    [${v.severity.toUpperCase()}] Line ${v.line || "?"
}: ${v.message}`);
    }
  }

  return lines.join("\n");
}

// Run checks
if (values.all) {
  // Check all .ts/.tsx files in project
  const files: string[] = [];
  
  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(projectRoot);

  let passCount = 0;
  let failCount = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const result = tribunalGate(content, file, operation);
    console.log(formatResult(result, file));
    
    if (result.allowed) {
      passCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\n📊 Summary: ${passCount} passed, ${failCount} blocked`);
  process.exit(failCount > 0 ? 1 : 0);
} else {
  // Check single file
  const filePath = positionals[0];
  if (!filePath) {
    console.error("Usage: ql-check <file> [--operation read|write|create|delete]");
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const result = tribunalGate(content, absolutePath, operation);
  console.log(formatResult(result, absolutePath));
  
  process.exit(result.allowed ? 0 : 1);
}
