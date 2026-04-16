# Plan: QOR Shell-First UI Remediation

**Version**: 1.0  
**Date**: 2026-04-10  
**Status**: DRAFT  
**Chain**: QOR internal route rebuild  
**Risk Grade**: L2 (live route restructuring)

## Open Questions

- None. Phase 1 scope is locked to shell-first.

## Phase 1: Shell Contract on `/qor`

### Affected Files

- `/qor` - replace braided hub layout with a shell-owned attention page

### Changes

Treat `/qor` as the shell contract, not as a dashboard aggregate.

- Replace the current `/qor` route source wholesale
  - do not patch the braided file in place
  - rewrite the route as one fresh page implementation under the Section 4 ceiling
  - target file size: <= 250 lines
  - target helper size: <= 40 lines
  - no nested ternaries

- Keep one global header only
  - QOR identity
  - current route title
  - one-sentence purpose
  - global pivots only
- Keep one left rail only
  - stable internal navigation
  - small cross-system attention signal cluster
  - no page-specific summary cards
- Rebuild the main pane around one question only:
  - "What needs attention across the system right now?"
- Remove braided sections from `/qor`
  - module dashboard cards
  - handoff chain panel
  - module decision grid
  - recent flow feed as a primary content block
  - duplicated module launch surfaces
- Replace them with three shell-owned blocks
  - attention stack
  - next-action handoff
  - direct route pivots
- Limit data shown on `/qor` to judgment-shaping signals only
  - highest-value Victor action
  - current Forge queue pressure
  - current Qora integrity state
  - current Continuum trust/health state

### Unit Tests

- `/qor` returns HTTP 200
- `/qor` still loads the same API endpoints without runtime errors
- `/qor` contains one global navigation system, not duplicated nav regions
- `/qor` no longer renders module dashboard cards or a recent-flow feed block
- rewritten `/qor` route stays within the Razor ceilings

## Phase 2: Route Rebuilds That Follow the Shell

### Affected Files

- `/qor/victor` - align to executor-state question
- `/qor/forge` - align to planner-to-execution question
- `/qor/qora` - align to signal/provenance question
- `/qor/continuum` - align to substrate-trust question

### Changes

Rebuild route interiors against the UI matrix after the shell contract is stable.

- `/qor/victor`
  - execution state
  - next task
  - blockers
  - cadence/runtime state
- `/qor/forge`
  - active phase
  - queued/claimed work
  - planning health
  - execution handoff state
- `/qor/qora`
  - connection health
  - recent meaningful signals
  - provenance confidence
- `/qor/continuum`
  - substrate health
  - memory/graph state
  - retrieval integrity
  - current failure points

### Unit Tests

- each rebuilt route answers its single primary question without unrelated module panels
- each route keeps global shell identity in the header and module-specific understanding in the main pane
- each route removes decorative charts or duplicated summaries that do not affect operator judgment

## Phase 3: Navigation and Layout Consistency Sweep

### Affected Files

- `/qor`
- `/qor/victor`
- `/qor/forge`
- `/qor/qora`
- `/qor/continuum`
- `/mobile/qor`

### Changes

Normalize the shell and route contract across internal surfaces.

- enforce one global header pattern
- enforce one left rail pattern
- keep module-local subnav inside the module content region only
- align mobile to triage-first instead of shrinking desktop structure
- remove any remaining duplicated global/module navigation mixes

### Unit Tests

- desktop routes share one shell contract
- `/mobile/qor` remains triage-first and does not mirror desktop density
- `get_space_errors()` returns no runtime errors after the sweep
