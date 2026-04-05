# Plan: Evidence Layer Integration

**Version**: 1.0  
**Date**: 2026-04-05  
**Status**: DRAFT — Pending `/qor-audit`  
**Chain**: Unified Governance Evidence  
**Risk Grade**: L2 (new API surfaces + evaluation engine)

---

## Problem Statement

QOR has three incompatible ledger formats (builder-console: 683 entries, victor-resident: 2,022 entries, qora/moltbook: 1 entry), governance YAML policies that are never evaluated, an empty `evidence/sessions/` directory, and no connection between Continuum's graph memory and governance decisions. Every entity records its own state independently with no unified evidence contract.

FailSafe-Pro's Rust crates define the proven architecture: typed evidence entries, append-only logs, evidence bundles at governance gates, and a deterministic evaluation engine. This plan ports that architecture to QOR's TypeScript layer.

---

## Decisions

1. **New unified evidence ledger** at `evidence/ledger.jsonl` — clean FailSafe-Pro-aligned schema. Existing ledgers (builder-console, victor-resident, qora) remain as legacy data sources (read-only).
2. **Full evaluation engine** ported from FailSafe-Pro's `decision.rs` — `score_action()`, `score_resource()`, `categorize_risk()`, `resolve_verdict()` with trust stage thresholds from YAML policies.
3. **Separate API endpoints** — `/api/qor/evaluate` for decisions, `/api/qor/evidence` for recording, `/api/qor/evidence/bundle` for materialization.

---

## Phase 1: Evidence Contract + Evaluation Engine (Filesystem)

### Affected Files

- `evidence/contract.ts` — Unified evidence types and interfaces
- `evidence/log.ts` — Append-only JSONL evidence log
- `evidence/evaluate.ts` — Governance evaluation engine (ported from FailSafe-Pro)
- `evidence/bundle.ts` — Evidence bundle materialization and completeness checking
- `evidence/tests/contract.test.ts` — Schema validation tests
- `evidence/tests/evaluate.test.ts` — Evaluation engine tests
- `evidence/tests/log.test.ts` — Append-only log tests
- `evidence/tests/bundle.test.ts` — Bundle completeness tests

### Changes

**`evidence/contract.ts`** — Unified types ported from FailSafe-Pro:

```typescript
export type EvidenceKind =
  | "CapabilityReceipt"
  | "PolicyDecision"
  | "TestResult"
  | "CodeDelta"
  | "ReviewRecord"
  | "ReleaseRecord"
  | "MemoryRecall";

export type Decision = "Allow" | "Block" | "Modify" | "Escalate" | "Quarantine";
export type TrustStage = "cbt" | "kbt" | "ibt";
export type RiskCategory = "none" | "low" | "medium" | "high" | "critical";

export interface EvidenceEntry {
  id: string;
  timestamp: string;
  kind: EvidenceKind;
  workCellId?: string;
  source: string;
  module: "victor" | "qora" | "forge" | "continuum" | "qor";
  payload: Record<string, unknown>;
  confidence: number;
}

export interface EvaluationRequest {
  action: string;
  agentId: string;
  resource?: string;
  context?: Record<string, unknown>;
  trustStage: TrustStage;
}

export interface EvaluationResponse {
  decision: Decision;
  riskScore: number;
  riskCategory: RiskCategory;
  trustStage: TrustStage;
  mitigation?: string;
  confidence: number;
  memoryContext?: unknown[];
}

export interface EvidencePolicy {
  requireTests: boolean;
  requireReview: boolean;
}

export interface BundleCompleteness {
  hasTests: boolean;
  hasReview: boolean;
  hasPolicyDecisions: boolean;
  hasCodeDeltas: boolean;
  missing: string[];
}

export interface EvidenceBundle {
  id: string;
  sessionId: string;
  intentId: string;
  workCellIds: string[];
  entries: EvidenceEntry[];
  confidence: number;
  completeness: BundleCompleteness;
  generatedAt: string;
}
```

**`evidence/evaluate.ts`** — Port of FailSafe-Pro `decision.rs`:

