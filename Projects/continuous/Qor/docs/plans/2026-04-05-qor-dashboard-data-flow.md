# Plan: Governance Gate Completion, Evidence Dashboard, and Trust Progression

**Version**: 1.0
**Date**: 2026-04-05
**Status**: DRAFT — Pending `/qor-audit`
**Chain**: Governance Arc (Gate → Visibility → Trust)
**Risk Grade**: L2 (write endpoint modification + new dashboard surfaces + contract additions)

---

## Problem Statement

The governance gate exists and enforces on 5 of 8 write endpoints (Forge + Qora). Three write endpoints remain ungated: `/api/victor/quarantine` (promote/reject), `/api/victor/heartbeat-cadence` (cadence change), and `/api/continuum/memory` (memory write). Additionally, governance decisions are invisible in the dashboard — "Governance: Active" is a static label, not live data. Finally, trust stages are hardcoded to `kbt` with no mechanism for agents to earn progression.

**Current state**:
- 5/8 write endpoints gated (inline governance in Forge + Qora routes)
- 3 write endpoints ungated (Victor quarantine, heartbeat-cadence, Continuum memory)
- 2 evidence intake routes exempt by design (`/api/qor/evidence`, `/api/forge/record-evidence`)
- 1 bundle materialization route (`/api/qor/evidence/bundle`) — read-only aggregation
- Dashboard shows zero governance data
- Trust stage hardcoded to `kbt` in all gated routes

---

## Design Decisions

### Decision 1: Gate scope
Gate the 3 remaining mutation endpoints. Evidence intake routes are **exempt** (see Decision 3).

### Decision 2: Inline vs import
Continue with inline governance (matching existing 5 routes). zo.space routes cannot import filesystem modules reliably at runtime. The filesystem `governance-gate.ts` remains the canonical reference implementation; inline copies mirror its logic.

### Decision 3: Evidence intake exemption (A — Ingestion contract)
Evidence routes (`/api/qor/evidence`, `/api/forge/record-evidence`) are **exempt from the standard mutation gate** because they are governance substrate primitives, not operational mutation endpoints. Gating them would create a recursive control problem (evidence required to submit evidence).

Instead, they get a `governance_intake_routes` policy class:
- **Schema validation** — reject malformed payloads
- **Source tagging** — every record includes `source_route`, `source_module`, `actor`, `ingestion_timestamp`, `ingestion_class: "primitive"`
- **Append-only** — no update/patch/delete semantics
- **No operational state mutation** — may only write evidence records
- **Record class distinction** — `ingestion_class: "primitive"` (direct intake) vs `ingestion_class: "decision"` (gate-emitted)

This keeps the exemption narrow, explicit, and constrained without leaving a governance hole.

### Decision 4: Dashboard data source
Add a new `/api/qor/governance-dashboard` endpoint that reads `evidence/ledger.jsonl` and aggregates governance decisions into dashboard-ready shape. The `/qor` shell consumes this alongside existing APIs.

---

## Phase 1: Gate Remaining Write Endpoints + Ingestion Contract

### Affected Routes

- `/api/victor/quarantine` — Add governance gate to POST (promote/reject actions)
- `/api/victor/heartbeat-cadence` — Add governance gate to POST (cadence change)
- `/api/continuum/memory` — Add governance gate to POST (memory write)
- `/api/qor/evidence` — Add ingestion contract validation + source tagging
- `/api/forge/record-evidence` — Add ingestion contract validation + source tagging

### Changes

**1a. Gate `/api/victor/quarantine` POST**

Add inline governance gate matching existing pattern. Action mapping:
- `action === "promote"` → action: `quarantine.promote`, risk: 0.3
- `action === "reject"` → action: `quarantine.reject`, risk: 0.2

Evidence required in POST body alongside existing `action`, `itemId`, `reviewNotes` fields. Gate runs before the store mutation. Decision recorded to `evidence/ledger.jsonl`.

**1b. Gate `/api/victor/heartbeat-cadence` POST**

Add inline governance gate. Action: `cadence.change`, risk: 0.4 (operational impact — changes agent scheduling). Evidence required. Gate runs before the Zo API call. Origin check remains as secondary defense.

**1c. Gate `/api/continuum/memory` POST**

Add inline governance gate. Action: `memory.write`, risk: 0.2 (low risk — append-only memory). Evidence required. Gate runs before filesystem write.

**1d. Ingestion contract for `/api/qor/evidence` POST**

