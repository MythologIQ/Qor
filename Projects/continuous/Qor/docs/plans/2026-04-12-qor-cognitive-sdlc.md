# Plan: QOR Cognitive SDLC

**Version**: 1.0  
**Date**: 2026-04-12  
**Status**: DRAFT  
**Chain**: QOR Cognitive SDLC / Programmable Mutation Platform  
**Risk Grade**: L3 (machine-enforceable mutation, evaluation, governance runtime, and DAG-based memory evolution)

---

## Intent

This plan defines a third, separate build track for turning the governed self-improvement work into a programmable cognitive SDLC platform.

The goal is not to extend the earlier guides with more prose. The goal is to formalize four foundational subsystems as machine-enforceable primitives:

- Mutation Contract Language
- Evaluation Engine
- QOR Enforcement Runtime
- Continuum Version Graph

These components must be independently reasoned about, audited, and evolved, while still composing into one pipeline.

## Core Rule

No component is allowed to mutate system state implicitly.

Every meaningful change must be proposed as a typed contract, validated by executable evaluators, enforced by runtime governance, and committed into a version graph with traceable lineage.

## Foundational Subsystems

### 1. Mutation Contract Language (MCL)

MCL is the unit of change. It replaces implicit mutation with explicit, typed, and verifiable proposals.

An MCL contract must at minimum declare:
- target
- operation
- justification
- evaluation definition

The mutation engine becomes a contract generator rather than a direct modifier.

### 2. Evaluation Engine

The evaluation engine runs deterministic, machine-executable validators against mutation contracts.

Validators should be modular and independently evolvable. At minimum, the system must support:
- atomic validators
- structural validators
- behavioral validators
- governance validators

### 3. QOR Enforcement Runtime

The enforcement runtime sits between evaluation and persistence and has final authority over whether a mutation is applied.

It consumes the contract and its evaluation results, compares them against active policies, and either rejects or allows the transition.

### 4. Continuum Version Graph

Continuum must evolve into a DAG of validated state transitions.

Accepted mutations become nodes. Edges represent approved transitions. This enables branching, merging, reverting, and comparison at system scale.

## Pipeline Model

The intended pipeline is:

1. Contract proposal
2. Contract validation
3. Sandbox execution
4. Evaluation engine aggregation
5. QOR enforcement decision
6. Continuum DAG commit

Every step must emit traceable artifacts.

## Phase Breakdown

### Phase 1: Define and Implement Mutation Contract Language

Build the typed contract language that all future mutations must use.

**What to build**
- Contract schema
- Target, scope, operation, constraint, and validation metric definitions
- Syntactic validation
- Semantic validation for minimum completeness
- Contract lifecycle states

**Acceptance signals**
- Mutations are expressible as typed contracts
- Malformed or incomplete contracts are rejected before execution
- Contracts carry objective validation definitions
- Contracts are attributable to actors and mutation IDs

### Phase 2: Build the Evaluation Engine as a Validator Runtime

Implement a deterministic engine that executes modular validators based on the contract definition.

**What to build**
- Validator interface
- Validator result schema
- Aggregation logic
- Separate validator classes for atomic, structural, behavioral, and governance checks
- Deterministic pass/fail decision object

**Acceptance signals**
- Validators are modular and independently updatable
- Evaluation produces structured machine-readable results
- Aggregation enforces critical validator failure semantics
- Engine behavior is reproducible for the same inputs

### Phase 3: Build the QOR Enforcement Runtime as Execution Control

Turn policy into an execution runtime instead of only a definition layer.

**What to build**
- Enforcement input schema consuming contracts plus evaluation results
- Deterministic policy rule evaluation
- Dynamic policy loading or refresh support
- Non-bypassable allow or reject boundary before persistence

**Acceptance signals**
- Mutations cannot persist without runtime enforcement approval
- Policies are machine-readable and deterministically evaluated
- Policy changes can be applied without rewriting the full runtime
- Enforcement decisions are fully attributable

### Phase 4: Implement the Continuum Version Graph as a DAG

Model accepted system evolution as graph transitions rather than a single linear history.

**What to build**
- Node schema for accepted mutation states
- Edge schema for validated transitions
- Branch operations
- Merge operations
- Revert semantics
- Comparative branch analysis hooks

**Acceptance signals**
- Multiple mutation branches can coexist safely
- Approved branches can be merged
- Revert operations do not destroy unrelated lineage
- Nodes link back to contract, evaluation, and governance artifacts

### Phase 5: Integrate Proposal-to-Persistence as a Cognitive SDLC Pipeline

Compose the four subsystems into one explicit pipeline from proposal through persistence.

**What to build**
- End-to-end pipeline orchestration
- Sandbox handoff and evaluation invocation
- Enforcement handoff and final commit flow
- Full artifact lineage across all phases

**Acceptance signals**
- Each pipeline stage is explicit and inspectable
- Every mutation is reversible and traceable
- Contract, evaluation, enforcement, and graph state remain linked end to end

### Phase 6: Add Operational Discipline Around System Evolution

At this level, the system must monitor and manage its own evolution, not just raw performance.

**What to build**
- Mutation frequency and success-rate monitoring
- Validator alignment review process
- Environment isolation rules for experimental branches
- Operational dashboards or reporting surfaces for mutation flow

**Acceptance signals**
- System evolution metrics are visible
- Experimental branches cannot leak into production implicitly
- Validator drift and policy drift are operationally reviewable

## Dependencies on Prior Tracks

This track depends on earlier foundations already being in progress:

- `MythologIQ/Qor#4` control surface
- `MythologIQ/Qor#5` identity registry
- `MythologIQ/Qor#6` orchestration state machine
- `MythologIQ/Qor#7` tool gateway
- `MythologIQ/Qor#8` Continuum partitioned memory
- `MythologIQ/Qor#9` governance runtime hooks
- `MythologIQ/Qor#17` CodeGenome autonomous SDLC umbrella
- `MythologIQ/Qor#21` multi-dimensional evaluation
- `MythologIQ/Qor#22` mutation governance gate
- `MythologIQ/Qor#23` Continuum versioning

## Suggested Order

1. Mutation Contract Language
2. Evaluation Engine
3. QOR Enforcement Runtime
4. Continuum Version Graph
5. Proposal-to-persistence integration
6. Operational discipline

## Issue Map

- Umbrella tracking issue: `MythologIQ/Qor#29`
- Phase 1 issue: `MythologIQ/Qor#30`
- Phase 2 issue: `MythologIQ/Qor#31`
- Phase 3 issue: `MythologIQ/Qor#32`
- Phase 4 issue: `MythologIQ/Qor#33`
- Phase 5 issue: `MythologIQ/Qor#34`
- Phase 6 issue: `MythologIQ/Qor#35`

## Execution Notes

- This is a third, separate plan and issue track.
- The first implementation focus should be MCL because it becomes the shared input surface for everything else.
- The system only stabilizes when contracts, evaluators, runtime enforcement, and the version graph are decoupled but interoperable.

## Final State

When complete, QOR behaves less like an agent stack and more like a governed compiler for cognition.

Changes are proposed as contracts, validated by executable engines, enforced by runtime policy, and committed into a version graph with full lineage and rollback semantics.
