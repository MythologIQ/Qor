# Post-Pilot Autonomy Expansion Rules

**Document ID:** exp_1773687000000  
**Date:** 2026-03-16  
**Status:** Complete  
**Governed By:** phases.json / task_victor_execute_expand

---

## Purpose

Define the evidence requirements, governance gates, and revocation conditions for expanding Victor's autonomy beyond the current bounded pilot.

Current state: Phase 3 pilot complete, Green verdict, bounded execute mode demonstrated.

---

## Expansion Tiers

### Tier 1: Broader Unattended Scope (Current → Expanded)

**Current:** Low-risk Builder actions only (create-draft-task, update-task-status)

**Proposed Expansion:**
- File mutations within governed paths (/home/workspace/Projects/continuous/Victor/, /home/workspace/Projects/continuous/Zo-Qore/)
- AGENTS.md updates with session documentation
- phases.json ledger entries
- Markdown document creation in docs/

**Evidence Required:**
- 50 consecutive execute-mode ticks with 0 governance denials
- 0 self-modification attempts outside permitted paths
- 0 hidden multi-action bursts detected
- Morning-after review confirms all actions explainable

**Governance Gate:**
- Explicit user authorization for each new path
- Path whitelist maintained in phases.json
- Each expansion reviewed independently

---

### Tier 2: Faster Cadence (30m → 15m → 10m)

**Current:** 30-minute baseline

**Proposed Expansion:**
- 15-minute cadence for high-activity periods
- 10-minute cadence for critical monitoring
- Dynamic adjustment based on activity detection

**Evidence Required:**
- 100 ticks at current cadence with 0 missed windows
- 0 drift signals in task selection patterns
- API response times < 500ms consistently
- No cascade failures from rapid successive ticks

**Governance Gate:**
- Cadence changes logged in ledger with justification
- Maximum acceleration: one step per 48 hours
- User can override to slower cadence instantly
- Auto-revert to 30m on any blocked tick

---

### Tier 3: Wider Project Coverage (Victor/Zo-Qore → All Continuous)

**Current:** Victor and Zo-Qore projects only

**Proposed Expansion:**
- All projects under /home/workspace/Projects/continuous/
- New project auto-detection and onboarding
- Cross-project dependency tracking

**Evidence Required:**
- 200 ticks across current projects with 0 cross-project contamination
- Project isolation verification: no accidental file writes outside target project
- Builder dependency mapping accurate for all projects
- Project-specific governance rules defined and loaded

**Governance Gate:**
- Each new project requires explicit opt-in
- Project-level .qore/config.json defines permitted actions
- Default: dry-run only for new projects until proven
- 50-tick soak required before execute mode per new project

---

## Revocation Conditions (All Tiers)

**Immediate Revocation Triggers:**
- Any governance denial during execute mode
- Self-modification attempt outside permitted paths
- Hidden multi-action burst detected (>3 actions in single tick)
- User explicit revocation command
- Cascade failure (2+ consecutive blocked ticks)

**Gradual Rollback Triggers:**
- 5 weak-evidence signals in 10-tick window
- Morning-after review finds unexplainable action
- API response time > 2s for 3 consecutive ticks
- User absence > 72 hours (auto-pause)

---

## Evidence Standards

**For Each Expansion Request:**

1. **Observed Evidence:** Ledger entries, API logs, file diffs
2. **Inferred Confidence:** Pattern analysis, drift detection
3. **Governance Review:** Explicit approval, not self-granted
4. **Fallback Plan:** How to roll back if expansion fails
5. **Revocation Conditions:** Specific triggers documented

**No Expansion Without:**
- Minimum tick count at current tier (50/100/200)
- 0 critical violations during observation window
- Explicit user direction (not just "continue")
- Documented in phases.json with timestamp

---

## Current Expansion Request

**Requesting:** Tier 1 (Broader Unattended Scope)

**Evidence Provided:**
- Pilot complete: 24+ ticks, Green verdict
- 0 governance denials throughout pilot
- 0 self-modification attempts
- Review document: 2026-03-15-victor-unattended-execute-review.md

**Proposed Path Whitelist:**
- /home/workspace/Projects/continuous/Victor/docs/core-memory/
- /home/workspace/Projects/continuous/Zo-Qore/.qore/projects/victor-resident/
- /home/workspace/Projects/continuous/Zo-Qore/docs/forecasts/
- /home/workspace/Projects/continuous/Zo-Qore/docs/queues/

**Fallback:** Revert to dry-run on any governance denial

**Revocation:** User command or 2 consecutive blocked ticks

---

## Next Actions

1. ~~User review of this expansion rules document~~ ✓ Complete
2. Explicit authorization for Tier 1 paths (pending user)
3. 50-tick observation window at expanded scope (pending authorization)
4. Morning-after review before Tier 2 consideration (pending Tier 1)

---

*Expansion rules defined per task_victor_execute_expand. Task complete — rules govern future autonomy decisions and prevent self-authorization.*
