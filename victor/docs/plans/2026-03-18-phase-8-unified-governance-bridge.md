# Phase 8: Unified Governance Bridge

**Phase ID:** `phase_victor_unified_governance`  
**Project:** victor-resident  
**Ordinal:** 4  
**Created:** 2026-03-18  
**Status:** Planning

---

## Objective

Bridge Victor's quarantine pipeline and execute-pilot infrastructure into a unified governance layer that governs all automated actions—whether from idle exploration, scheduled execution, or user-triggered automation—under a single consistent policy framework.

---

## Rationale

Current state:
- Phase 7 (Quarantine Pipeline): Content flows through fetch→sanitize→scan→gate→store
- Phase 3 (Execute Pilot): Bounded unattended execution with verification packets
- These systems operate independently with different governance surfaces

Gap: No unified mechanism to apply consistent policies across both content ingestion and action execution. Phase 8 creates the governance bridge that treats both content and actions as governed entities subject to the same trust tiers, confidence caps, and audit trails.

---

## Tasks

### Task 1: Unified Governance Policy Framework
**Task ID:** `task_unified_policy_framework`

Define a single policy schema that can govern both content admission and action execution.

**Acceptance:**
- Policy schema supports both content trust tiers (internal, external-verified, external-untrusted) and action risk levels (low, medium, high)
- Policy defines confidence thresholds per tier/level combination
- Policy defines required scan categories for content vs required verification steps for actions
- Policy is versioned and auditable

**Depends On:** Phase 7 quarantine types, Phase 3 execute-pilot bounds

---

### Task 2: Governance Decision Engine
**Task ID:** `task_governance_decision_engine`

Build a unified decision engine that evaluates both content admission requests and action execution requests against the policy framework.

**Acceptance:**
- Single evaluate() method handles both ContentAdmissionRequest and ActionExecutionRequest
- Returns consistent GovernanceDecision type with verdict (approve, quarantine, reject), confidence, and reasoning
- Integrates with existing quarantine-gate.ts for content and execute-pilot.ts for actions
- Decision audit trail written to unified ledger

**Depends On:** Task 1

---

### Task 3: Unified Audit Ledger
**Task ID:** `task_unified_audit_ledger`

Extend the quarantine audit ledger to record all governance decisions—content and actions—in a single queryable history.

**Acceptance:**
- Ledger entries support both content events (fetch, scan, gate) and action events (tick start, action begin, action complete, tick end)
- Query API filters by event type, verdict, project, timestamp range
- Unified export produces coherent timeline of all governed activity
- Retention policies apply consistently across event types

**Depends On:** Phase 7 quarantine-audit.ts

---

### Task 4: Cross-Domain Policy Enforcement
**Task ID:** `task_cross_domain_policy`

Ensure policy constraints flow correctly between content and action domains—e.g., external-untrusted content triggers higher scrutiny on derived actions.

**Acceptance:**
- Content trust tier influences action risk assessment (external-untrusted content → higher bar for actions that reference it)
- Action audit records reference source content IDs where applicable
- Policy violations in one domain can trigger review requirements in the other
- No circular dependencies between content and action evaluation

**Depends On:** Task 2, Task 3

---

### Task 5: Unified Governance CLI
**Task ID:** `task_unified_governance_cli`

Create a command-line interface for governance operations: policy inspection, manual ledger queries, emergency revocation, and audit export.

**Acceptance:**
- CLI supports `inspect-policy`, `query-ledger`, `revoke-run`, `export-audit` commands
- Commands accept project-id and time range filters
- Output formats: human-readable, JSON, JSONL
- Exit codes indicate success (0), policy violation found (2), or error (1)

**Depends On:** Task 2, Task 3

---

## Success Criteria

Phase 8 complete when:
1. Single policy framework governs both content and actions
2. All governance decisions flow through unified decision engine
3. Complete audit history queryable across content and action events
4. Cross-domain policy enforcement active and tested
5. CLI provides operational control over unified governance

---

## Dependencies

**Hard Dependencies (must be complete):**
- Phase 7 Moltbook Quarantine Pipeline (8/8 tasks complete)
- Phase 3 Bounded Unattended Execute Pilot (3/3 tasks complete)
- Builder Console Phase 5 Quarantine Visibility UI (5/5 tasks complete)

**Soft Dependencies (provide useful context):**
- execute-pilot.ts kill switch and verification packets
- quarantine-audit.ts ledger with export capability
- quarantine-gate.ts trust tier and confidence cap logic

---

## Out of Scope

The following are NOT part of Phase 8 and should be deferred to future phases:
- Actual promotion to Tier 2 (15m cadence) — requires 50 productive ticks first
- Expansion to additional projects beyond Victor/Zo-Qore — requires 200 ticks first
- Self-modifying governance rules — user approval always required for policy changes
- Automated policy optimization — policy changes are explicit user decisions

---

## Next Actions

1. **This Session:** Create Phase 8 planning document (this file) — complete
2. **Next Session:** Add Phase 8 to victor-resident phases.json with task definitions
3. **Following Sessions:** Begin Task 1 (Unified Governance Policy Framework)

---

*Phase 8 planning complete. Ready to add to phases.json and begin implementation.*
