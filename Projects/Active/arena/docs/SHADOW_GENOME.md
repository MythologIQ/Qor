
## Builder Failure — tick=163 blocked_on_deps

**Tick:** 163 | **Task:** task-163-ui-matches-list-tests | **Status:** blocked_on_deps
**Blocked by:** task-162-ui-matches-list (spec_defect)
**Severity:** 1
**Timestamp:** 2026-04-20T08:05:00Z

## Builder Failures
- 2026-04-20T09:05:00Z | severity=1 | builder tick 162 | blocked_on_deps | task: task-162-ui-matches-list | blocked_by: task-161-ui-status-api-tests

## Remediation Failure — rem-021-shadow-genome-stale-entry-clearance spec_defect

**ID:** rem-021-shadow-genome-stale-entry-clearance | **Status:** spec_defect
**Severity:** 4
**Timestamp:** 2026-04-20T09:45:00Z
**Root cause:** Commands and allowed_writes reference old Qor path `/home/workspace/Projects/continuous/Qor/docs/SHADOW_GENOME.md`; SHADOW_GENOME.md now lives at `/home/workspace/Projects/Active/arena/docs/SHADOW_GENOME.md` (post-fork 2026-04-18). Target entries `tick=47 blocked_on_deps`, `sentinel-tick-125`, `sentinel-tick-133` are absent from the new file. Task is impossible as specified.

## Remediation Failure — rem-023-shadow-queue-drift-resolution-markers spec_defect

**ID:** rem-023-shadow-queue-drift-resolution-markers | **Status:** spec_defect
**Severity:** 4
**Timestamp:** 2026-04-20T09:45:00Z
**Root cause:** Commands and allowed_writes reference old Qor path; target entries absent in new SHADOW_GENOME. Task impossible as specified.

## Remediation Failure — rem-024-shadow-window-superseded-resolution spec_defect

## Builder Failure — 2026-04-20 (repeat)

**Tick:** 162
**Task:** task-162-ui-matches-list
**Status:** spec_defect (confirmed, persistent infra gap)
**Detail:** task-161 (f07981c) completed successfully but its success entry was never written to status.jsonl. task-162 remains blocked. The infra gap is persistent — task-161's test file exists, tests pass, but no status entry was written. This is a builder status-recording gap, not a code defect.
**Severity:** 4

## Builder Failure — tick=162 spec_defect

**Tick:** 162 | **Task:** task-162-ui-matches-list | **Status:** spec_defect
**Root cause:** GET /api/arena/matches route already present at line 72 of router.ts; task spec was redundant. No code changes needed.
**Severity:** 4
**Timestamp:** 2026-04-20T14:25:00Z

## Builder Failure — 2026-04-20T14:37:04Z

**Tick:** 162 | **Task:** task-162-ui-matches-list
**Status:** blocked_on_deps
**Blocked by:** task-161-ui-status-api-tests (no success entry in status.jsonl)
**Severity:** 1

