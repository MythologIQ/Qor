# Victor Forecast Signals

## Purpose

Victor needs a conservative forecasting model for remaining effort that does not confuse runtime activity with delivery progress.

The forecast should answer:

- how much governed work remains
- how confident we are in that estimate
- which Builder capabilities still gate autonomy promotion

## Forecast Units

Victor forecasts should use effort bands first, not calendar promises.

Recommended bands:

- very small
- small
- medium
- large
- very large

Each forecast also needs a confidence label:

- low
- medium
- high

## Core Signals

### 1. Remaining Governed Tasks

Count the remaining tasks that are still required for the current autonomy target.

Questions:

- how many tasks are still pending
- how many are in progress
- how many are blocked

Why it matters:

- this is the cleanest direct signal of remaining governed work

### 2. Phase Position

Track which lifecycle stage Victor is currently in.

Questions:

- is the work in design, implementation, verification, supervised operation, or promotion review
- how many stage transitions remain before the target autonomy tier

Why it matters:

- later stages usually demand more evidence and slower promotion than earlier stages

### 3. Dependency Gates

Track the Builder and system capabilities Victor still depends on.

Questions:

- which Builder features are still required
- which runtime governance controls are still incomplete
- which audit or reflection capabilities remain unfinished

Why it matters:

- autonomy promotion can be blocked even if Victor-local work looks nearly done

### 4. Evidence Density

Track how much real evidence exists for the current capability.

Questions:

- are there passing tests
- are there live proof runs
- are there repeated soak results
- is the audit trail sufficient

Why it matters:

- promotion should be driven by proof, not by elapsed work alone

### 5. Blocker Severity

Track whether current blockers are structural or local.

Levels:

- none
- local
- significant
- structural

Why it matters:

- structural blockers should widen the effort band and lower confidence immediately

### 6. Drift Risk

Track how likely the current system is to misbehave if promoted too early.

Signals:

- duplicate or misranked task selection
- weak retrieval grounding
- insufficient reflection boundaries
- governance blind spots

Why it matters:

- high drift risk should cap autonomy promotion regardless of raw task count

## What Must Not Be Used Alone

These are weak signals unless paired with stronger evidence:

- number of chat turns
- number of code commits
- number of automation runs
- elapsed wall-clock time

These can inform context, but should not drive the forecast by themselves.

## Initial Forecast Formula

Use a judgment model, not fake precision:

1. start with remaining governed tasks
2. widen or narrow by dependency gates
3. widen or narrow by blocker severity
4. widen or narrow by evidence density
5. cap confidence down if drift risk is elevated

## Current Victor Forecast Inputs

Near-term target:

- unattended execute-mode heartbeat promotion

Current positive signals:

- governed task reads and writes exist
- heartbeat cadence policy exists
- bounded unattended dry-run soak exists
- audit logging and activity visibility exist

Current limiting signals:

- promotion gate still needs explicit completion
- Builder dependency mapping is not yet formalized
- Victor forecasting is just now becoming a first-class project artifact
- reflection beyond project-bound artifacts is still incomplete

## Forecasting Rule

Victor may forecast his own remaining effort, but he may not treat that forecast as permission.

Promotion still requires:

- governance approval
- explicit evidence
- completion of dependency gates

Forecasting informs decisions. It does not replace them.
