# Mobile QOR Triage Deck — Revised Plan

**Date:** 2026-03-31  
**Scope:** `/mobile/qor` route refactor  
**Target:** Governed Triage Deck with fullscreen triage surface, swipe-up modal navigation, internal task slide-over, and inline branch action panels  
**Build:** Vite + Zo Space standard platform

---

## Design Summary

Convert `/mobile/qor` from a static app-routes hub into a dynamic triage surface where:
- **Fullscreen triage deck** shows system health, next governed tasks, and decision branches
- **Swipe-up modal navigation** reveals 5-tab nav for app routing
- **Internal task slide-over** displays task details without leaving triage context
- **Inline branch action panels** expand branch cards to show action details/forms in-place
- **Navigation remains first-class** via modal, secondary to triage focus
- **State persistence** tracks focus task, expanded branches, and navigation visibility

---

## Phase 1: Triage Deck Layout & Data Contract

### Affected Files

- `src/routes/mobile-qor.tsx` - Replace hub layout with triage-focused component
- `src/types/triage.ts` - Define triage state, task, branch, health types
- `src/api/mobile-qor-status.ts` - New endpoint aggregating triage data

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
  reason?: string;
  details?: TaskDetail;
}

export interface TaskDetail {
  context: string;
  criteria: string[];
  estimatedDuration: string;
  dependencies?: string[];
}

export interface TriageBranch {
  id: string;
  label: string;
  reason: "normal" | "degraded" | "blocked" | "override-needed";
  actions: BranchAction[];
  expanded?: boolean;
}

export interface BranchAction {
  id: string;
  label: string;
  type: "navigate" | "form" | "confirm";
  payload?: Record<string, any>;
}
```

**New API endpoint** (`src/api/mobile-qor-status.ts`):
Aggregates status into triage shape with 30s cache.

**Refactored component** (`src/routes/mobile-qor.tsx`):
- Fetch from `/api/mobile-qor-status` (30s poll)
- Render health banner, next task card (click opens slide-over), decision branches
- Track `navModalOpen`, `focusedTaskId`, `expandedBranchId` states

### Unit Tests

- `src/routes/mobile-qor.test.ts` - Data loading, triage rendering, state management
- `src/api/mobile-qor-status.test.ts` - Endpoint aggregation, fallback handling
- `src/types/triage.test.ts` - Type contracts

---

## Phase 2: Modal Navigation & Task Slide-Over

### Affected Files

- `src/routes/mobile-qor.tsx` - Add modal nav, gesture handlers, task slide-over
- `src/ui/NavModal.tsx` - Modal nav component
- `src/ui/TaskSlideOver.tsx` - Slide-over panel for task details
- `src/ui/TriageCard.tsx` - Task card with click handler

### Changes

**NavModal** (`src/ui/NavModal.tsx`):
- Fixed overlay (z-index 50), bottom-up slide animation
- 5 tabs, close button, swipe-down dismiss

**TaskSlideOver** (`src/ui/TaskSlideOver.tsx`):
- Right-side slide-over (z-index 60), task details, backdrop dismiss
- Header with label, priority badge, close button
- Body with description, context, criteria, duration
- Footer with action placeholders

**Gesture handling**:
- Swipe-up (bottom 20%) opens nav modal
- Swipe-down or close button dismisses modal
- Task card click opens slide-over
- Slide-over backdrop click closes panel

### Unit Tests

- `src/ui/NavModal.test.ts` - Modal visibility, tab navigation
- `src/ui/TaskSlideOver.test.ts` - Slide-over open/close, task details
- `src/routes/mobile-qor.test.ts` - Gestures, modal state, slide-over state

---

## Phase 3: Inline Branch Panels & Action Flow

### Affected Files

- `src/routes/mobile-qor.tsx` - Inline branch panel expansion
- `src/ui/BranchCard.tsx` - Branch card with expansion state
- `src/ui/BranchActionPanel.tsx` - Inline panel for branch actions
- `src/api/mobile-qor-status.ts` - Task reasoning, branch condition logic

### Changes

**BranchCard** (`src/ui/BranchCard.tsx`):
- Branch label, condition tag (color-coded), expand/collapse chevron
- Click toggles `expandedBranchId` state

**BranchActionPanel** (`src/ui/BranchActionPanel.tsx`):
- Inline panel below card when expanded
- Action buttons: navigate (link), form (inline fields), confirm (prompt)
- Collapse on action completion or outside click

**Decision flow refinement** (`src/api/mobile-qor-status.ts`):
- Derive task reasoning from agent state
- Derive branch conditions from health + task queue
- Order branches by urgency

### Unit Tests

- `src/api/mobile-qor-status.test.ts` - Task reasoning, branch conditions
- `src/ui/BranchCard.test.ts` - Expansion state, condition labels
- `src/ui/BranchActionPanel.test.ts` - Action rendering, panel collapse

---

## Phase 4: Intent Capture & Polishing

### Affected Files

- `src/ui/TaskSlideOver.tsx` - Add task actions (defer, delegate, complete)
- `src/ui/BranchActionPanel.tsx` - Add form fields, confirm flows
- `src/api/intent-capture.ts` - New endpoint for operator intents

### Changes

**Task actions** in slide-over:
- Defer: pick time, record intent
- Delegate: pick agent, record handoff
- Complete: confirm, record resolution

**Branch action completion**:
- Forms submit via `intent-capture` endpoint
- Confirms record intent, show success state
- Auto-collapse panel on success

**Intent capture API** (`src/api/intent-capture.ts`):
- POST /api/intent-capture with action type, target, operator context
- Return confirmation id

### Unit Tests

- `src/api/intent-capture.test.ts` - Intent recording, validation
- `src/ui/TaskSlideOver.test.ts` - Action flows
- `src/ui/BranchActionPanel.test.ts` - Form submission, confirm flows

---

## Acceptance Criteria

- [ ] `/mobile/qor` renders fullscreen triage deck
- [ ] Swipe-up opens modal nav; swipe-down/close dismisses
- [ ] Task card click opens slide-over; backdrop click closes
- [ ] Branch card click expands inline action panel
- [ ] Health banners show 4 agents with status
- [ ] Next task displays with priority and reason
- [ ] Decision branches show with condition labels
- [ ] 30s data poll works without errors
- [ ] Mobile UX passes viewport constraints (375w minimum)
- [ ] All unit tests pass
- [ ] Zero regressions on child routes

---

## Build Path

Vite + Zo Space standard platform:
- Routes compiled via Zo Space build pipeline
- TypeScript strict mode enabled
- No custom bundler configuration required

**Next:** Run `prompt Skills/qor-audit/SKILL.md` to validate this plan.
