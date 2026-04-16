# CONCEPT: Deterministic Automation Boundaries in Agent Heartbeats

## Problem Statement

Victor'sheartbeat—when fired on its 30m cadence—encounters a "No eligible work" state in an empty queue. Currently, this situation falls through to **user prompting**: the automation asks the user to define work, rather than deriving it deterministically from available context (phase objective, tier criteria, builder backlog).

This creates a **determinism breach** in automated mode: the user is unavailable to answer, yet the system blocks waiting for an answer it cannot receive.

## Core Tension

| Axis | Current Reality | Required State |
|------|-----------------|----------------|
| **Tier** | 2 (assisted) | Needs autonomy ladder mapping |
| **Mode** | execute (automated) | Automated must mean autonomous |
| **Cadence** | 30m (unattended) | No user present to answer |
| **Gap** | No eligible work → ask user | Empty queue → derive → execute |

## Hypothesis

The tier/cadence/mode triad lacks an explicit **autonomy boundary** field. When `cadence` is `30m` and `mode` is `execute`, the system should interpret this as "assisted but unattended"—a state where suggestions are made, not questions.

## Research Findings

**Research Document**: `research/automation-determinism-research.md`

Key findings:
1. **Option A (Tier-Gated Autonomy Ladder)** is the structural fix
2. **Option B (Phase-Objective Auto-Derive)** is the tactical mitigation
3. **Risk**: Auto-derived tasks may not match user intent → mitigate by tier-gating execution

## Success Criteria

- [ ] Empty queue no longer falls through to user prompts in automated mode
- [ ] Tier ≥ 2 + automated mode → self-derivation before escalation
- [ ] Phase objective parsed for implicit task candidates
- [ ] Hash-chain ledger tracks autonomy boundary definitions
- [ ] Veto capability preserved (user can override after the fact)

## Conclusion

The problem is bounded, researched, and ready for architectural blueprint. Next phase: **ARCHITECTURE_PLAN.md**.
