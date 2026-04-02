# Plan: P0 Forge Debug — `/qor/forge` Crash + `/api/forge/status` Guard

**Version**: 1.0  
**Date**: 2026-04-02  
**Status**: DRAFT  
**Chain**: QOR P0 Debug  
**Risk Grade**: L1 (bug fixes in existing routes, no new surfaces)

---

## Problem Statement

Two P0 bugs from `/qor-status` dashboard:

1. **`/qor/forge` page crash** — `ReferenceError: state is not defined`. The component references 4 undeclared variables (`state`, `selectedProjectId`/`setSelectedProjectId`, `tab`/`setTab`, `loading`). The page returns HTTP 200 but crashes client-side on render.

2. **`/api/forge/status` phase status mismatch** — The API uses `p.status === "done"` to count completed phases, but the actual `phases.json` data uses `"complete"` as the status value. Result: API reports 0 completed phases when there are 18. Additionally, the `phases.flatMap` call needs a defensive `Array.isArray` guard to prevent intermittent crashes from transient file read failures.

---

## Phase 1: Fix `/qor/forge` — Undeclared Variables

### Affected Files

- `/qor/forge` (zo.space page route) — Add 3 missing `useState` declarations, fix `state` → `data` reference, remove `loading` reference

### Changes

**1a. Add missing state declarations inside `Forge()` component, after existing `useState` calls:**

```typescript
const [selectedProjectId, setSelectedProjectId] = useState("");
const [tab, setTab] = useState<string>("overview");
```

**1b. Replace `state` reference with `data`:**

```typescript
// BEFORE (broken):
const rootProject = state?.projects?.[0] || null;

// AFTER (fixed):
const rootProject = data?.projects?.[0] || null;
```

**1c. Remove `loading` reference from JSX:**

```tsx
// BEFORE:
{loading ? <section className="forge-card" style={{ color: COLORS.muted }}>Loading Forge state.</section> : null}

// AFTER:
{!data ? <section className="forge-card" style={{ color: COLORS.muted }}>Loading Forge state.</section> : null}
```

**1d. Fix `useEffect` polling — missing dependency array:**

```typescript
// BEFORE (runs on every render, not polling):
useEffect(() => {
  fetch("/api/forge/status", { headers: { Accept: "application/json" } })
    .then(r => r.json())
    .then(d => { setData(d); setError(null); })
    .catch(e => setError(e.message));
}, 30000);

// AFTER (runs once on mount + 30s polling):
useEffect(() => {
  const load = () => fetch("/api/forge/status", { headers: { Accept: "application/json" } })
    .then(r => r.json())
    .then(d => { setData(d); setError(null); })
    .catch(e => setError(e.message));
  load();
  const id = setInterval(load, 30000);
  return () => clearInterval(id);
}, []);
```

### Unit Tests

- `curl -s http://localhost:3099/qor/forge` returns HTTP 200
- `get_space_errors()` returns zero errors for `/qor/forge`
- Screenshot at `localhost:3099/qor/forge` shows rendered UI with Forge data (not blank/error)

---

## Phase 2: Fix `/api/forge/status` — Status Mismatch + Array Guard

### Affected Files

- `/api/forge/status` (zo.space API route) — Fix status comparison values, add `Array.isArray` guard

### Changes

**2a. Fix phase completion detection — accept both `"done"` and `"complete"`:**

```typescript
// BEFORE:
const completedPhases = phases.filter((p: any) => p.status === "done" || (p.tasks || []).every((t: any) => t.status === "done"));

// AFTER:
const completedPhases = phases.filter((p: any) => p.status === "done" || p.status === "complete" || (p.tasks || []).every((t: any) => t.status === "done"));
```

**2b. Add `Array.isArray` guard on `phases` before `flatMap`:**

```typescript
// BEFORE:
const phases: any[] = Array.isArray(rawPhases) ? rawPhases : (rawPhases.phases || []);

// AFTER:
const phasesCandidate = Array.isArray(rawPhases) ? rawPhases : rawPhases.phases;
const phases: any[] = Array.isArray(phasesCandidate) ? phasesCandidate : [];
```

**2c. Fix active phase detection — accept both `"active"` and `"in-progress"`:**

```typescript
// BEFORE:
const activePhase = phases.find((p: any) => p.status === "active") || null;

// AFTER:
const activePhase = phases.find((p: any) => p.status === "active" || p.status === "in-progress") || null;
```

### Unit Tests

- `curl -s http://localhost:3099/api/forge/status | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['forge']['phases']['completed'])"` returns `18` (not `0`)
- `curl -s http://localhost:3099/api/forge/status | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['forge']['progress']['percent'])"` returns `85` (not `0`)
- `curl -s http://localhost:3099/api/forge/status` returns HTTP 200 with valid JSON
- `get_space_errors()` returns zero errors for `/api/forge/status`

