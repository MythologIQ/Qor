# Victor and Builder Mobile Views Design

## Purpose

Define the first proper mobile UI split between Victor and Builder while aligning the next implementation slice around the promotion gate and soak evidence scorer.

This design is intentionally narrow:

- Victor view is the autonomy and operator surface
- Builder view is the governed delivery surface
- both views can read shared backend projections
- neither view should collapse into the other

## Core Boundary

The mobile shell should become a two-view system with a header-level segmented switcher:

- `Victor`
- `Builder`

Victor is the default landing view because he is the resident operator. Builder remains the governed project-management substrate.

The split is:

- **Victor view**
  - promotion readiness
  - heartbeat state
  - automation activity
  - reflection and autonomy posture
- **Builder view**
  - project progress
  - forecast
  - blockers
  - dependency state
  - governed execution tracking

Future modules can become additional views later without weakening this boundary.

## Initial UI Structure

### Shell

Reuse the current Zo-Qore mobile shell in:

- `Projects/continuous/Zo-Qore/zo/ui-shell/assets/mobile.html`
- `Projects/continuous/Zo-Qore/zo/ui-shell/assets/mobile.css`
- `Projects/continuous/Zo-Qore/zo/ui-shell/assets/mobile.js`

Add a segmented switcher in the header:

- `Victor`
- `Builder`

Victor is the default selected segment on load.

### Victor View

Victor view should stack in this order:

1. promotion verdict card
2. heartbeat status card
3. promotion gate summary
4. soak evidence summary
5. recent automation activity

The verdict card is the top-level read. It should use UI labels:

- `Red`
- `Yellow`
- `Green`

But those are display labels only. The underlying policy states remain:

- `not-ready`
- `conditionally-ready`
- `ready`

The verdict card should expand into the unmet criteria instead of showing a fake numeric confidence value.

### Builder View

Builder view should center on:

1. current project progress
2. forecast
3. blockers
4. dependency state that materially affects the active project

Victor promotion state should appear in Builder only when it affects Builder forecast or dependency status.

Example:

- `Victor execute-mode promotion still Yellow: soak evidence incomplete`

Builder should not become a Victor dashboard in disguise.

## Artifact Implementation Order

The first artifact/UI slice should implement:

1. promotion gate artifact
2. soak evidence scorer

Not first:

- fallback and revocation artifact
- execute-mode budget policy

Those should follow after the gate and scoring logic are explicit.

Why this order:

- the promotion gate defines the bar
- the soak scorer determines whether reality clears that bar
- later control artifacts should be shaped against a real gate instead of vague caution

## Backend Shape

### Promotion Gate Artifact

Victor needs a Builder-visible artifact defining unattended execute-mode promotion.

This artifact should include:

- required evidence
- minimum soak behavior
- allowed action scope
- blocking conditions
- stop and fallback prerequisites
- what still prevents promotion

Suggested output shape:

- policy state
- criteria list
- unmet criteria list
- notes
- updated timestamp

### Soak Evidence Scorer

The scorer should consume the bounded `30m` dry-run heartbeat evidence and return one of:

- `not-ready`
- `conditionally-ready`
- `ready`

The scorer should look at:

- successful bounded ticks
- policy/preflight pass rate
- governance-denied events
- block reasons
- contradictory or weak grounding patterns
- duplicate or unstable task selection behavior
- audit completeness

It should not return a pseudo-precise confidence number.

## Data Flow

1. heartbeat and automation activity continue producing audit events
2. promotion gate artifact defines the current execute-mode bar
3. soak evidence scorer evaluates recent unattended dry-run evidence against that bar
4. Victor view renders the gate verdict and supporting evidence
5. Builder view consumes only the dependency effect of Victor promotion state when relevant

## Error Handling

If the gate artifact is missing:

- Victor view should render `Red`
- show `Promotion gate not defined`

If soak evidence is missing or stale:

- Victor view should render `Yellow` or `Red` depending on gate requirements
- clearly say the verdict is limited by missing evidence

If activity data loads but scoring fails:

- show the raw heartbeat and audit state
- mark verdict unavailable
- do not infer readiness

If Builder project data is unavailable:

- Builder view should still load its shell
- show dependency/forecast sections as unavailable rather than empty success

## Testing

Add tests for:

- Victor view default selection
- header switcher behavior between Victor and Builder
- verdict card rendering for `not-ready`, `conditionally-ready`, and `ready`
- Builder dependency rendering only when Victor state materially affects the active project
- scorer behavior on:
  - clean soak evidence
  - insufficient soak evidence
  - repeated governance denials
  - unstable task selection
  - incomplete audit data

## Immediate Implementation Slice

1. create the promotion gate artifact
2. create the soak evidence scorer
3. add Victor/Builder header switcher to the mobile shell
4. render Victor promotion verdict card and summaries
5. render Builder progress/forecast panel with Victor dependency injection only when relevant

## Follow-On Work

After this slice:

1. fallback and revocation artifact
2. execute-mode budget policy
3. broader reflection surfaces for Victor
4. additional module views if needed later
