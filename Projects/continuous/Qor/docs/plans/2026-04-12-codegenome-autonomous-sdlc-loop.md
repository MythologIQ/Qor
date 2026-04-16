# Plan: CodeGenome Autonomous SDLC Loop

**Version**: 1.0  
**Date**: 2026-04-12  
**Status**: DRAFT  
**Chain**: CodeGenome / Autonomous SDLC / Mutation Governance  
**Risk Grade**: L3 (self-modification, memory integrity, staged promotion, and governance-critical runtime evolution)

---

## Intent

This document defines a separate build track for an autonomous SDLC loop layered on top of the QOR agent harness.

The objective is not to let the system freely optimize itself. The objective is to let the system propose, test, evaluate, govern, version, and selectively promote changes to behavior and memory without losing coherence or violating policy.

Traditional SDLC evolves code. This loop evolves behavior, reasoning structures, and memory state. That changes the failure modes. Silent degradation, authority creep, and memory corruption are more dangerous than obvious crashes. This plan exists to force those changes through production-grade discipline.

## Core Rule

The loop is a system, not a feature.

If it can mutate live behavior, memory, or reasoning structures without observability, reversibility, and governance, it is not an autonomous SDLC loop. It is just unbounded drift with better marketing.

## Relationship to Existing QOR Work

This plan builds on the QOR agent harness roadmap rather than replacing it.

- The harness control surface, identity model, orchestration, tool gateway, and Continuum partitions are prerequisites.
- CodeGenome focuses on controlled self-improvement after those boundaries exist.
- QOR remains final authority on promotion and adoption decisions.

## Build Surfaces

- `evidence/` for mutation receipts, evaluations, governance decisions, and experiment records
- `continuum/` for versioned memory state, diffing, and rollback semantics
- `victor/` for orchestration, proposal flow, sandbox coordination, and promotion logic
- `forge/` for lifecycle visibility, promotion tracking, and SDLC alignment
- `docs/` for schemas, operating rules, and experimental baselines

## Phase Breakdown

### Phase 1: Reframe the Loop as an Operational System

The first task is architectural reframing.

Treat the loop as the mechanism by which the platform changes over time, not as an optimization feature hidden inside another subsystem. Every iteration must be observable, testable, and reversible.

**What to build**
- Lifecycle definition for proposal, evaluation, governance, staged promotion, and rollback
- Controlled environment boundaries for mutation work
- Explicit operating rules for when the loop may run and what it may touch

**Why it exists**
- This establishes the loop as governed infrastructure rather than experimental automation
- It prevents direct mutation of live state without process

**Acceptance signals**
- The lifecycle is explicitly modeled and documented
- No direct-to-production mutation path exists
- The loop has visible state and operator-facing status

### Phase 2: Construct the Mutation Engine as a First-Class Component

The mutation engine proposes change. It does not authorize change.

Every mutation must be expressed as a structured proposal artifact with explicit target, rationale, hypothesis, and success criteria. Mutation output must be treated as untrusted until tested and governed.

**What to build**
- Mutation proposal schema
- Proposal generator flow
- Proposal storage and identifiers
- Proposal validation before sandbox execution

**Why it exists**
- It externalizes reasoning into inspectable artifacts
- It prevents the system from mutating itself implicitly
- It creates a pull-request style boundary for cognition changes

**Acceptance signals**
- Mutations are stored as structured proposals
- Proposals identify target surface, rationale, measurement plan, and rollback expectations
- Invalid or underspecified proposals are rejected before execution

### Phase 3: Establish a True Sandbox Environment

The sandbox is a containment boundary, not a convenience.

It must replicate production-relevant conditions closely enough to surface problems before promotion, while preventing side effects from escaping into live systems.

**What to build**
- Sandbox runtime for isolated mutation trials
- Continuum snapshot or replica strategy for evaluation input state
- Simulated or gated tool interaction paths
- Isolation rules for outbound effects

**Why it exists**
- Mutations are assumed unsafe until proven otherwise
- Shallow sandboxes create false positives and dangerous promotions