---

## Phase 3: Rewire Remaining Forge Routes to `/api/forge/status`

### Problem

2 of 4 Forge sub-routes still fetch from Victor's API (`/api/victor/project-state`) instead of Forge's own `/api/forge/status`. This creates a data sovereignty breach — Forge pages render Victor-shaped data.

| Route | Current Source | Target Source |
|---|---|---|
| `/qor/forge/roadmap` | `/api/victor/project-state` | `/api/forge/status` |
| `/qor/forge/constellation` | `/api/victor/project-state` | `/api/forge/status` |
| `/qor/forge/projects` | `/api/forge/status` | ✅ Already correct |
| `/qor/forge/risks` | `/api/forge/status` | ✅ Already correct |

### Affected Files

- `/qor/forge/roadmap` (zo.space page route) — Change fetch URL
- `/qor/forge/constellation` (zo.space page route) — Change fetch URL, verify data mapping

### Changes

**3a. `/qor/forge/roadmap` — Rewire fetch:**

```typescript
// BEFORE:
fetch("/api/victor/project-state", { headers: { Accept: "application/json" } })

// AFTER:
fetch("/api/forge/status", { headers: { Accept: "application/json" } })
```

Data shape is compatible — both return `projects[0].subProjects` with phases, milestones, dependencies. No accessor changes needed beyond the URL.

**3b. `/qor/forge/constellation` — Rewire fetch + verify data mapping:**

```typescript
// BEFORE:
fetch("/api/victor/project-state", { headers: { Accept: "application/json" } })
  .then(r => r.json()).then(setState)

// AFTER:
fetch("/api/forge/status", { headers: { Accept: "application/json" } })
  .then(r => r.json()).then(setState)
```

The constellation reads `state?.forge` for the hub node's progress. The `/api/forge/status` response has `forge.progress.percent`, `forge.progress.completed`, `forge.progress.total` — compatible shape. Verify accessor paths after rewire.

### Unit Tests

- `get_space_errors()` returns zero errors for both routes after change
- `/qor/forge/roadmap` renders phases from builder-console data (not Victor phases)
- `/qor/forge/constellation` hub node shows Forge progress (85%, not Victor's)
- Neither route source contains the string `/api/victor/project-state`

---

## Phase 4: Restore Victor Heartbeat Runtime State

### Problem

`/tmp/victor-heartbeat/` does not exist. The heartbeat agent writes runtime state files here (`victor.json`, `forge.json`, `victor-shell-cadence.json`). Without them, the `/qor` dashboard and `/qor/victor` show empty heartbeat data. The directory is ephemeral (lost on reboot) and must be recreated.

### Affected Files

- `/tmp/victor-heartbeat/` — Create directory
- Victor heartbeat agent — Verify it's scheduled and running

### Changes

**4a. Create the runtime directory:**

```bash
mkdir -p /tmp/victor-heartbeat
```

**4b. Check if the heartbeat agent is scheduled:**

List agents and verify the Victor heartbeat automation exists with 10m cadence on `vercel:moonshotai/kimi-k2.5`.

**4c. If agent is not scheduled, document the gap** — The heartbeat agent configuration should be restored. This may require checking the Zo agent list and recreating if missing.

### Unit Tests

- `/tmp/victor-heartbeat/` exists after fix
- After one heartbeat tick, `/tmp/victor-heartbeat/victor.json` is written
- `/api/victor/project-state` returns non-empty heartbeat data

---

## Phase 5: Neo4j Connection (Flagged — Not Actionable This Cycle)

### Problem

`ECONNREFUSED 127.0.0.1:7687` appears in recent ledger entries. The Neo4j graph database is not running. This affects the Shadow Genome graph store and any graph-based retrieval.

### Status

**DEFERRED** — Neo4j requires a container runtime (`docker-compose.neo4j.yml` was in the old Victor kernel). The kernel files were migrated but the Docker infrastructure was not. This is an infrastructure task, not a code fix.

### Remediation Path

1. Determine if Neo4j should run on Zo or externally
2. If on Zo: register as a user service with `register_user_service`
3. If external: configure connection string as a secret
4. Update kernel files to gracefully handle missing Neo4j (fail-open for reads, queue for writes)

---

## Audit Checklist

| Pass | Expected |
|------|----------|
| Security (L3) | No new surfaces, no auth changes |
| Ghost UI | No new UI elements — fixing existing broken ones |
| Razor | No new functions; changes are 1-3 lines each |
| Dependency | No new packages |
| Orphan | No new files |
