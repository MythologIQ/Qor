# ARCHITECTURE_PLAN: Deterministic Agent Autonomy

**Version**: 1.0.0-alpha  
**Phase**: ENCODE  
**Derived from**: CONCEPT.md (v1.0)  
**Governance**: Tier-2 (assisted) with autonomous fallback  

---

## Executive Summary

This blueprint defines the architecture for deterministic automation boundaries in agent heartbeats. It replaces the current "empty queue → ask user" fallthrough with a tiered autonomy ladder that self-derives work from context when the human operator is unavailable.

**Core change**: Add `autonomy_level` to the tier/mode/cadence triad, gating when user prompts are permitted.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT HEARTBEAT LOOP                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Poll Queue   │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │ Work found?   │
                    └───────┬───────┘
                    Yes /          \ No
                   /                \
                  ▼                  ▼
        ┌──────────────┐      ┌──────────────┐
        │ Execute Task │      │ Parse Mode   │
        └──────────────┘      └──────┬───────┘
                                     │
                          ┌─────────▼─────────┐
                          │ autonomy_level ∈  │
                          │ {FULL, ASSISTED}  │
                          └─────────┬─────────┘
                           FULL /    \ ASSISTED
                           /          \
                          ▼            ▼
                ┌────────────┐   ┌────────────┐
                │ Self-Derive│   │ Quarantine │
                │ from Obj   │   │ & Notify   │
                └────────────┘   └────────────┘
```

---

## 2. Component Definitions

### 2.1 Autonomy Level Enum

```typescript
enum AutonomyLevel {
  NONE = 0,        // All decisions require explicit user approval
  SUGGEST = 1,     // Propose actions, wait for user confirm
  ASSISTED = 2,    // Execute if context supports, else escalate
  FULL = 3,        // Self-derive, execute, report after
  DELEGATED = 4,   // Can spawn sub-agents, minimal reporting
}
```

### 2.2 Tier-to-Autonomy Mapping

| Tier | Default Autonomy | Overrideable? | Rationale |
|------|-----------------|---------------|-----------|
| 1 | `SUGGEST` | Yes | User wants guidance, may lack context |
| 2 | `ASSISTED` | Yes | User-assisted with fallback | **CURRENT STATE** |
| 3 | `FULL` | Yes | Autonomous operation expected |
| 4 | `DELEGATED` | No | Fully autonomous with delegation |

### 2.3 Mode/Autonomy Interaction Matrix

| Mode | + Tier 1 | + Tier 2 | + Tier 3 | + Tier 4 |
|------|----------|----------|----------|----------|
| `idle` | SUGGEST | SUGGEST | SUGGEST | SUGGEST |
| `review` | SUGGEST | SUGGEST | ASSISTED | FULL |
| `execute` | ASSISTED | **ASSISTED** | FULL | DELEGATED |
| `govern` | NONE | SUGGEST | SUGGEST | SUGGEST |

\*\* Tier 2 + execute is the current problematic state. Proposed fix: when cadence indicates unattended operation (≥ 10m), auto-promote to FULL for empty-queue scenarios.

---

## 3. Phase-Objective Auto-Derivation

### 3.1 Input Sources (in priority order)

```yaml
sources:
  1_phase_objective: "Memory Operator Surface and Ergonomic API"
  2_progress_delta: "142/156 tasks (91%)"
  3_blocker_list: ["Governance blocker", "No eligible Victor work"]
  4_builder_context: "Latest commits, open PRs, active projects"
  5_cadence_history: "Last N heartbeats, success rate"
```

### 3.2 Derivation Pipeline

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Parse Obj    │───▶│ Extract      │───▶│ Score        │
│ (NLP/regex)  │    │ Candidates   │    │ Relevance    │
└──────────────┘    └──────────────┘    └──────┬───────┘
                                               │
                                               ▼
                              ┌────────────────────────────┐
                              │  Generate Task Manifest    │
                              │  (title, desc, urgency)    │
                              └──────────────┬─────────────┘
                                             │
                               ┌─────────────▼─────────────┐
                               │  Submit to Queue         │
                               │  (hash for audit trail)   │
                               └───────────────────────────┘
```

### 3.3 Candidate Extraction Rules

| Phase Objective Fragment | Implicit Task |
|-------------------------|---------------|
| "Expose X through Y" | "Define operator surface for X" |
| "Ergonomic API" | "Design API contract for [component]" |
| "91% complete" | "Identify remaining 14 tasks" |
| "Memory system" | "Document persistence layer" |

