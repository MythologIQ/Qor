# Plan: Forge Build Evidence Trail & Phase Lifecycle Accuracy

**Version**: 1.0  
**Date**: 2026-04-05  
**Status**: DRAFT — Pending `/qor-audit`  
**Chain**: Forge Build Transparency  
**Risk Grade**: L1 (read-only UI additions + API logic fix)

---

## Problem Statement

Forge has 683 ledger entries documenting every build action (create, update, complete-task, claim) — but none of this is visible in the UI. The dashboard shows aggregate progress numbers with no way to see *what happened*, *when*, or *whether it succeeded or failed*.

Additionally, the active phase "Forge Source of Truth Realignment" shows 4/4 tasks done but still reads as `active`. The API doesn't auto-promote completed phases, so the dashboard permanently shows stale "current work" that's already finished.

---

## Phase 1: Build Evidence Trail on `/qor/forge`

### Problem

The Forge dashboard shows 4 metrics (Completion %, Open Work, Active Tasks, Risk Signals) but zero build history. 683 ledger entries exist with actions: `create`, `update`, `complete-task`, `claim` — none surfaced.

### Changes

**1a. Expand `/api/forge/status` response — add `buildLog` field**

The API currently returns `ledger.recent` (last 5 raw entries). Replace with a structured `buildLog` field:

```typescript
buildLog: {
  total: number;
  entries: Array<{
    timestamp: string;
    action: "create" | "update" | "complete-task" | "claim";
    summary: string;      // Human-readable: "Completed task: <title>" or "Claimed: <artifactId>"
    artifactId: string;
    actorId: string;
    status: "success" | "error" | "blocked";  // Derived from entry shape
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
```

Pagination via `?logPage=1&logLimit=15` query params. Default 15 entries, reverse chronological.

Derivation logic:
- `action === "complete-task"` → status `"success"`, summary from `payload.task` or `payload.title`
- `action === "claim"` → status `"success"`, summary `"Claimed: <artifactId>"`
- `action === "create"` → status `"success"`, summary `"Created: <payload.name>"`
- `action === "update"` → status `"success"`, summary from `payload.field` or `"Updated: <artifactId>"`
- If entry has `error` field → status `"error"`, summary includes error message
- If entry has `blocked` or `dry-run` in payload → status `"blocked"`

**1b. Add Build Log section to `/qor/forge` page**

Below the existing metrics row, add a "Build Log" section:

- Section header: "Build Log" with entry count badge
- Each entry is a row: `[timestamp] [action pill] [summary] [actor]`
- Action pills color-coded: `complete-task` → green, `create` → blue, `claim` → amber, `update` → gray
- Status indicator: green dot for success, red dot for error, yellow dot for blocked
- "Load more" button at bottom fetches next page via `?logPage=N`
- Auto-refreshes with the existing 30s polling cycle

### Unit Tests

- `/api/forge/status` returns `buildLog` field with `entries` array and `pagination` object
- Entry `summary` field is non-empty for all action types
- Pagination math: `totalPages === ceil(683 / 15)` ≈ 46
- `?logPage=2&logLimit=5` returns entries 6-10 (not same as page 1)

---

## Phase 2: Phase Lifecycle Accuracy

### Problem

`/api/forge/status` reports `activePhase` as the first phase with `status === "active"`. But the phases.json data doesn't auto-promote phases when all tasks are done. Result: a phase with 4/4 tasks complete still shows as "active" indefinitely.

### Changes

**2a. Add phase status derivation to `/api/forge/status`**

After reading phases, apply a correction pass before returning:

```typescript
for (const phase of phases) {
  const tasks = phase.tasks || [];
  const allDone = tasks.length > 0 && tasks.every(t => t.status === "done");
  if (allDone && phase.status === "active") {
    phase._derivedStatus = "complete";
  }
}
```

Use `_derivedStatus || phase.status` when determining:
- `activePhase` — skip phases where all tasks are done, find the true next active
- `completedPhases` count — include phases with all tasks done regardless of raw status
- Phase list `status` field — return derived status to the UI

**2b. Add `nextPhase` field to API response**

```typescript
forge: {
  ...existing,
  activePhase: { ... },   // Now correctly skips completed phases
  nextPhase: {             // NEW — first phase with status "planned" or "pending"
    name: string;
    tasks: number;
    done: number;
  } | null;
}
```

**2c. Update `/qor/forge` page to show phase transition**

- If `activePhase` is null and `nextPhase` exists: show "Next up: <phase name>" in amber
- If `activePhase` is null and `nextPhase` is null: show "All phases complete" in green
- Current phase section shows derived status, not raw status

### Unit Tests

- Phase with 4/4 tasks done returns `_derivedStatus: "complete"` (not "active")
- `activePhase` is null when all tasks in all active phases are done
- `nextPhase` returns the first planned/pending phase
- `completedPhases` count includes phases with all-done tasks regardless of raw status
- Progress percent recalculates correctly with derived statuses

---

## Filesystem Test

**New file**: `forge/tests/build-log.test.ts`

Tests:
1. Ledger file exists and has entries
2. All entries have required fields (`timestamp`, `action`, `entryId`)
3. Action values are one of the 4 known types
4. Build log summary derivation produces non-empty strings for each action type
5. Phase lifecycle: phase with all tasks done derives as "complete"
6. Pagination math: ceil(total / limit) matches expected pages

---

## Migration Steps

| # | Action | Risk |
|---|--------|------|
| 1 | Add `buildLog` pagination + summary derivation to `/api/forge/status` | Low |
| 2 | Add phase status derivation pass to `/api/forge/status` | Low |
| 3 | Add `nextPhase` field to API response | Low |
| 4 | Add Build Log section to `/qor/forge` page | Low |
| 5 | Update phase display on `/qor/forge` to use derived status | Low |
| 6 | Create `forge/tests/build-log.test.ts` | Low |
| 7 | Verify all Forge routes render with zero errors | — |
| 8 | Substantiate + push to GitHub | — |

---

## What This Plan Does NOT Include

- Write surfaces (task updates, phase creation) — already declared in state.json, separate plan
- Constellation data derivation — deferred to next cycle
- Ledger entry creation from UI — Forge doesn't write its own ledger entries yet