Add to the existing POST handler:
- Validate payload against evidence schema (reject if `kind` not in allowed set, `source` empty, `module` not in allowed set)
- Tag every written record with `ingestion_class: "primitive"`, `source_route: "/api/qor/evidence"`, `actor` from auth header or `"anonymous"`
- Confirm append-only: POST already only appends (no PUT/PATCH/DELETE) — add explicit 405 for those methods
- Log intake validation failures as `EvidenceIntakeRejection` entries

**1e. Ingestion contract for `/api/forge/record-evidence` POST**

Same pattern:
- Validate `sessionId` and `kind` are present and valid
- Tag records with `ingestion_class: "primitive"`, `source_route: "/api/forge/record-evidence"`, `actor: "forge"`
- Append-only confirmation (already true)
- Log intake validation failures

**1f. Add action scores to `evidence/evaluate.ts`**

```typescript
"quarantine.promote": 0.3,
"quarantine.reject": 0.2,
"cadence.change": 0.4,
"memory.write": 0.2,
"ledger.append": 0.2,
"veto.record": 0.3,
```

**1g. Add `ingestion_class` field to `EvidenceEntry` in `evidence/contract.ts`**

```typescript
export interface EvidenceEntry {
  // ... existing fields ...
  ingestionClass?: "primitive" | "decision";
}
```

### Filesystem Changes

- `evidence/contract.ts` — Add `ingestionClass` to `EvidenceEntry`
- `evidence/evaluate.ts` — Add new action scores
- `evidence/log.ts` — Pass through `ingestionClass` on append
- `evidence/tests/ingestion-contract.test.ts` — NEW: validate intake schema, source tagging, rejection

### Unit Tests

- All 3 newly gated routes reject POST without evidence → 403
- All 3 newly gated routes accept POST with valid lite evidence → mutation proceeds
- `/api/qor/evidence` POST rejects malformed payload (missing `kind`) → 400
- `/api/qor/evidence` POST tags records with `ingestion_class: "primitive"`
- `/api/forge/record-evidence` POST rejects missing `sessionId` → 400
- PUT/PATCH/DELETE on evidence routes return 405
- Existing 5 gated routes still work (regression check)
- All 8 gated routes record decisions to `evidence/ledger.jsonl`

---

## Phase 2: Evidence-Driven Dashboard

### Affected Routes

- `/api/qor/governance-dashboard` — NEW: aggregates governance data
- `/qor` — Wire governance card to show live gate decisions
- `/qor/victor/governance` — Add governance decision feed

### Changes

**2a. Create `/api/qor/governance-dashboard` API**

Reads `evidence/ledger.jsonl`, filters for `PolicyDecision` entries, returns:

```json
{
  "summary": {
    "totalDecisions": 42,
    "allowed": 30,
    "blocked": 8,
    "escalated": 4,
    "approvalRate": 0.71,
    "lastDecisionAt": "2026-04-05T..."
  },
  "byModule": {
    "forge": { "allowed": 12, "blocked": 3, "escalated": 1 },
    "qora": { "allowed": 8, "blocked": 2, "escalated": 1 },
    "victor": { "allowed": 6, "blocked": 2, "escalated": 1 },
    "continuum": { "allowed": 4, "blocked": 1, "escalated": 1 }
  },
  "byAction": {
    "task.update": { "allowed": 10, "blocked": 1 },
    "phase.create": { "allowed": 5, "blocked": 2 }
  },
  "recentDecisions": [
    { "decisionId": "gov_...", "action": "task.update", "module": "forge", "result": "Allow", "timestamp": "...", "confidence": 0.63 }
  ],
  "intakeStats": {
    "totalPrimitiveRecords": 15,
    "rejectedIntakes": 2,
    "bySource": { "/api/qor/evidence": 10, "/api/forge/record-evidence": 5 }
  }
}
```

**2b. Update `/qor` dashboard shell**

Replace static "Governance: Active" label on each module card with live data:
- Approval rate (color-coded: green >80%, yellow 60-80%, red <60%)
- Last decision timestamp
- Decision count (allowed/blocked)

Add a "Governance" summary card to the dashboard showing aggregate stats across all modules.

**2c. Update `/qor/victor/governance` page**

Add a "Gate Decisions" tab alongside existing governance feed. Shows:
- Recent gate decisions (from `/api/qor/governance-dashboard`)
- Filter by module, action, result
- Decision detail on click (evidence mode, risk score, confidence, mitigation)

### Unit Tests

- `/api/qor/governance-dashboard` returns valid JSON with `summary`, `byModule`, `recentDecisions`
- Dashboard cards show real approval rates (not static labels)
- `/qor/victor/governance` renders decision feed

---

## Phase 3: Trust Stage Progression

### Affected Files