---

## 4. Implementation Spec

### 4.1 Core Functions (TypeScript interfaces)

```typescript
// Location: QoreLogic/kernel/heartbeat/mod.ts

enum AutonomyLevel {
  NONE = 0,
  SUGGEST = 1,
  ASSISTED = 2,
  FULL = 3,
  DELEGATED = 4,
}

interface AgentContext {
  tier: number;
  mode: "idle" | "review" | "execute" | "govern";
  cadence: number; // minutes
  phase: { objective: string; name: string };
  progress: { completed: number; total: number };
  blockers: string[];
  builderContext: BuilderSnapshot;
}

interface HeartbeatResult {
  status: "EXECUTED" | "AUTO_DERIVED" | "QUARANTINE" | "USER_PROMPT";
  tasks?: Task[];
  provenanceHash?: string;
  error?: string;
}

interface DerivationResult {
  tasks: Task[];
  provenanceHash: string;
  confidence: number;
  sources: string[];
}
```

### 4.2 Main Heartbeat Logic

```typescript
async function heartbeat(ctx: AgentContext): Promise<HeartbeatResult> {
  const queue = await pollQueue();
  
  if (queue.hasWork()) {
    return executeFromQueue(queue.next());
  }
  
  return handleEmptyQueue(ctx);
}

async function handleEmptyQueue(ctx: AgentContext): Promise<HeartbeatResult> {
  const autonomy = deriveAutonomy(ctx);
  
  if (autonomy >= AutonomyLevel.ASSISTED) {
    const selfDerived = await deriveTasksFromContext(ctx);
    
    if (selfDerived.tasks.length > 0) {
      await submitToQueue(selfDerived.tasks);
      return {
        status: "AUTO_DERIVED",
        tasks: selfDerived.tasks,
        provenanceHash: selfDerived.provenanceHash,
      };
    }
    
    return enterQuarantine(ctx, "derivation_failed");
  }
  
  return requestUserInput(ctx);
}

async function deriveTasksFromContext(ctx: AgentContext): Promise<DerivationResult> {
  const sources = [
    parsePhaseObjective(ctx.phase.objective),
    analyzeProgressGaps(ctx.progress),
    inspectBlockers(ctx.blockers),
    scanBuilderBacklog(ctx.builderContext),
  ];
  
  const candidates = sources.flatMap(extractTaskCandidates);
  const scored = candidates.map(scoreWithContext);
  const selected = selectTopK(scored, 3);
  
  return {
    tasks: selected.map(formatAsTask),
    provenanceHash: hashDerivationChain(sources),
    confidence: computeConfidence(sources),
    sources: sources.map(s => s.type),
  };
}

function deriveAutonomy(ctx: AgentContext): AutonomyLevel {
  // Base autonomy from tier
  const baseFromTier = tierToAutonomy(ctx.tier);
  
  // Override based on mode
  const modeModifier = getModeModifier(ctx.mode, ctx.tier);
  
  // Promote for unattended operation
  const unattended = ctx.cadence >= 10;
  if (unattended && ctx.mode === "execute" && ctx.tier === 2) {
    return AutonomyLevel.FULL;
  }
  
  return Math.max(baseFromTier - modeModifier, 0);
}
```

---

## 5. Integration Points

| System | Component | Integration |
|--------|-----------|-------------|
| Meta Ledgers | Hash-chain | All derivations recorded with source hashes |
| Qora | Mindmap | Newly derived tasks appear as proposed nodes |
| Builder Console | Backlog | Auto-derived tasks flagged with `origin: auto` |
| Victor Shell | CLI | `--dry-run` flag to preview derivations |
| Heartbeat API | `/api/victor/project-state` | Exposes autonomy_level, derivation_history |

---

## 6. Acceptance Criteria

### 6.1 Functional Requirements

| ID | Requirement | Test Strategy |
|-----|-------------|---------------|
| F1 | Given tier=2, mode=execute, cadence=30m, when queue is empty Then self-derive tasks from phase objective WITHOUT user prompt | Unit test: mock context, assert AUTO_DERIVED status |
| F2 | Given tier=2, mode=execute, cadence=30m, when derivation fails Then enter_quarantine() with reason logged | Unit test: mock failed derivation, assert QUARANTINE |
| F3 | Given tier=1, any mode, when queue is empty Then prompt user (existing behavior preserved) | Regression test |
| F4 | All auto-derived tasks include provenance_hash in meta_ledger | Integration test |
| F5 | Cadence < 10m + tier=2 + execute = ASSISTED (not autom.  promotion) | Boundary test |

