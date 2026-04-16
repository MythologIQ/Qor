# Plan: Config-Driven Path Resolution for QOR API Layer

**Version**: 1.0  
**Date**: 2026-04-01  
**Status**: DRAFT  
**Chain**: QOR API Data Layer Repair  
**Risk Grade**: L2 (filesystem migration + import path changes)

---

## Open Questions

1. **Kernel imports** — The `project-state` API uses `import` statements for TypeScript files (`hub.ts`, `promotion-gate.ts`, `execute-governance.ts`). zo.space routes are bundled at build time, so these imports resolve at build. Should we: (A) restore these kernel files to the new Qor structure and update the import paths, or (B) inline the needed functions directly into the API route to eliminate filesystem imports entirely?

## Phase 1: Restore Data + Create PATHS Config

### Affected Files

- `/api/victor/project-state` — Extract hardcoded paths into `PATHS` config, remap to new structure
- `/api/victor/projects` — Extract hardcoded paths into `PATHS` config, remap to new structure
- `/api/victor/chat` — No filesystem paths (calls project-state API) — **no changes needed**

### Changes

**1a. Restore data files from Trash to `Projects/continuous/Qor/`**

Copy (not move) the live data from Trash:
```
Trash/Builder/Builder/Zo-Qore/.qore/ → Qor/.qore/
Trash/Builder/Builder/Zo-Qore/Victor/.victor/ → Qor/victor/.victor/
Trash/Builder/Builder/Zo-Qore/Victor/AGENTS.md → Qor/victor/AGENTS.md
Trash/Builder/Builder/Zo-Qore/AGENTS.md → Qor/AGENTS.md
```

**1b. Restore kernel TypeScript files (for import resolution)**

```
Trash/Builder/Builder/Zo-Qore/Victor/kernel/memory/hub.ts → Qor/victor/src/kernel/memory/hub.ts
Trash/Builder/Builder/Zo-Qore/Victor/kernel/promotion-gate.ts → Qor/victor/src/kernel/promotion-gate.ts
Trash/Builder/Builder/Zo-Qore/Victor/kernel/memory/execute-governance.ts → Qor/victor/src/kernel/memory/execute-governance.ts
```

**1c. Create heartbeat runtime directory**

```
mkdir -p /tmp/victor-heartbeat
```

The heartbeat state files (`victor.json`, `forge.json`, `victor-shell-cadence.json`) are runtime artifacts written by the Victor heartbeat agent. They live in `/tmp/` and need to exist for the API to read them. If absent, the API already falls back to empty state.

**1d. Create `PATHS` config object — inject at top of each API route**

```typescript
const PATHS = {
  qorRoot: "/home/workspace/Projects/continuous/Qor",
  get projectsDir() { return `${this.qorRoot}/.qore/projects`; },
  get victorPhases() { return `${this.projectsDir}/victor-resident/path/phases.json`; },
  get builderPhases() { return `${this.projectsDir}/builder-console/path/phases.json`; },
  get victorLedger() { return `${this.projectsDir}/victor-resident/ledger.jsonl`; },
  get victorState() { return `${this.qorRoot}/victor/.victor/project-state.json`; },
  get rootAgents() { return `${this.qorRoot}/AGENTS.md`; },
  get victorAgents() { return `${this.qorRoot}/victor/AGENTS.md`; },
  heartbeatCandidates: [
    "/tmp/victor-heartbeat/victor.json",
    "/tmp/victor-heartbeat/forge.json",
  ],
  cadenceOverride: "/tmp/victor-heartbeat/victor-shell-cadence.json",
} as const;
```

**1e. Replace all hardcoded path constants in `/api/victor/project-state`**

Remove:
```
const PHASES_PATH = "/home/workspace/Projects/continuous/Zo-Qore/.qore/..."
const HEARTBEAT_STATE_CANDIDATES = [...]
const CADENCE_OVERRIDE_PATH = "..."
const VICTOR_LEDGER_PATH = "..."
const BUILDER_PHASES_PATH = "..."
const PROJECTS_DIR = "..."
```

Replace with `PATHS` references. Update the two `import` statements:
```
from "/home/workspace/Projects/continuous/Zo-Qore/Victor/kernel/..."
→ from "/home/workspace/Projects/continuous/Qor/victor/src/kernel/..."

from "/home/workspace/Projects/continuous/Builder/Zo-Qore/Victor/kernel/..."
→ from "/home/workspace/Projects/continuous/Qor/victor/src/kernel/..."
```

**1f. Replace all hardcoded path constants in `/api/victor/projects`**

Remove:
```
const ZOQORE_ROOT = "/home/workspace/Projects/continuous/Builder/Zo-Qore"
const ROOT_AGENTS_PATH = `${ZOQORE_ROOT}/AGENTS.md`
const VICTOR_AGENTS_PATH = `${ZOQORE_ROOT}/Victor/AGENTS.md`
const VICTOR_STATE_PATH = `${ZOQORE_ROOT}/Victor/.victor/project-state.json`
const BUILDER_PHASES_PATH = `${ZOQORE_ROOT}/.qore/projects/builder-console/path/phases.json`
const VICTOR_RESIDENT_PATH = `${ZOQORE_ROOT}/.qore/projects/victor-resident/path/phases.json`
```

Replace with `PATHS` references.

### Unit Tests

- `curl http://localhost:3099/api/victor/project-state` returns HTTP 200 with valid JSON (not 500)
- `curl http://localhost:3099/api/victor/projects` returns HTTP 200 with project data
- Response contains `victor.heartbeat.tier` field (proves kernel import resolved)
- Response contains `projects[0].subProjects` array (proves data files found)
- No hardcoded `Builder/Zo-Qore` or `Zo-Qore/` paths remain in either route source

---

## Phase 2: Verify End-to-End Data Flow

### Affected Files

- All `/qor/*` page routes that fetch from the APIs — verify they render live data

### Changes

**2a. Confirm page routes receive real data**

| Page Route | Data Source | Verify |
|---|---|---|
| `/qor` | `/api/victor/project-state` + `/api/mobile-qor-status` | Dashboard cards show tier, ticks, queue state |
| `/qor/victor` | `/api/victor/project-state` | Tier, cadence, phase, blockers, tier-3 criteria |
| `/qor/victor/governance` | `/api/victor/project-state` | Governance feed entries |
| `/qor/victor/audit` | `/api/victor/project-state` | Audit log entries |
| `/qor/forge` | `/api/victor/project-state` | Builder phases + tasks |
| `/qor/forge/projects` | `/api/victor/projects` | Project list with phases |

**2b. Screenshot verification at localhost:3099 for all 6 routes**

### Unit Tests

- All 6 page routes return HTTP 200
- `/api/victor/project-state` response is consumed correctly by `/qor/victor` page (no "Failed to load" state)
- `/api/victor/chat` still returns 401/405 correctly (auth unchanged)
