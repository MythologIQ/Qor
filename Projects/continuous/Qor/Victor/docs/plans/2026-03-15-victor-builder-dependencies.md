# Victor Builder Dependency Gates

## Purpose

Victor needs an explicit record of which Builder capabilities gate autonomy promotion.

This is not a generic architecture wishlist. It is the dependency map for moving Victor from supervised operation toward unattended governed execution without confusing future ambitions with present gates.

## Current Promotion Target

Near-term target:

- unattended `30m` heartbeat operation
- dry-run proven
- execute-mode promotion still gated

This dependency map answers:

- what Builder must already provide
- what Builder must improve next
- what can wait until later

## Immediate Builder Gates

### 1. Governed State Transitions

Victor cannot promote if Builder cannot enforce and audit task-state writes.

Required capabilities:

- governed task creation
- governed task status updates
- explicit denial on weak evidence
- ledgered rationale for every write

Current state:

- present
- already used by Victor heartbeat and automation paths

### 2. Project and Phase Visibility

Victor cannot operate safely if Builder path state is ambiguous.

Required capabilities:

- stable phase/task records
- active vs complete phase resolution
- separation between generic automation activity and build progress

Current state:

- present in first useful form
- still needs richer projections over time

### 3. Audit and Review Surfaces

Victor cannot earn trust if unattended work disappears into logs nobody can use.

Required capabilities:

- append-only automation activity
- build-progress projections
- readable review endpoints for what changed, what blocked, and why

Current state:

- present
- sufficient for promotion review input, not final polish

### 4. Heartbeat Target Selection

Victor cannot run unattended if Builder work selection is unstable or easily gamed.

Required capabilities:

- phase-aware selection
- authored task-order respect within a governed phase
- duplicate-task resistance
- no fabricated follow-on work when the queue is exhausted

Current state:

- present
- recently hardened by live soak behavior

### 5. Promotion Gate Definition

Victor cannot move from unattended dry-run to unattended execute mode without a Builder-visible promotion rule.

Required capabilities:

- explicit promotion criteria
- evidence thresholds
- stop conditions
- rollback/fallback conditions

Current state:

- still pending
- this is the main near-term Builder dependency for execute-mode promotion

## Near-Term Builder Work Still Gating Victor

These are the remaining Builder-side dependencies that still materially affect Victor autonomy promotion:

1. Define unattended execute-mode promotion gate.
2. Tighten promotion review reporting so repeated soak evidence is easy to inspect.
3. Keep lifecycle and forecast projections separate for Victor and Builder projects.

## What Is Not A Gate Yet

These items matter, but they should not block the current heartbeat promotion target:

- broad multi-agent mesh orchestration
- large-scale agent delegation
- cross-agent trust scoring beyond Victor's current runtime
- generalized portfolio forecasting across many projects

Those are later-system concerns, not prerequisites for the current supervised-to-unattended heartbeat path.

## Deferred Agent Mesh Plan

AGT-style mesh governance is worth planning, but later.

When it becomes relevant, the plan should cover:

1. agent identity and role boundaries
2. capability scoping and least privilege per agent
3. inter-agent approval and escalation rules
4. append-only mesh audit trails
5. kill-switch and isolation controls for each agent role
6. promotion criteria for adding a new autonomous agent into the mesh

That should become its own Builder phase, not an implicit extension of Victor heartbeat work.

## Dependency Rule

Victor may architect across Builder and future mesh systems, but autonomy promotion must be judged against the dependencies that are actually binding now.

Current binding Builder dependency:

- unattended execute-mode promotion gate

Current non-binding but important future dependency:

- agent-mesh governance plan
