#!/usr/bin/env bun
/**
 * ql-bootstrap — Initialize QoreLogic DNA in a project
 * 
 * Usage:
 *   bun ql-bootstrap.ts [project-root]
 * 
 * Creates:
 *   - .agent/staging/         — Staging directory for verdicts
 *   - docs/                   — Documentation directory
 *   - docs/META_LEDGER.md     — Cryptographic ledger
 *   - docs/CONCEPT.md         — Project concept (template)
 *   - docs/ARCHITECTURE_PLAN.md — Architecture plan (template)
 *   - docs/SYSTEM_STATE.md    — Current system state
 *   - docs/SHADOW_GENOME.md   — Failure mode log
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const PROJECT_ROOT = process.argv[2] || process.cwd();

const GENESIS_HASH = crypto.randomBytes(32).toString("hex");

const STRUCTURE = {
  ".agent/staging": "Staging directory for verdicts and checkpoints",
  "docs": "Documentation and DNA ledger",
};

const TEMPLATES: Record<string, string> = {
  "docs/META_LEDGER.md": `# META_LEDGER — QoreLogic DNA Chain

Cryptographic ledger of all governance operations.

---

## Genesis

- **Hash:** \`${GENESIS_HASH}\`
- **Previous:** \`0000000000000000000000000000000000000000000000000000000000000000\`
- **Timestamp:** ${new Date().toISOString()}
- **Operation:** GENESIS
- **Persona:** Governor

---

## Entries

*No entries yet. Each operation appends a signed hash to this chain.*

`,

  "docs/CONCEPT.md": `# CONCEPT

## Project Name

*[Enter project name]*

## Purpose

*[One paragraph: what does this project do and why?]*

## Success Criteria

*[How will we know this project is complete?]*

## Constraints

*[Time, budget, technology, or team constraints]*

## Stakeholders

- **Owner:** *[Who has final authority]*
- **Users:** *[Who will use this]*
- **Contributors:** *[Who builds this]*

---

*Fill in this document before proceeding to ARCHITECTURE_PLAN.md*
`,

  "docs/ARCHITECTURE_PLAN.md": `# ARCHITECTURE_PLAN

## System Overview

*[High-level architecture diagram description]*

## Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| *[name]* | *[purpose]* | *[tech]* |

## Data Flow

*[How data moves through the system]*

## Security Model

*[Authentication, authorization, data protection]*

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| *[name]* | *[version]* | *[purpose]* |

## Deployment

*[How this gets deployed]*

---

*Complete this document before entering Implement phase*
`,

  "docs/SYSTEM_STATE.md": `# SYSTEM_STATE

Current snapshot of the project structure.

Last updated: ${new Date().toISOString()}

\`\`\`
[Run \`ql-bootstrap\` again after major changes to update this snapshot]
\`\`\`
`,

  "docs/SHADOW_GENOME.md": `# SHADOW_GENOME

Failure modes and rejected approaches for learning purposes.

When a bypass is required or a complexity violation occurs, document it here.

---

*No failure modes recorded yet.*
`,
};

function bootstrap() {
  console.log(`🧬 QoreLogic Bootstrap`);
  console.log(`   Project: ${PROJECT_ROOT}\n`);

  // Create directories
  for (const [dir, description] of Object.entries(STRUCTURE)) {
    const fullPath = path.join(PROJECT_ROOT, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✅ Created: ${dir}/ — ${description}`);
    } else {
      console.log(`⏭️  Exists: ${dir}/`);
    }
  }

  // Create template files
  for (const [file, content] of Object.entries(TEMPLATES)) {
    const fullPath = path.join(PROJECT_ROOT, file);
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, "utf-8");
      console.log(`✅ Created: ${file}`);
    } else {
      console.log(`⏭️  Exists: ${file}`);
    }
  }

  // Create .gitkeep in staging
  const stagingKeep = path.join(PROJECT_ROOT, ".agent/staging/.gitkeep");
  if (!fs.existsSync(stagingKeep)) {
    fs.writeFileSync(stagingKeep, "", "utf-8");
  }

  // Update SYSTEM_STATE with current tree
  updateSystemState();

  console.log(`\n✅ Bootstrap complete.`);
  console.log(`\nNext steps:`);
  console.log(`  1. Fill in docs/CONCEPT.md`);
  console.log(`  2. Create docs/ARCHITECTURE_PLAN.md`);
  console.log(`  3. Run \`ql-check --all\` before committing`);
}

function updateSystemState() {
  const statePath = path.join(PROJECT_ROOT, "docs/SYSTEM_STATE.md");
  
  // Get directory tree (simplified)
  const tree: string[] = [];
  
  function walk(dir: string, prefix: string = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const filtered = entries.filter((e) => 
      !e.name.startsWith(".") && 
      e.name !== "node_modules" &&
      e.name !== "dist"
    );
    
    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      const connector = isLast ? "└── " : "├── ";
      tree.push(`${prefix}${connector}${entry.name}`);
      
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), prefix + (isLast ? "    " : "│   "));
      }
    }
  }

  walk(PROJECT_ROOT);

  const content = `# SYSTEM_STATE

Current snapshot of the project structure.

Last updated: ${new Date().toISOString()}

\`\`\`
${path.basename(PROJECT_ROOT)}/
${tree.join("\n")}
\`\`\`
`;

  fs.writeFileSync(statePath, content, "utf-8");
  console.log(`📝 Updated: docs/SYSTEM_STATE.md`);
}

bootstrap();