- `evidence/evaluate.ts` — Add trust stage resolution from evidence history
- `evidence/contract.ts` — Add `TrustProfile` type
- `evidence/trust-progression.ts` — NEW: trust stage calculation
- `evidence/tests/trust-progression.test.ts` — NEW
- All 8 gated zo.space routes — Replace hardcoded `kbt` with resolved trust stage

### Changes

**3a. Create `evidence/trust-progression.ts`**

Trust stage is earned, not assigned. Progression criteria:

| Stage | Criteria | Effect |
|-------|----------|--------|
| `cbt` (default) | New agent, <10 decisions | Strictest thresholds (allow < 0.3) |
| `kbt` | ≥10 decisions, ≥70% approval, 0 blocks in last 5 | Moderate thresholds (allow < 0.5) |
| `ibt` | ≥50 decisions, ≥85% approval, 0 blocks in last 20, ≥5 full-bundle submissions | Most permissive (allow < 0.7) |

Demotion rules:
- Any block demotes `ibt` → `kbt`
- 3 blocks in 10 decisions demotes `kbt` → `cbt`
- Demotion is logged as a `TrustDemotion` evidence entry

```typescript
export function resolveTrustStage(agentId: string): TrustStage
export function getTrustProfile(agentId: string): TrustProfile
export function checkDemotion(agentId: string, latestDecision: GovernanceDecision): TrustStage | null
```

**3b. Wire trust resolution into gated routes**

Replace `trustStage: "kbt"` in all 8 inline governance gates with:
```typescript
const trustStage = resolveTrustStage(agentId);
```

This reads the agent's decision history from `evidence/ledger.jsonl` and returns the earned stage.

**3c. Add trust data to governance dashboard**

Extend `/api/qor/governance-dashboard` response:
```json
{
  "trustProfiles": {
    "operator": { "stage": "kbt", "decisions": 42, "approvalRate": 0.71, "demotions": 0 }
  }
}
```

**3d. Show trust stage in `/qor` dashboard**

Each module card shows the agent's current trust stage with color indicator:
- `cbt` = red (restricted)
- `kbt` = yellow (standard)
- `ibt` = green (trusted)

### Unit Tests

- New agent defaults to `cbt`
- Agent with 10+ decisions and 70%+ approval → `kbt`
- Agent with 50+ decisions and 85%+ approval → `ibt`
- Block event demotes `ibt` → `kbt`
- 3 blocks in 10 demotes `kbt` → `cbt`
- Demotion writes `TrustDemotion` evidence entry
- All 8 gated routes use resolved trust stage (not hardcoded)

---

## Migration Steps

| # | Phase | Action | Risk |
|---|-------|--------|------|
| 1 | 1 | Add action scores to `evidence/evaluate.ts` | Low |
| 2 | 1 | Add `ingestionClass` to `evidence/contract.ts` | Low |
| 3 | 1 | Update `evidence/log.ts` to pass through `ingestionClass` | Low |
| 4 | 1 | Gate `/api/victor/quarantine` POST | Medium |
| 5 | 1 | Gate `/api/victor/heartbeat-cadence` POST | Medium |
| 6 | 1 | Gate `/api/continuum/memory` POST | Low |
| 7 | 1 | Add ingestion contract to `/api/qor/evidence` | Low |
| 8 | 1 | Add ingestion contract to `/api/forge/record-evidence` | Low |
| 9 | 1 | Write ingestion contract tests | Low |
| 10 | 1 | Verify all 8 gated routes enforce + all 2 intake routes validate | — |
| 11 | 2 | Create `/api/qor/governance-dashboard` | Low |
| 12 | 2 | Update `/qor` dashboard with live governance data | Medium |
| 13 | 2 | Update `/qor/victor/governance` with decision feed | Medium |
| 14 | 3 | Create `evidence/trust-progression.ts` + tests | Medium |
| 15 | 3 | Wire trust resolution into all 8 gated routes | Medium |
| 16 | 3 | Extend dashboard with trust profiles | Low |
| 17 | — | Substantiate + push to GitHub | — |

---

## Policy Split (Canonical Reference)

| Route Class | Examples | Enforcement | Record Class |
|---|---|---|---|
| **Standard mutation routes** | forge/create-phase, victor/quarantine, continuum/memory | `executeGovernedAction()` — allow/block/escalate, evidence required, decision written first | `ingestion_class: "decision"` |
| **Governance intake routes** | qor/evidence, forge/record-evidence | `validateEvidenceIngestion()` — schema check, source tag, append-only, no state mutation | `ingestion_class: "primitive"` |
| **Read-only routes** | forge/status, qora/entries, victor/project-state | No enforcement needed | N/A |
| **Bundle materialization** | qor/evidence/bundle | Auth-gated read aggregation | N/A |
