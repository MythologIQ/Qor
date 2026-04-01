# Mobile QOR Triage Deck — Fullscreen Immersion + Modal Nav

**Date:** 2026-03-31  
**Scope:** `/mobile/qor` route refactor  
**Target:** Governed Triage Deck (option 2) with fullscreen triage surface and gesture-accessible modal nav

---

## Design Summary

Convert `/mobile/qor` from a static app-routes hub into a dynamic triage surface where:
- **Fullscreen triage deck** shows system health, next governed tasks, and decision branches
- **Modal navigation** (swipe up / nav button) reveals 5-tab nav for app routing
- **Navigation remains first-class** but is secondary to triage focus
- **State persistence** tracks which task/branch is in focus and navigation visibility

---

## Phase 1: Triage Deck Layout & Data Contract

### Affected Files

- `src/routes/mobile-qor.tsx` - Replace hub layout with triage-focused component
- `src/types/triage.ts` - Define triage state, task, branch, health types
- `src/api/mobile-qor-status.ts` - New endpoint aggregating triage data (health, tasks, branches)

### Changes

**New triage type definitions** (`src/types/triage.ts`):
```typescript
export interface TriageHealth {
  victor: { tier: number; ticks: number; status: "ok" | "degraded" | "blocked" };
  qora: { phase: string; cycles: number; status: "ok" | "degraded" | "blocked" };
  forge: { projectCount: number; mode: string; status: "ok" | "degraded" | "blocked" };
  memory: { victorRecords: number; qoraRecords: number; status: "ok" | "degraded" | "blocked" };
}

export interface TriageTask {
  id: string;
  label: string;
  agent: "victor" | "qora" | "forge" | "memory";
  description: string;
  priority: "critical" | "high" | "normal" | "low";
  reason?: string; // why this task is next
}

export interface TriageBranch {
  id: string;
  label: string;
  reason: "normal" | "degraded" | "blocked" | "override-needed";
  actions: { id: string; label: string; href: string }[];
}
```

**New API endpoint** (`src/api/mobile-qor-status.ts`):
Aggregates `/api/victor/project-state`, `/api/qora/status`, `/api/evolveai/status` into triage shape:
```typescript
GET /api/mobile-qor-status → {
  health: TriageHealth,
  nextTask: TriageTask | null,
  branches: TriageBranch[],
  timestamp: number
}
```

**Refactored component** (`src/routes/mobile-qor.tsx`):
- Fetch from new `/api/mobile-qor-status` endpoint (30s poll)
- Render health banner (4 agent status badges)
- Render next task card (if present)
- Render decision branches (3-4 branch cards)
- Track `navModalOpen` state (boolean)
- Conditionally render bottom nav as modal overlay when `navModalOpen = true`

### Unit Tests

- `src/routes/mobile-qor.test.ts` - Verify data loading, triage card rendering, nav modal state toggle
- `src/api/mobile-qor-status.test.ts` - Verify endpoint aggregation, fallback handling, null task cases

---

## Phase 2: Modal Navigation & Gesture Interaction

### Affected Files

- `src/routes/mobile-qor.tsx` - Add modal nav overlay, gesture handlers, state transitions
- `src/ui/NavModal.tsx` - New reusable modal nav component
- `src/ui/Triage*.tsx` - Extract health, task, branch cards into presentational components

### Changes

**NavModal component** (`src/ui/NavModal.tsx`):
- Fixed position overlay (z-index 50)
- Bottom-up slide animation (Tailwind transform / transition)
- Close button (X or swipe-down gesture)
- 5 tabs with active state highlighting
- Rendered only when `navModalOpen = true`

**Mobile QOR page (`src/routes/mobile-qor.tsx`)**:
- Add nav open button (fixed, bottom-right, z-index 40) to open modal
- On tap/swipe-up from bottom 20% viewport, set `navModalOpen = true`
- On close modal or tab click, set `navModalOpen = false` and navigate if needed
- Main content area: health banner + next task + decision branches
- Extract health, task, branch rendering into `<HealthBanner />`, `<TaskCard />`, `<BranchCard />` components

**Gesture handling**:
- Swipe-up from bottom 20% of viewport opens nav modal
- Swipe-down or click close button dismisses modal
- Tab click triggers navigation and closes modal

### Unit Tests

- `src/ui/NavModal.test.ts` - Verify modal visibility toggle, tab highlighting, navigation
- `src/routes/mobile-qor.test.ts` - Verify gesture handlers, modal state, content visibility under modal open/close

---

## Phase 3: Task List & Decision Tree Rendering + Refinement

### Affected Files

- `src/api/mobile-qor-status.ts` - Expand task reasoning and branch condition logic
- `src/routes/mobile-qor.tsx` - Render task reason, branch condition labels, decision-flow context
- `src/ui/TaskCard.tsx` - Enhanced task card with reason, priority badge, chevron link
- `src/ui/BranchCard.tsx` - Enhanced branch card with condition label, action list, visual indicators

### Changes

**Enhanced task card** (`src/ui/TaskCard.tsx`):
- Agent icon + label
- Task title + description
- Priority badge (color-coded: critical=red, high=orange, normal=blue, low=gray)
- Reason line (e.g., "Next in queue", "Blocked on Qora", "Override needed")
- Chevron → link to task detail route

**Enhanced branch card** (`src/ui/BranchCard.tsx`):
- Branch label (e.g., "Decision: Continue or Escalate?")
- Condition tag (normal / degraded / blocked / override-needed)
- Action list (button per action)
- Visual indicator (color border matching condition)

**Decision flow refinement** (`src/api/mobile-qor-status.ts`):
- Derive task reasoning from agent state (queue position, blocker, override flag, etc.)
- Derive branch conditions from health state and task queue
- Order branches by urgency (critical first, then normal, etc.)

### Unit Tests

- `src/api/mobile-qor-status.test.ts` - Verify task reasoning, branch condition derivation, ordering
- `src/ui/TaskCard.test.ts` - Verify priority badge, reason rendering, link structure
- `src/ui/BranchCard.test.ts` - Verify condition label, action buttons, accessibility

---

## Acceptance Criteria

- [ ] `/mobile/qor` renders fullscreen triage deck (health + task + branches)
- [ ] Bottom nav is modal, accessible via swipe-up or button
- [ ] Modal can be dismissed via swipe-down or close button
- [ ] Tab click navigates and auto-closes modal
- [ ] Health banners show all 4 agents with correct status
- [ ] Next task displays with priority and reason
- [ ] Decision branches display with condition label and action buttons
- [ ] 30s data poll works without errors
- [ ] Fallback rendering when APIs are unavailable
- [ ] Mobile UX passes viewport constraint tests (iPhone SE 375w minimum)
- [ ] All unit tests pass (triage, modal, task, branch components)
- [ ] Zero regressions on existing `/mobile/qor/*` child routes

---

## Success Signal

When complete:
1. Operator opens `/mobile/qor` and immediately sees system health + next task
2. Operator swipes up to access navigation to other modules
3. Operator sees decision branches inline, can take actions without modal switching
4. 30s polling keeps data fresh without manual refresh
5. UX feels immersive and mobile-first (not just a scaled desktop layout)