### 6.2 Non-Functional Requirements

| ID | Requirement | Threshold |
|-----|-------------|-----------|
| NF1 | Derivation latency | < 200ms p99 |
| NF2 | Hash computation | < 50ms per derivation |
| NF3 | Audit trail completeness | 100% of auto-derivations logged |
| NF4 | False positive rate | < 5% (tasks rejected by user after auto-execution) |

---

## 7. Risks & Mitigations (Updated)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Auto-derived tasks mismatch user intent | Medium | Low-Med | **Veto mechanism** (Section 4.4-4.5): UI button + API endpoint; 3+ vetoes in 24h triggers tier downgrade |
| Derivation produces low-quality tasks | Medium | Low | Confidence threshold; < 0.7 → quarantine |
| Performance degradation | Low | Med | Derivation cached; background pre-compute |
| Audit log bloat | Low | Low | TTL on derivation logs; compression |
| Circular derivation (A → B → A) | Low | Med | Hash dedupl.; max derivation depth = 3 |
| Veto API unavailable | Low | Critical | Fallback: local queue flag until sync |


---

## 8. Dependencies & Prerequisites

| Dependency | Status | Blocking? |
|------------|--------|-----------|
| Tier/mode/cadence triad already exposed | ✅ Yes | No |
| Meta ledger hash-chain infra | 📝 Draft | Yes |
| Qora mindmap update API | ✅ Yes | No |
| Builder backlog submission API | ✅ Yes | No |
| Phase objective parser (NLP/regex) | 📝 Needed | Yes |

---

## 9. Migration & Rollout

| Phase | Action | Timeline |
|-------|--------|----------|
| 1 | Deploy autonomy gate (NO self-derivation yet) | Week 1 |
| 2 | Add `--dry-run` to preview what WOULD be derived | Week 2 |
| 3 | Enable self-derivation with auto-quarantine (safe mode) | Week 3 |
| 4 | Remove quarantine gate for tier ≥ 2 + execute + cadence ≥ 30m | Week 4 |
| 5 | Retroactive: Adjust tier definitions if needed | Ongoing |

---

## 10. References

- CONCEPT.md (v1.0): Problem definition
- research/automation-determinism-research.md: Findings
- QoreLogic/kernel/heartbeat/mod.ts: Implementation target
- `/api/victor/project-state`: State exposure endpoint

---

**Status**: READY FOR AUDIT  
**Last Updated**: 2025-03-26  
**Ledger Hash**: pending

### 4.3 CLI Handler: `--dry-run` Flag

```typescript
// Location: QoreLogic/cli/heartbeat/dry-run.ts
// Entry: victor-shell --dry-run [options]

interface DryRunOptions {
  tier?: number;           // Override tier (default: from context)
  mode?: string;           // Override mode (default: from context)
  cadence?: number;        // Override cadence in minutes
  objective?: string;      // Override phase objective
  format?: "json" | "yaml" | "table"; // Output format
}

class DryRunCommand {
  async execute(opts: DryRunOptions): Promise<DryRunResult> {
    const ctx = buildMockContext(opts);
    const derivation = await deriveTasksFromContext(ctx);
    
    return {
      wouldCreate: derivation.tasks.length,
      tasks: derivation.tasks,
      confidence: derivation.confidence,
      sources: derivation.sources,
      autonomyLevel: deriveAutonomy(ctx),
      vetoAvailable: derivation.confidence < 0.7,
    };
  }
}

// CLI entry
deno runtime: main.ts
  .command("dry-run")
  .description("Preview what heartbeat would auto-derive without executing")
  .option("-t, --tier <n>", "Tier override")
  .option("-m, --mode <mode>", "Mode override")
  .option("-c, --cadence <min>", "Cadence in minutes")
  .option("-o, --objective <text>", "Phase objective override")
  .option("-f, --format <format>", "Output format: json, yaml, table")
  .action((opts) => new DryRunCommand().execute(opts));
```

### 4.4 UI Component: Veto Button

