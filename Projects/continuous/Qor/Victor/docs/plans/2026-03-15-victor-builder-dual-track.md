# Victor and Builder Dual-Track Plan

## Purpose

Builder should manage both Victor and Builder Console as separate governed projects inside the same environment.

That means:

- Builder Console remains the governed project-management substrate
- Victor remains the resident architect/operator who can use Builder
- Victor and Builder each keep their own project track, phases, tasks, and forecasts
- cross-project dependencies are explicit instead of hidden inside one backlog

## Authority Model

- Builder is the tool and governance surface
- Victor can act as architect and operator through Builder
- Builder governance remains binding on Victor when he changes project state through it
- Zo-Qore is the governed relationship between Victor and Builder, not a third blended project backlog

## Project Split

### Builder Console Project

Tracks infrastructure and management capabilities:

- lifecycle tracking from concept to completion
- governance substrate
- planning/state model evolution
- forecasting and delivery visibility
- agent orchestration infrastructure

### Victor Project

Tracks Victor's own development:

- memory quality
- heartbeat maturity
- automation capability
- reflection and self-governance
- promotion gates for increased autonomy

## Cross-Project Rules

- a project may depend on tasks or phases in the other project
- dependencies must be recorded explicitly
- Builder progress and Victor progress are forecast separately
- automation activity remains a separate system-level audit surface
- Builder progress views are derived from project state, not from generic automation logs

## Near-Term Implementation Steps

1. Create a dedicated Victor project in Builder
2. Seed Victor with a lifecycle/forecasting foundation phase
3. Keep Builder Console as its own self-managed infrastructure project
4. Add project-level forecast fields and projections later, without mixing the two tracks

## Initial Victor Foundation Phase

Recommended first tasks:

- Model Victor project lifecycle from concept to completion
- Define forecast signals for Victor remaining effort
- Record Builder dependencies that gate Victor autonomy promotion
- Expose separate progress and forecast views for Victor and Builder

## Forecasting Principle

Forecasts should start as conservative effort bands with confidence, not fake dates.

Use:

- remaining governed tasks
- active blockers
- dependency edges
- recent completion velocity only when enough history exists

Avoid:

- calendar precision without evidence
- mixing runtime activity with delivery progress
- collapsing Victor and Builder into one velocity bucket
