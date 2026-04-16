# Plan: Complete Forge Realization

**Version**: 1.0  
**Date**: 2026-04-02  
**Status**: DRAFT — Pending `/qor-audit`  
**Chain**: Forge Operational Independence  
**Risk Grade**: L2 (API surface creation + data sovereignty)

---

## Problem Statement

Forge is the least realized of the 4 QOR entities. It has 5 page routes that are **read-only shells borrowing Victor's API** (`/api/victor/project-state`). It has no write surfaces, no independent data pipeline, no API of its own, and its constellation mindmap uses hardcoded nodes instead of deriving from live project data.

**Current state**: 23 phases, 1 active ("Forge Source of Truth Realignment"), 2 planned phases with 8 tasks. 85% overall progress — but that 85% is Victor-driven work that happened *to* Forge, not *by* Forge.

---

## Architectural Principle

Forge mirrors the FailSafe-Pro orchestrator pattern. Where Victor owns governance evaluation, Forge owns **build execution**. Its data layer tracks:
- Projects (with nested sub-projects)
- Phases (with tasks, acceptance criteria, dependencies)
- Evidence (per-session, per-phase)
- Risks (explicit + derived)

---

## Target Architecture

### 1. Independent Data API: `/api/forge/status`

**Purpose**: Single endpoint returning all Forge-specific data, sourced from `Qor/forge/` and `.qore/projects/builder-console/`.

```typescript
const PATHS = {
  forgeRoot: "/home/workspace/Projects/continuous/Qor/forge",
  builderPhases: "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/path/phases.json",
  builderLedger: "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/ledger.jsonl",
  forgeGovernance: "/home/workspace/Projects/continuous/Qor/forge/docs/GOVERNANCE.md",
  forgeState: "/home/workspace/Projects/continuous/Qor/forge/state.json",
} as const;
```

**Response shape**:
```json
{
  "forge": {
    "name": "Forge",
    "progress": { "percent": 85, "completed": 82, "total": 96 },
    "activePhase": { ... },
    "phases": [ ... ],
    "tasks": { "active": [...], "queued": [...], "done": X },
    "risks": [ ... ],
    "dependencies": [ ... ],
    "milestones": [ ... ],
    "evidence": { "sessions": X, "latest": "..." },
    "mindmap": { "nodes": [...], "edges": [...], "metrics": {...} }
  },
  "projects": { ... },
  "ledger": { "totalEntries": X, "recent": [...] }
}
```

### 2. Concept-Derived Constellation

Nodes are NOT phases. They are **concepts** — ideas, components, architectural decisions, and thematic groupings that emerge from brainstorming. Phases and tasks are attached as metadata to relevant concept nodes.

Node derivation sources:
- `AGENTS.md` — Architecture section maps concepts to modules
- `builder-console/path/phases.json` — Tasks and phases attach to concept nodes as metadata
- Brainstorming artifacts — Concepts that haven't been formalized into phases yet
- Dependencies — Edges between concepts based on real dependency chains

**Concept node schema**:
```typescript
interface ConceptNode {
  id: string;
  label: string;
  description: string;
  status: 'seed' | 'sprouting' | 'growing' | 'mature' | 'dormant';
  children: ConceptNode[];
  metadata: {
    phases?: string[];     // Phase names that touch this concept
    tasks?: { total: number; done: number };
    risks?: string[];
    evidence?: number;     // Session count
  };
}
```

**Click behavior**: When a node is selected:
1. Camera focuses on the node
2. Immediate children and their connections remain visible
3. All other nodes dim to 20% opacity
4. A detail panel slides in showing:
   - Concept description
   - Linked phases with task progress
   - Active risks
   - Recent evidence entries
   - Roadmap data anchored to this concept's phases