```typescript
// Location: zo/ui-shell/components/VetoButton.tsx
// Usage: Rendered on auto-derived task cards in Qora mindmap

interface VetoButtonProps {
  taskId: string;
  provenanceHash: string;
  derivedAt: string;
  onVeto: (result: VetoResult) => void;
}

interface VetoResult {
  taskId: string;
  vetoedAt: string;
  reason: "mismatch" | "low_quality" | "duplicate" | "other";
  feedback?: string;
  adjustedAutonomyLevel?: number; // System may downgrade tier
}

function VetoButton({ taskId, provenanceHash, derivedAt, onVeto }: VetoButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<VetoResult["reason"]>();
  const [feedback, setFeedback] = useState("");
  
  const handleVeto = async () => {
    const result: VetoResult = {
      taskId,
      vetoedAt: new Date().toISOString(),
      reason: reason!,
      feedback: feedback || undefined,
    };
    
    await fetch("/api/victor/veto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    
    onVeto(result);
    setIsOpen(false);
  };
  
  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="veto-btn"
        title="This task doesn't match my intent"
      >
        <XIcon /> Veto
      </button>
      
      {isOpen && (
        <Modal>
          <h3>Veto Auto-Derived Task</h3>
          <p>Task: {taskId.substring(0, 8)}...</p>
          <p>Derived: {new Date(derivedAt).toLocaleString()}</p>
          
          <label>Reason:</label>
          <select onChange={(e) => setReason(e.target.value as VetoResult["reason"])}>
            <option value="">Select...</option>
            <option value="mismatch">Doesn't match my intent</option>
            <option value="low_quality">Poor quality/unclear</option>
            <option value="duplicate">Already exists or covered</option>
            <option value="other">Other (describe below)</option>
          </select>
          
          <textarea 
            placeholder="Optional feedback..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          
          <div className="actions">
            <button onClick={() => setIsOpen(false)}>Cancel</button>
            <button onClick={handleVeto} disabled={!reason}>Confirm Veto</button>
          </div>
        </Modal>
      )}
    </>
  );
}
```

### 4.5 API Endpoint: POST /api/victor/veto

```typescript
// Location: zo/space/routes/api/victor/veto.ts
// Access: Authenticated user only

import type { Context } from "hono";

interface VetoPayload {
  taskId: string;
  vetoedAt: string;
  reason: "mismatch" | "low_quality" | "duplicate" | "other";
  feedback?: string;
}

interface VetoResponse {
  success: boolean;
  taskId: string;
  newStatus: "vetoed";
  autonomyImpact?: {
    previousLevel: number;
    newLevel: number;
    reason: string;
  };
}

export default async (c: Context) => {
  // Auth check
  const user = await requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  // Parse & validate payload
  const payload: VetoPayload = await c.req.json();
  const validation = validateVetoPayload(payload);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400);
  }
  
  // Mark task as vetoed
  await updateTaskStatus(payload.taskId, {
    status: "vetoed",
    vetoedAt: payload.vetoedAt,
    vetoReason: payload.reason,
    vetoFeedback: payload.feedback,
    vetoedBy: user.id,
  });
  
  // Log to meta-ledger
  const vetoHash = await logToMetaLedger({
    type: "VETO",
    taskId: payload.taskId,
    timestamp: payload.vetoedAt,
    reason: payload.reason,
  });
  
  // Check if autonomy adjustment needed
  const recentVetoes = await countRecentVetoes(user.id, "24h");
  let autonomyImpact: VetoResponse["autonomyImpact"] | undefined;
  
  if (recentVetoes >= 3) {
    const current = await getUserAutonomyLevel(user.id);
    const adjusted = Math.max(current - 1, 0);
    await updateAutonomyLevel(user.id, adjusted);
    autonomyImpact = {
      previousLevel: current,
      newLevel: adjusted,
      reason: `3+ vetoes in 24h (${recentVetoes} total)`,
    };
  }
  
  return c.json({
    success: true,
    taskId: payload.taskId,
    newStatus: "vetoed",
    autonomyImpact,
  } as VetoResponse);
};

// Helper: Validation
function validateVetoPayload(p: VetoPayload): { valid: boolean; error?: string } {
  if (!p.taskId || typeof p.taskId !== "string") {
    return { valid: false, error: "taskId required" };
  }
  if (!p.reason || !["mismatch", "low_quality", "duplicate", "other"].includes(p.reason)) {
    return { valid: false, error: "valid reason required" };
  }
  if (!p.vetoedAt || !Date.parse(p.vetoedAt)) {
    return { valid: false, error: "valid vetoedAt timestamp required" };
  }
  return { valid: true };
}
```