**Acceptance signals**
- Sandbox execution cannot mutate live memory or behavior directly
- Sandbox state can be seeded from production-relevant replicas
- Tool behavior in sandbox is realistic enough to reveal likely failures

### Phase 4: Design Evaluation as a Multi-Dimensional Process

Evaluation cannot collapse into one score.

Each mutation must be judged across multiple layers: performance, structural memory integrity, role-constrained behavior, and governance compliance.

**What to build**
- Performance evaluation lane for correctness, latency, and efficiency
- Structural evaluation lane for memory integrity and classification preservation
- Behavioral evaluation lane for role compliance and authority boundaries
- Governance evaluation lane for policy adherence
- Aggregation logic that requires all critical lanes to pass

**Why it exists**
- A mutation can improve one metric while damaging the system elsewhere
- Cross-dimensional gating is how self-improvement stays bounded

**Acceptance signals**
- Evaluation produces explicit results for each lane
- A mutation cannot pass overall if a critical lane fails
- Evaluation artifacts are stored and attributable

### Phase 5: Integrate QOR as the Final Authority

Even successful evaluation is not enough.

Every candidate mutation must still pass through a non-bypassable QOR decision point that judges the change according to risk, authority boundaries, and ambiguity in enforcement.

**What to build**
- Mutation-governance decision schema
- QOR review hook for accepted candidates
- Risk-profile comparison between current and proposed states
- Explicit rejection reasons for governance failures

**Why it exists**
- Optimization pressure can work against control
- QOR must remain final authority over capability expansion and risk shifts

**Acceptance signals**
- No mutation can be promoted without a QOR decision artifact
- Governance can reject performance-improving changes on risk grounds
- The mutation loop cannot bypass this gate

### Phase 6: Version Continuum Memory as a Living System

Approved changes are committed, not merely applied.

Continuum must behave as a versioned living system where changes are attributable, diffable, and reversible. Snapshots alone are not enough; selective rollback and state inspection matter.

**What to build**
- Version identifiers for memory state
- Diff representation for memory mutations
- Selective rollback capability
- Attribution linking proposals, evaluations, and applied versions

**Why it exists**
- Memory now evolves like source code
- Recovery depends on understanding exactly what changed and why

**Acceptance signals**
- Memory changes can be inspected as diffs
- The system can roll back selectively rather than only wholesale
- Every applied mutation maps back to proposal and governance artifacts

### Phase 7: Build an Experiment Registry for Transparency

Every mutation attempt must be recorded, including failed ones.

The registry becomes the source of truth for how the loop behaves over time and how evaluation criteria should evolve.

**What to build**
- Experiment registry schema
- Recording of proposal, evaluation, governance decision, promotion status, and outcome
- Query surfaces for analysis and review

**Why it exists**
- Failed attempts are operationally valuable
- Without this registry, the system becomes opaque and hard to reason about

**Acceptance signals**
- Every mutation attempt creates a registry entry
- Registry entries link all relevant artifacts end to end
- Operators can inspect historical experiments and outcomes

### Phase 8: Detect and Manage Drift

Even a well-governed system can drift through accumulation.

Define baseline scenarios that represent expected behavior and periodically replay them against the current system. Deviations should trigger investigation rather than being silently accepted.

**What to build**
- Baseline scenario library
- Periodic replay mechanisms
- Drift detection logic with thresholds
- Investigation and escalation path for meaningful deviation

**Why it exists**
- Incremental mutations can accumulate into unintended behavior change
- Drift detection protects consistency across time

**Acceptance signals**
- Baseline scenarios exist and are re-runnable
- Deviation is measured against explicit thresholds
- Drift findings are traceable into experiment and governance records

### Phase 9: Promote Changes Through Staged Deployment

A mutation that passes evaluation and governance is still not immediately trusted.

Promote changes gradually through a subset of tasks, agents, or environments and compare behavior against the current system before broader rollout.

