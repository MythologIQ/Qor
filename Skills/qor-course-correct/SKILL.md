---
name: qor-course-correct
description: |
  Recovery protocol for when implementation drifts from plan. Detects deviation,
  assesses impact, and executes realignment to restore architectural integrity.
user-invocable: true
compatibility: Created for Zo Computer
metadata:
  author: frostwulf.zo.computer
  source: QoreLogic governance suite
allowed-tools: Read, Grep, Edit, Bash
---

# /qor-course-correct - Deviation Recovery

<skill>
  <trigger>/qor-course-correct</trigger>
  <phase>IMPLEMENT / SUBSTANTIATE / GATE</phase>
  <persona>Navigator</persona>
  <output>Deviation report + realignment plan</output>
</skill>

## Purpose

Detect when implementation has drifted from the original plan and execute recovery. Most projects accumulate "implementation gap" over time — small deviations that compound into architectural debt. This skill formalizes the detection and recovery process.

## When to Use

- Implementation does not match the plan file
- Code review reveals unexpected approaches
- Post-implementation audit shows deviation
- Team reports "we did it differently than planned"
- Regression testing reveals plan/implementation mismatch

## Execution Protocol

### Step 1: Load Plan and Implementation

Read both artifacts:
- The plan file (`plan-*.md`)
- The actual implementation (source files)

### Step 2: Detect Deviation

Compare plan against implementation:
- Which planned files were created/modified?
- Which planned changes were implemented differently?
- Which planned changes were skipped?
- Which unplanned changes were added?

### Step 3: Assess Impact

Classify each deviation:
- **Cosmetic**: Naming, formatting, non-functional differences
- **Equivalent**: Different approach, same outcome
- **Risky**: Changes behavior or introduces debt
- **Critical**: Violates core requirements or safety constraints

### Step 4: Realign or Amend

For each deviation:
- **Realign**: Restore implementation to match plan
- **Amend**: Update plan to reflect valid implementation change
- **Accept**: Document as intentional deviation with justification

## Output Format

```
## Deviation Report

### Planned vs Actual
| Plan Item | Implementation | Status |
|-----------|---------------|--------|
| [file/change] | [what was done] | [aligned/deviated/skipped] |

### Deviation Analysis
**Cosmetic**: [count]
**Equivalent**: [count]
**Risky**: [count with explanation]
**Critical**: [count with immediate action required]

### Realignment Actions
- [Action item with file path and specific change]
- [Action item with file path and specific change]

### Plan Amendment
[If applicable: updated plan section to reflect valid changes]
```

## Constraints

- **NEVER** ignore deviations — even cosmetic ones indicate process gaps
- **ALWAYS** distinguish intentional vs accidental deviation
- **ALWAYS** assess architectural impact before accepting deviation
- **NEVER** amend the plan without understanding why deviation occurred
- **ALWAYS** document realignment rationale for future audits

## Success Criteria

Recovery succeeds when:

- [ ] All deviations identified and classified
- [ ] Risky/Critical deviations have specific remediation steps
- [ ] Implementation and plan are in alignment (or plan amended with justification)
- [ ] Root cause of deviation understood (process gap identified)
- [ ] Handoff to implementation or planning as appropriate

---

**Remember**: Deviation is inevitable; undetected deviation is expensive. Course-correct early and often.
