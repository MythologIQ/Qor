# Plan: Runtime Governance Enforcement via Central Execution Gate

**Version**: 1.0
**Date**: 2026-04-05
**Status**: DRAFT — Pending `/qor-audit`
**Chain**: QOR Runtime Governance Enforcement (Phase 1 Kernel)
**Risk Grade**: L2 (execution-layer enforcement + write-path interception)
**GitHub Issue**: MythologIQ/Qor#1

---

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Scope: Forge only or all write endpoints? | **B** — All 5 write endpoints. Shared gate, module-specific executors. |
| 2 | Gate location: API route, inline, or filesystem module? | **C** — Filesystem module (`evidence/governance-gate.ts`) imported by zo.space routes at build time. |
| 3 | Evidence strictness: full bundle, lite, or tiered? | **C** — Tiered. Full `EvidenceBundle` preferred, `GovernedEvidenceLite` accepted as transitional. Explicitly graded in ledger. |
| 4 | Ledger model: single, parallel, or authoritative-sequenced? | **C** — Dual-ledger with authoritative sequencing. Gate writes to `evidence/ledger.jsonl` first. Module ledgers are downstream, only written after ALLOW. |

---

## Open Questions

1. **`record-evidence` endpoint** — `/api/forge/record-evidence` exists but is a write endpoint that records evidence itself. Should it also pass through the gate, or is it exempt as an evidence-ingestion primitive? (Recommendation: exempt — recording evidence is not a state mutation, it's evidence creation.)

---

## Phase 1: Governance Gate + Evidence Types

### Affected Files

- `evidence/governance-gate.ts` — NEW: Central enforcement module
- `evidence/contract.ts` — ADD: `GovernedEvidenceLite` type, `GovernedActionInput` type, `GovernanceDecision` type

### Changes

**1a. Add types to `evidence/contract.ts`**

```typescript
export type GovernedEvidenceLite = {
  intent: string;
  justification: string;
  inputs: string[];
  expectedOutcome: string;
};

export type GovernedEvidence = EvidenceBundle | GovernedEvidenceLite;

export type EvidenceMode = "full" | "lite";

export interface GovernedActionInput {
  module: "forge" | "qora" | "victor" | "continuum";
  action: string;
  agentId: string;
  payload: Record<string, unknown>;
  evidence: GovernedEvidence;
  resource?: string;
  trustStage?: TrustStage;
}

export interface GovernanceDecision {
  decisionId: string;
  timestamp: string;
  module: string;
  action: string;
  result: Decision;
  evidenceMode: EvidenceMode;
  riskScore: number;
  riskCategory: RiskCategory;
  confidence: number;
  mitigation?: string;
  agentId: string;
}
```

**1b. Create `evidence/governance-gate.ts`**

The gate composes existing primitives:
- `evaluate()` from `evidence/evaluate.ts` for policy evaluation
- `appendEvidence()` from `evidence/log.ts` for unified ledger writes
- `validateEvidence()` for evidence validation (new, internal)

```typescript
import { randomUUID } from "node:crypto";
import { evaluate } from "./evaluate";
import { appendEvidence } from "./log";
import type {
  GovernedActionInput,
  GovernanceDecision,
  GovernedEvidence,
  GovernedEvidenceLite,
  EvidenceBundle,
  EvidenceMode,
  TrustStage,
} from "./contract";

function classifyEvidence(e: unknown): EvidenceMode | "invalid" {
  if (!e || typeof e !== "object") return "invalid";
  const obj = e as Record<string, unknown>;
  if ("entries" in obj && "sessionId" in obj && "intentId" in obj) return "full";
  if ("intent" in obj && "justification" in obj && "inputs" in obj && "expectedOutcome" in obj) return "lite";
  return "invalid";
}

function validateLite(e: GovernedEvidenceLite): boolean {
  return Boolean(
    e.intent?.trim() &&
    e.justification?.trim() &&
    Array.isArray(e.inputs) && e.inputs.length > 0 &&
    e.expectedOutcome?.trim()
  );
}

function validateFull(e: EvidenceBundle): boolean {
  return Boolean(
    e.id && e.sessionId && e.intentId &&
    Array.isArray(e.entries) && e.entries.length > 0
  );
}

export async function executeGovernedAction(
  input: GovernedActionInput
): Promise<{ decision: GovernanceDecision; allowed: boolean }> {
  const decisionId = `gov_${randomUUID().slice(0, 12)}`;
  const timestamp = new Date().toISOString();

  // 1. Classify evidence
  const mode = classifyEvidence(input.evidence);
  if (mode === "invalid") {
    const decision = buildDecision(decisionId, timestamp, input, "Block", mode, 0, "critical", 0, "Governance violation: missing or invalid evidence");
    recordDecision(decision);
    return { decision, allowed: false };
  }

  // 2. Validate evidence by mode
  const valid = mode === "full"
    ? validateFull(input.evidence as EvidenceBundle)
    : validateLite(input.evidence as GovernedEvidenceLite);

  if (!valid) {
    const decision = buildDecision(decisionId, timestamp, input, "Block", mode, 0, "critical", 0, "Governance violation: evidence failed validation");
    recordDecision(decision);
    return { decision, allowed: false };
  }

  // 3. Evaluate policy
  const evalResult = evaluate({
    action: input.action,
    agentId: input.agentId,
    resource: input.resource,
    context: input.payload,
    trustStage: input.trustStage || "kbt",
  });

  // 4. Build decision
  const decision = buildDecision(
    decisionId, timestamp, input,
    evalResult.decision, mode,
    evalResult.riskScore, evalResult.riskCategory,
    mode === "full" ? evalResult.confidence : evalResult.confidence * 0.7,
    evalResult.mitigation,
  );

  // 5. Record to evidence ledger (always, regardless of outcome)
  recordDecision(decision);

  return { decision, allowed: evalResult.decision === "Allow" };
}

function buildDecision(
  decisionId: string, timestamp: string, input: GovernedActionInput,
  result: any, evidenceMode: any, riskScore: number, riskCategory: any,
  confidence: number, mitigation?: string,
): GovernanceDecision {
  return {
    decisionId, timestamp,
    module: input.module,
    action: input.action,
    result,
    evidenceMode: evidenceMode === "invalid" ? "lite" : evidenceMode,
    riskScore, riskCategory, confidence,
    mitigation,
    agentId: input.agentId,
  };
}

function recordDecision(decision: GovernanceDecision): void {
  appendEvidence({
    kind: "PolicyDecision",
    source: `governance-gate/${decision.module}`,
    module: decision.module as any,
    payload: {
      decisionId: decision.decisionId,
      action: decision.action,
      result: decision.result,
      evidenceMode: decision.evidenceMode,
      riskScore: decision.riskScore,
      riskCategory: decision.riskCategory,
      confidence: decision.confidence,
      mitigation: decision.mitigation,
      agentId: decision.agentId,
    },
    confidence: decision.confidence,
  });
}
```

### Unit Tests

- `evidence/tests/governance-gate.test.ts`:
  - `classifyEvidence` returns "full" for valid EvidenceBundle shape
  - `classifyEvidence` returns "lite" for valid GovernedEvidenceLite shape
  - `classifyEvidence` returns "invalid" for null, empty object, partial object
  - `validateLite` rejects empty intent, empty inputs array, missing expectedOutcome
  - `validateFull` rejects missing entries, missing sessionId
  - `executeGovernedAction` blocks when no evidence provided
  - `executeGovernedAction` blocks when evidence fails validation
  - `executeGovernedAction` allows low-risk action with valid lite evidence
  - `executeGovernedAction` allows low-risk action with valid full bundle
  - `executeGovernedAction` blocks high-risk action even with valid evidence
  - `executeGovernedAction` records decision to evidence ledger regardless of outcome
  - `executeGovernedAction` returns lower confidence for lite evidence than full
  - `executeGovernedAction` returns `decisionId` that can be referenced by downstream writes

---

## Phase 2: Wire All 5 Write Endpoints

### Affected Files

- `/api/forge/create-phase` (zo.space route) — ADD: governance gate import + enforcement
- `/api/forge/update-task` (zo.space route) — ADD: governance gate import + enforcement
- `/api/forge/update-risk` (zo.space route) — ADD: governance gate import + enforcement
- `/api/qora/append-entry` (zo.space route) — ADD: governance gate import + enforcement
- `/api/qora/record-veto` (zo.space route) — ADD: governance gate import + enforcement

### Changes

**2a. Forge write pattern (3 endpoints)**

Each Forge endpoint gets the same structural change. Before the mutation logic, add:

```typescript
import { executeGovernedAction } from "/home/workspace/Projects/continuous/Qor/evidence/governance-gate";

// Inside handler, after auth check and body parse:
const { decision, allowed } = await executeGovernedAction({
  module: "forge",
  action: "phase.create",  // or "task.update" or "risk.update"
  agentId: body.agentId || "operator",
  payload: body,
  evidence: body.evidence,
  trustStage: body.trustStage || "kbt",
});

if (!allowed) {
  return c.json({
    error: "Governance violation",
    decision: decision.result,
    decisionId: decision.decisionId,
    mitigation: decision.mitigation,
  }, 403);
}
```

After successful mutation, the existing `appendLedger()` call gains a `governanceDecisionId` field:

```typescript
appendLedger({
  action: "create-phase",
  phaseId,
  name,
  governanceDecisionId: decision.decisionId,
});
```

Remove the fire-and-forget `fetch("http://localhost:3099/api/qor/evidence", ...)` calls — evidence recording is now handled by the gate.

**2b. Qora write pattern (2 endpoints)**

Same gate call, but the executor preserves Qora's hash-chain semantics:

```typescript
import { executeGovernedAction } from "/home/workspace/Projects/continuous/Qor/evidence/governance-gate";

// Inside handler, after auth check and body parse:
const { decision, allowed } = await executeGovernedAction({
  module: "qora",
  action: "ledger.append",  // or "veto.record"
  agentId: body.agentId || "operator",
  payload: body,
  evidence: body.evidence,
  trustStage: body.trustStage || "kbt",
});

if (!allowed) {
  return c.json({
    error: "Governance violation",
    decision: decision.result,
    decisionId: decision.decisionId,
    mitigation: decision.mitigation,
  }, 403);
}
```

Qora's chain append logic remains intact — the `computeHash`, `prevHash`, `seq` logic stays. The chain entry gains a `governanceDecisionId` field:

```typescript
const entry = {
  seq,
  timestamp: new Date().toISOString(),
  type,
  hash,
  prevHash,
  payload: payload || {},
  provenance: provenance || { source: "api", tier: 1, autonomyLevel: 1 },
  governanceDecisionId: decision.decisionId,
};
```

**2c. Remove redundant evidence fire-and-forget calls**

Delete the `try { await fetch("http://localhost:3099/api/qor/evidence", ...) } catch {}` blocks from all 3 Forge endpoints. The governance gate now handles evidence recording upstream.

### Unit Tests

- `curl` each endpoint WITHOUT `evidence` field → expect 403 with "Governance violation"
- `curl` each endpoint WITH valid lite evidence → expect 200 with `governanceDecisionId` in response
- `curl` each endpoint WITH invalid evidence (empty intent) → expect 403
- Verify `evidence/ledger.jsonl` gains a PolicyDecision entry for every call (both allowed and blocked)
- Verify Forge's `builder-console/ledger.jsonl` entries include `governanceDecisionId` after allowed writes
- Verify Qora's `qora/data/ledger.jsonl` entries include `governanceDecisionId` and chain integrity preserved
- Verify no writes reach module ledgers when governance returns Block

---

## Phase 3: Verification + Fail-Closed Proof

### Affected Files

- No new files — verification only

### Changes

**3a. Exhaustive bypass test**

For each of the 5 endpoints, verify:
- Request with no `evidence` field → 403
- Request with `evidence: {}` → 403
- Request with `evidence: { intent: "" }` → 403
- Request with valid auth + valid evidence + high-risk action → appropriate Block/Escalate
- Request with valid auth + valid evidence + normal action → 200

**3b. Ledger integrity check**

- Count entries in `evidence/ledger.jsonl` before and after test suite
- Every test call (allowed or blocked) should produce exactly one new evidence entry
- Every allowed module write should reference a valid `governanceDecisionId`

**3c. Legacy write path elimination**

- Grep all zo.space route code for direct `writeFileSync` calls to module ledgers that don't go through the gate
- Confirm: zero ungated write paths remain

### Unit Tests

- 5 endpoints × 5 test cases = 25 verification tests
- Ledger count assertion: `after - before === number of test calls`
- `governanceDecisionId` reference integrity: every module entry references a valid evidence entry

---

## Migration Steps

| # | Action | Risk |
|---|--------|------|
| 1 | Add types to `evidence/contract.ts` | Low |
| 2 | Create `evidence/governance-gate.ts` | Low |
| 3 | Write + run gate unit tests | Low |
| 4 | Wire `/api/forge/create-phase` through gate | Medium |
| 5 | Wire `/api/forge/update-task` through gate | Medium |
| 6 | Wire `/api/forge/update-risk` through gate | Medium |
| 7 | Wire `/api/qora/append-entry` through gate | Medium |
| 8 | Wire `/api/qora/record-veto` through gate | Medium |
| 9 | Remove fire-and-forget evidence calls from Forge endpoints | Low |
| 10 | Run fail-closed verification suite | — |
| 11 | Run ledger integrity verification | — |
| 12 | Update META_LEDGER + push to GitHub | — |

---

## Acceptance Criteria (from Issue #1)

| Criterion | Phase | How |
|---|---|---|
| No Forge API mutates state without evidence | Phase 2 | Gate rejects missing/invalid evidence with 403 |
| All writes pass through `executeGovernedAction` | Phase 2 | 5 endpoints import and call the gate |
| Evidence is validated before execution | Phase 1 | Gate validates by mode (full/lite) before policy eval |
| All writes recorded in `evidence/ledger.jsonl` | Phase 1-2 | Gate records every decision (allow + block) |
| System fails closed on violation | Phase 1 | Gate throws/returns Block on invalid evidence |
| Legacy ledgers no longer receive direct writes | Phase 2 | Module ledgers only written after gate ALLOW |
| Qora preserves hash-chain semantics | Phase 2 | Qora executor unchanged, gains `governanceDecisionId` |
| Evidence mode explicitly graded | Phase 1 | `evidenceMode: "full" | "lite"` in every decision |
| Module writes reference governance decision | Phase 2 | `governanceDecisionId` field in all module ledger entries |