```typescript
import type { EvaluationRequest, EvaluationResponse, Decision, RiskCategory, TrustStage } from "./contract";

// Action risk scores — mirrors FailSafe-Pro's RiskConfig.action_scores
const ACTION_SCORES: Record<string, number> = {
  "file.read": 0.1,
  "file.write": 0.4,
  "file.delete": 0.6,
  "shell.execute": 0.8,
  "auth.modify": 0.95,
  "network.request": 0.5,
  "config.modify": 0.6,
  "phase.create": 0.3,
  "task.update": 0.2,
  "evidence.record": 0.1,
  "risk.update": 0.3,
};
const DEFAULT_UNKNOWN_SCORE = 0.5;

// Resource sensitivity patterns — mirrors FailSafe-Pro's ResourceModifiers
const CREDENTIAL_PATTERNS = [".env", "secret", "credential", "token", "key", "password"];
const SYSTEM_PATTERNS = ["/etc/", "/usr/", "/sys/"];
const CONFIG_PATTERNS = [".yaml", ".yml", ".toml", ".json", ".conf"];
const CREDENTIAL_BOOST = 0.3;
const SYSTEM_BOOST = 0.25;
const CONFIG_BOOST = 0.1;

// Trust stage thresholds — from governance/policies/*.yaml
interface TrustThresholds { allowCeiling: number; escalateCeiling: number; }
const TRUST_THRESHOLDS: Record<TrustStage, TrustThresholds> = {
  cbt: { allowCeiling: 0.3, escalateCeiling: 0.6 },
  kbt: { allowCeiling: 0.5, escalateCeiling: 0.75 },
  ibt: { allowCeiling: 0.7, escalateCeiling: 0.9 },
};

export function evaluate(request: EvaluationRequest): EvaluationResponse { ... }
export function scoreAction(action: string): number { ... }
function scoreResource(resource?: string): number { ... }
function categorizeRisk(score: number): RiskCategory { ... }
function resolveVerdict(riskScore: number, trustStage: TrustStage): Decision { ... }
function generateMitigation(decision: Decision, action: string): string | undefined { ... }
function calculateConfidence(request: EvaluationRequest): number { ... }
```

Exact function bodies mirror `decision.rs`:
- `scoreAction` — lookup in `ACTION_SCORES`, fallback to `DEFAULT_UNKNOWN_SCORE`
- `scoreResource` — credential/system/config pattern matching with boost values
- `categorizeRisk` — thresholds at 0.1/0.3/0.6/0.8 for none/low/medium/high/critical
- `resolveVerdict` — compare risk score against trust stage ceilings
- `calculateConfidence` — 0.9 (resource+context), 0.7 (partial), 0.5 (minimal)

**`evidence/log.ts`** — Append-only JSONL log:

```typescript
import type { EvidenceEntry, EvidenceKind } from "./contract";

export function appendEvidence(entry: EvidenceEntry): void { ... }
export function readEvidence(filter?: { kind?: EvidenceKind; module?: string; since?: string }): EvidenceEntry[] { ... }
export function getChainLength(): number { ... }
```

Path: `/home/workspace/Projects/continuous/Qor/evidence/ledger.jsonl`

**`evidence/bundle.ts`** — Bundle materialization:

```typescript
import type { EvidenceBundle, EvidenceEntry, EvidencePolicy, BundleCompleteness } from "./contract";

export function materialize(entries: EvidenceEntry[], sessionId: string, intentId: string, workCellIds: string[]): EvidenceBundle { ... }
export function checkCompleteness(bundle: EvidenceBundle, policy: EvidencePolicy): BundleCompleteness { ... }
```

### Unit Tests

**`evidence/tests/contract.test.ts`**:
- Validate `EvidenceEntry` requires all mandatory fields
- Validate `EvidenceKind` rejects unknown types
- Validate `EvaluationRequest` requires action + agentId + trustStage