**Initial concept seed** (derived from current architecture):
- Qor (hub) → Governance, Evidence, Shadow Genome
- Victor → Heartbeat, Memory, Evaluation, Quarantine
- Forge → Projects, Constellation, Phases, Roadmap
- Qora → Moltbook, Connector, Ledger
- EvolveAI → GG-CORE, Embeddings, GraphRAG

### 3. Write Surfaces (In Scope)

- `/api/forge/update-task` — Mark a task done/active/blocked (gated)
- `/api/forge/create-phase` — Add a new phase to a project (gated)
- `/api/forge/record-evidence` — Append to evidence log (gated)
- `/api/forge/update-risk` — Add/update a risk record (gated)

All gated by bearer auth. Token from `Settings > Advanced` → `FORGE_API_SECRET`.

### 4. Mobile Parity

| Feature | Desktop | Mobile |
|---|---|---|
| Constellation view | Full canvas + 3D tilt | Simplified 2D canvas |
| Node click | Focus + detail panel | Focus + bottom sheet |
| Detail panel | Side panel, always visible | Bottom sheet, swipe to dismiss |
| Zoom/pan | Mouse wheel + drag | Pinch + drag |
| Write actions | Inline forms | Full-screen modal forms |
| Sub-node visibility | All visible | Top 3-5, "show more" for rest |

### 5. Route Updates

| Route | Current | Target |
|---|---|---|
| `/qor/forge` | Fetches `/api/victor/project-state` | Fetches `/api/forge/status` |
| `/qor/forge/projects` | Fetches `/api/victor/project-state` | Fetches `/api/forge/status` |
| `/qor/forge/roadmap` | Fetches `/api/victor/project-state` | Fetches `/api/forge/status` |
| `/qor/forge/risks` | Fetches `/api/victor/project-state` | Fetches `/api/forge/status` |
| `/qor/forge/constellation` | Hardcoded + partial API data | Fully derived from `/api/forge/status` |

### 6. Filesystem Population

Currently empty stubs need real implementations:

```
forge/
├── src/
│   ├── api/
│   │   └── status.ts          ← NEW: Forge data aggregation
│   ├── mindmap/
│   │   └── derive.ts           ← NEW: Constellation node derivation
│   ├── projects/
│   │   └── manager.ts          ← NEW: Project CRUD operations
│   └── governance/
│       └── ledger.ts           ← NEW: Forge-specific ledger
├── tests/
│   ├── status.test.ts          ← NEW
│   └── derive.test.ts          ← NEW
└── state.json                  ← NEW: Runtime state
```

---

## Migration Steps

| # | Action | Risk |
|---|--------|------|
| 1 | Create `/api/forge/status` API route | Low |
| 2 | Wire it to read from `PATHS.forgeRoot` + `builder-console` data | Low |
| 3 | Update all 5 Forge page routes to fetch `/api/forge/status` | Low |
| 4 | Replace hardcoded constellation nodes with data-derived generation | Medium |
| 5 | Populate `forge/src/api/status.ts` with aggregation logic | Low |
| 6 | Populate `forge/src/mindmap/derive.ts` with node derivation | Medium |
| 7 | Create `forge/state.json` with current runtime state | Low |
| 8 | Verify all 5 routes render live data with zero errors | — |
| 9 | Substantiate + push to GitHub | — |

---

## Decisions (Confirmed)

1. **Write surfaces included** — Phase 2 APIs are in-scope for this cycle. Forge gets its own write endpoints gated by bearer auth.
2. **Constellation nodes are concept-derived** — Nodes represent concepts from brainstorming, not project phases. Phases and tasks are metadata *on* the concept nodes. Clicking a node focuses it and its immediate sub-nodes + connections, while showing an anchored detail panel with roadmap data relevant to that concept. The mindmap's purpose is to organize the random of brainstorming into something cohesive.
3. **Mobile mirrors desktop** — The mobile version uses the same data and concept structure but with a simplified layout (collapsed detail panel, touch-optimized zoom/pan, fewer visible sub-nodes). Close parity, not feature parity.
