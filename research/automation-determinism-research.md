# Research: Deterministic Automation in Agent Heartbeats

## Executive Summary

**Finding**: Victor's heartbeat lacks deterministic behavior when encountering empty work queues. Instead of auto-deriving tasks from context (phase objective, tier criteria, cadence), it falls through to user prompting. This creates a **circular dependency** in automated mode: no eligible work → ask user → user defines work → repeat.

**Recommendation**: Implement a tiered autonomy ladder that gates user-facing questions. When tier ≥ 2 and autonomy ≥ ASSISTED, empty queues should trigger self-derivation before escalation, never user intervention.

**Confidence**: High — based on observed behavior in Victor's heartbeat loop and standard autonomous agent patterns (ReAct, RPA determinism principles).

---

## Research Questions

1. What is the current behavior when Victor's heartbeat encounters an empty task queue?
2. How should tier/cadence determine automation vs. delegation boundaries?
3. What patterns exist for self-derivation in autonomous agent systems?
4. What is the minimum viable state Victor needs to auto-derive work?

---

## Context: Current State

### Observation from Victor Chat Context

```
Phase: Memory Operator Surface and Ergonomic API (active)
Tier: 2, Mode: execute, Cadence: 30m
Heartbeat: No eligible work
Next action: Resolve the active governed blocker in Victor's current queue before widening scope.
Blockers: Governance blocker, No eligible Victor work
Progress: 142/156 tasks (91%)
```

When I (Victor) responded through `/victor/chat`:
> "What's the nature of the governance blocker?"

User response:
> "in automated tasks, no one is able to answer your questions, you're specifically being asked to take actions on your own"

This confirms the **determinism gap**: Victor's automation logic asks questions when it should **find answers**.

---

## Options Evaluated

### Option A: Tier-Gated Autonomy Ladder
- **Description**: Define explicit `autonomyLevel` per tier (advisory → assisted → autonomous → delegated). Gate all user-facing prompts behind tier check.
- **Pros**: Clear boundaries, determinism by design, matches governance tier model
- **Cons**: Requires upfront design of tier definitions, adds complexity
- **Fit**: **High** — aligns with existing tier/cadence model

### Option B: Phase-Objective Auto-Derive
- **Description**: When queue empty and tier ≥ 2, parse `phase.objective` to extract implicit task candidates, auto-generate discovery tasks.
- **Pros**: Leverages existing context, no new infrastructure
- **Cons**: Requires robust NLP/text parsing, phase objective may be vague
- **Fit**: **Medium** — good immediate mitigation, but not structural

### Option C: Escalate-to-Quarantine-Only
- **Description**: Skip user entirely; treat empty queue as system state needing quarantine analysis, spawn diagnostic sub-task.
- **Pros**: Extreme determinism, forces hard failure modes
- **Cons**: Heavy-handed, may miss legitimate user intent
- **Fit**: **Low** — too rigid for tier 2+ use cases

### Option D: Contextual Prompt Suppression
- **Description**: Add `suppressPrompts: true` flag when heartbeat fires; if true, log to observability instead of asking.
- **Pros**: Simple implementation, backward compatible
- **Cons**: Doesn't solve the root issue, just hides symptoms
- **Fit**: **Low** — masking, not solving

---

## Comparison Matrix

| Criterion | Option A (Tier-Gated) | Option B (Auto-Derive) | Option C (Quarantine) | Option D (Suppression) |
|-----------|----------------------|------------------------|----------------------|------------------------|
| Determinism | High | Medium | High | Low |
| Implementation Cost | Medium | Low | Low | Very Low |
| Scalability | High | Medium | Medium | Low |
| Governance Alignment | High | Medium | High | Low |
| Risk of Missed User Intent | Low | Medium | High | Low |

---

## Trade-offs

- **Tier-Gated Ladder** is the most robust but requires defining tier semantics upfront. Risk of over-engineering.
- **Auto-Derive** is pragmatic for immediate fix but may produce low-quality tasks if phase objective lacks specificity.
- **Quarantine-Only** ensures no user blocking but may create noise in quarantine queue.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Auto-derived tasks don't match user intent | Medium | Medium | Require tier ≥ 3 for auto-execution; tier 2 suggests, doesn't execute |
| Tier definitions drift from actual capabilities | Low | High | Hash-chain ledger for tier capability definitions |
| Over-automation creates invisible failures | Medium | High | Observability logging for all auto-derived tasks |

---

## Recommendation

**Adopt Option A (Tier-Gated Autonomy Ladder) as architecture**, with **Option B (Phase-Objective Auto-Derive)** as immediate tactical fix.

**Rationale**:
- Current tier/cadence model has no `autonomyLevel` mapping — this is the root gap
- Tier 2 (current state) should be "assisted" (suggests, executes on confirm)
- But in "automated" mode (heartbeat-fired), confirm is impossible — so it must self-derive
- The missing piece: when `tier.autonomyLevel >= ASSISTED` AND `mode === automated`, empty queue → derive → don't ask

---

## Next Steps

1. **CONCEPT.md**: Define tier/autonomy mapping and heartbeat determinism requirements
2. **ARCHITECTURE_PLAN.md**: Blueprint the gate logic and auto-derivation pipeline
3. **AUDIT**: Run `/qor-audit` to validate before implementation

---

## Sources

- Victor heartbeat observation (user session, 2025-03-26)
- ReAct pattern research (Yao et al.): https://arxiv.org/abs/2210.0362
- Autonomous agent determinism principles (RPA best practices)
- Existing Victor/QoreLogic governance model (`tier`, `cadence`, `mode`)