**`evidence/tests/evaluate.test.ts`** (mirrors FailSafe-Pro's 11 test cases):
- `file.read` at CBT → Allow (risk < 0.3)
- `shell.execute` at CBT → Block (risk ≥ 0.8)
- `file.write` at CBT → Escalate (risk between 0.3-0.6)
- `file.write` at IBT → Allow (higher trust ceiling)
- `.env` resource → credential boost increases risk
- `/etc/passwd` at CBT → Block (system path + high risk)
- `auth.modify` at IBT → Block (always critical)
- Confidence reflects available context
- Mitigation present on Block, absent on Allow
- Custom action scores override defaults
- Unknown action defaults to 0.5

**`evidence/tests/log.test.ts`**:
- Append entry creates file if absent
- Append entry adds line to existing file
- Read with kind filter returns correct subset
- Read with module filter works
- Read with since filter works
- getChainLength returns correct count

**`evidence/tests/bundle.test.ts`**:
- Materialize creates bundle with correct metadata
- checkCompleteness flags missing tests when policy requires them
- checkCompleteness flags missing review when policy requires it
- Bundle with all evidence types returns empty missing array
- Confidence calculation averages entry confidences

---

## Phase 2: API Endpoints (zo.space routes)

### Affected Files

- `/api/qor/evaluate` — Governance evaluation endpoint
- `/api/qor/evidence` — Evidence recording endpoint
- `/api/qor/evidence/bundle` — Bundle materialization endpoint

### Changes

**`/api/qor/evaluate`** (route_type: api):

```
POST /api/qor/evaluate
Body: { action, agentId, resource?, context?, trustStage }
Response: { decision, riskScore, riskCategory, trustStage, mitigation?, confidence }
```

- Imports `evaluate()` from filesystem module
- No auth required (read-only evaluation, no side effects)
- Optionally queries Continuum graph for memory context via `/api/continuum/graph?endpoint=recall&q={action}`

**`/api/qor/evidence`** (route_type: api):

```
POST /api/qor/evidence  (bearer auth)
Body: { kind, source, module, workCellId?, payload, confidence? }
Response: { ok, id, timestamp }

GET /api/qor/evidence?kind=X&module=Y&since=Z&limit=N
Response: { entries: [...], total }
```

- POST requires bearer auth (`QOR_EVIDENCE_SECRET` from env)
- GET is public (read-only)
- Imports `appendEvidence()` and `readEvidence()` from filesystem module

**`/api/qor/evidence/bundle`** (route_type: api):

```
POST /api/qor/evidence/bundle  (bearer auth)
Body: { sessionId, intentId, workCellIds }
Response: { bundle: { id, entries, completeness, confidence, generatedAt } }
```

- Materializes bundle from evidence entries matching the given workCellIds
- Checks completeness against module's evidence policy (loaded from YAML)
- Returns completeness gaps so caller knows what's missing before gate

### Unit Tests

- POST `/api/qor/evaluate` with `file.read` at CBT returns `Allow`
- POST `/api/qor/evaluate` with `shell.execute` at CBT returns `Block`
- POST `/api/qor/evidence` without auth returns 401
- POST `/api/qor/evidence` with valid auth + body returns 200 + id
- GET `/api/qor/evidence` returns recorded entries
- GET `/api/qor/evidence?kind=PolicyDecision` filters correctly
- POST `/api/qor/evidence/bundle` materializes from recorded entries
- Bundle completeness reports missing tests when none recorded

---

## Phase 3: Wire Existing APIs to Evidence Layer

### Affected Files

- `/api/forge/update-task` — Record `CodeDelta` evidence on task completion
- `/api/forge/create-phase` — Record `PolicyDecision` evidence on phase creation
- `/api/forge/record-evidence` — Redirect to `/api/qor/evidence` (backward compat)
- `/qor/victor/audit` — Render real evidence entries instead of mock data

### Changes

**Forge write APIs**: After each successful write, POST to `/api/qor/evidence` with the appropriate `EvidenceKind`:
- `update-task` → `CodeDelta` (task status change is a code delta)
- `create-phase` → `PolicyDecision` (phase creation is a governance decision)
- `update-risk` → `PolicyDecision` (risk assessment is a governance decision)

**`/api/forge/record-evidence`**: Proxy to POST `/api/qor/evidence` with `module: "forge"`. Maintains backward compatibility.

**`/qor/victor/audit`**: Replace mock governance feed with real entries from `GET /api/qor/evidence?module=victor&limit=50`. Each entry renders as a card showing kind, timestamp, decision, and risk score.

### Unit Tests

- `update-task` triggers evidence recording (check evidence ledger has new entry)
- `create-phase` triggers evidence recording
- `/qor/victor/audit` page route returns 200
- Evidence entries from Forge appear in unified ledger

---

## Migration Steps

| # | Action | Risk |
|---|--------|------|
| 1 | Create `evidence/contract.ts` with all types | Low |
| 2 | Create `evidence/evaluate.ts` ported from FailSafe-Pro | Low |
| 3 | Create `evidence/log.ts` with append-only JSONL | Low |
| 4 | Create `evidence/bundle.ts` with materialization | Low |
| 5 | Create all 4 test files, verify passing | Low |
| 6 | Create `/api/qor/evaluate` zo.space route | Low |
| 7 | Create `/api/qor/evidence` zo.space route | Low |
| 8 | Create `/api/qor/evidence/bundle` zo.space route | Low |
| 9 | Wire Forge write APIs to evidence layer | Medium |
| 10 | Rewire `/qor/victor/audit` to real evidence | Medium |
| 11 | Verify all routes return 200, zero errors | — |
| 12 | Substantiate + push to GitHub | — |
