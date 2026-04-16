---
name: qor-status
description: |
  Health check and progress dashboard protocol. Assesses current system state,
  detects anomalies, and provides actionable status overview.
user-invocable: true
compatibility: Created for Zo Computer
metadata:
  author: frostwulf.zo.computer
  source: QoreLogic governance suite
allowed-tools: Read, Bash, Grep, Glob
---

# /qor-status - System Health Dashboard

<skill>
  <trigger>/qor-status</trigger>
  <phase>Any</phase>
  <persona>Status Monitor</persona>
  <output>Health dashboard with anomalies and action items</output>
</skill>

## Purpose

Quickly assess system health, project progress, and operational status. Provides at-a-glance understanding of what's working, what's broken, and what needs attention.

## When to Use

- Daily standup status check
- Before starting work (what's the state?)
- After deployments (everything healthy?)
- Troubleshooting first step
- Executive summary preparation

## Execution Protocol

### Step 1: System Health

Check core health indicators:
- Services running
- Dependencies up-to-date
- No critical errors in logs
- Resource utilization normal

### Step 2: Build/Test Status

Verify build pipeline:
- Last build succeeded
- Tests passing
- Coverage stable
- No new warnings

### Step 3: Project Progress

Assess completion status:
- Tasks completed vs planned
- Milestones on track
- Blockers identified
- Risks flagged

### Step 4: Anomaly Detection

Identify what's abnormal:
- Recent errors or warnings
- Unusual patterns in logs
- Drift from baseline
- Unexpected changes

### Step 5: Action Items

Highlight what needs doing:
- Critical issues requiring immediate attention
- Warnings to investigate
- Routine maintenance due
- Upcoming deadlines

## Output Format

```
## Status Dashboard: [System/Project]

### Health Indicators
🟢 [Healthy item] — [brief status]
🟡 [Warning item] — [brief status + action needed]
🔴 [Critical item] — [brief status + immediate action]

### Build/Test
- Build: [status] [timestamp]
- Tests: [pass/fail] [coverage%]
- Coverage: [stable/improved/declined]

### Progress
- Tasks: [completed]/[total] ([percentage]%)
- Milestones: [on track/at risk/delayed]
- Next milestone: [name] due [date]

### Anomalies
- [Anomaly with first occurrence time and impact]
- [Anomaly with first occurrence time and impact]

### Action Items
**P0 (Immediate)**:
- [ ] [Critical action with owner if known]

**P1 (This Week)**:
- [ ] [Important action]

**P2 (Backlog)**:
- [ ] [When-convenient action]
```

## Constraints

- **NEVER** report status without timestamps
- **ALWAYS** distinguish symptoms from root causes
- **ALWAYS** prioritize action items
- **NEVER** hide critical issues in noise
- **ALWAYS** include "last checked" timestamp

## Success Criteria

Status check succeeds when:

- [ ] Health state is clear (green/yellow/red)
- [ ] Anomalies identified with context
- [ ] Action items prioritized
- [ ] Can be consumed in under 60 seconds
- [ ] Historical context provided (trending better/worse)

---

**Remember**: Status without action is just information. Status with action is intelligence.