**What to build**
- Staged promotion workflow
- Partial rollout targeting
- Comparative performance and safety monitoring
- Rollback triggers for promotion failures

**Why it exists**
- Real-world behavior can differ from sandbox behavior
- Controlled promotion reduces blast radius

**Acceptance signals**
- Mutations can be canaried to bounded slices of work
- Comparative signals determine promote, hold, or rollback outcomes
- Rollback is fast and traceable

### Phase 10: Define Termination and Safety Boundaries

The loop must not run indefinitely.

Define explicit pause and stop conditions based on repeated policy violations, no measurable improvement, degradation in core metrics, or unstable mutation behavior.

**What to build**
- Termination criteria
- Safety pause states
- Escalation paths for unsafe loop behavior
- Operator-visible loop health state

**Why it exists**
- Optimization loops can become unproductive or unsafe
- A bounded loop is governable; an endless loop is not

**Acceptance signals**
- The loop can pause automatically on defined conditions
- Operators can see why the loop stopped or paused
- Re-entry requires explicit conditions rather than silent resume

### Phase 11: Integrate with the Broader SDLC

The autonomous loop must integrate with the existing engineering lifecycle.

Changes should move through development, staging, and production in alignment with the broader platform, with environment-appropriate evaluation and promotion checks.

**What to build**
- Environment-aware mutation lifecycle
- CI/CD integration for mutation proposals and evaluations
- Release and rollback coordination with existing SDLC processes

**Why it exists**
- Autonomous system evolution should not become a parallel unmanaged delivery path
- Integration with SDLC keeps cognition changes aligned with platform operations

**Acceptance signals**
- Mutation artifacts participate in environment transitions
- Promotion to production follows the same rigor as other critical platform changes
- Operational ownership is clear across development and release stages

## Dependencies on the Harness Roadmap

This track should not be treated as independent from the harness roadmap.

Minimum upstream dependencies:
- `MythologIQ/Qor#4` control surface
- `MythologIQ/Qor#5` identity registry
- `MythologIQ/Qor#6` orchestration state machine
- `MythologIQ/Qor#7` tool gateway
- `MythologIQ/Qor#8` Continuum partitioned memory
- `MythologIQ/Qor#9` governance hooks and kill switch
- `MythologIQ/Qor#12` tracing and evaluation
- `MythologIQ/Qor#14` production-grade MLOps and SDLC controls

## Suggested Order

1. Reframe the loop as an operational system
2. Build the mutation engine
3. Establish the sandbox
4. Build multi-dimensional evaluation
5. Integrate QOR final authority
6. Version Continuum memory
7. Build experiment registry
8. Detect and manage drift
9. Add staged promotion
10. Define termination boundaries
11. Integrate fully with broader SDLC

## Issue Map

- Umbrella tracking issue: `MythologIQ/Qor#17`
- Phase 1 issue: `MythologIQ/Qor#18`
- Phase 2 issue: `MythologIQ/Qor#19`
- Phase 3 issue: `MythologIQ/Qor#20`
- Phase 4 issue: `MythologIQ/Qor#21`
- Phase 5 issue: `MythologIQ/Qor#22`
- Phase 6 issue: `MythologIQ/Qor#23`
- Phase 7 issue: `MythologIQ/Qor#24`
- Phase 8 issue: `MythologIQ/Qor#25`
- Phase 9 issue: `MythologIQ/Qor#26`
- Phase 10 issue: `MythologIQ/Qor#27`
- Phase 11 issue: `MythologIQ/Qor#28`

## Execution Notes

- This is a separate document and a separate issue track from the QOR harness plan.
- The loop should never be allowed to self-authorize.
- Mutation, evaluation, governance, and promotion must remain distinct phases.
- Every accepted change must be attributable, reversible, and reviewable.

## Final State

When complete, this is no longer an AutoResearch loop.

It is an autonomous SDLC system that can propose changes to itself, test those changes safely, evaluate them across multiple dimensions, submit them to governance, stage them gradually, and recover cleanly when outcomes do not hold.
