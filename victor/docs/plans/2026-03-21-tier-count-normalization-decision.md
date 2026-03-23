# Tier Count Normalization Decision

**Date:** 2026-03-21  
**Status:** Accepted  
**Scope:** Victor autonomy tier accounting, heartbeat observation windows, AGENTS summaries

---

## Decision

Legacy reset-based `0/50 productive ticks` language is deprecated as an authority source for Victor promotion status.

Authoritative tier accounting must follow these rules:

1. **Cadence-only completed ticks count as valid soak evidence** when no governed task is eligible and the heartbeat completes cleanly.
2. **Historical AGENTS log entries that restate `0/50 productive ticks` after the 2026-03-17 reset are historical artifacts, not current gating truth.**
3. **Current promotion status must be derived from the governing header state plus gate logic and durable ledger evidence, not from repeated narrative reset blocks embedded in session logs.**
4. **Until a full ledger reconciliation is completed, the live summary state `Tier 2 eligible` remains the controlling status.**

---

## Why

The repository currently contains contradictory standards:

- some documents speak in terms of `productive ticks`
- some documents speak in terms of `consecutive ticks`
- some documents speak in terms of `100 ticks at current cadence`
- the kernel promotion gate and tests already accept cadence-only completed ticks as valid soak evidence

That means the system has been mixing historical commentary with actual gate semantics. The result is false regression: the summary says Tier 2 eligible while repeated session blocks imply the counter has been reset to zero again.

---

## Evidence

- `Victor/kernel/promotion-gate.ts` treats cadence-only ticks as valid selection-stability evidence
- `Victor/kernel/promotion-gate.test.ts` explicitly verifies that cadence-only completed ticks count toward soak evidence
- `Victor/kernel/heartbeat.ts` explicitly allows cadence-only heartbeat ticks when no governed task is available
- `Victor/AGENTS.md` and `AGENTS.md` already declare `Tier 2 eligible` in the current summary header

---

## Operational Consequences

- Do not use repeated `Reset enacted` / `0/50 productive ticks` blocks as the live autonomy source of truth
- Do not reset promotion standing solely because a cadence heartbeat produced no executable slice
- Future status displays should distinguish:
  - historical log narrative
  - authoritative tier status
  - unreconciled legacy counters

---

## Follow-Up

1. Reconcile durable ledger entries into one authoritative tick-count view
2. Remove or visually demote stale reset-window language from live status surfaces
3. Normalize promotion criteria docs so they no longer mix `productive`, `consecutive`, and `current-cadence` counting standards without hierarchy
