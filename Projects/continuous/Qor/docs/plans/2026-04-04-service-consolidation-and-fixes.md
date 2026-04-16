# Plan: Service Consolidation + Immediate Fixes

**Version**: 1.0  
**Date**: 2026-04-04  
**Status**: DRAFT  
**Chain**: Infrastructure Repair + Consolidation  
**Risk Grade**: L2 (service deletion + ingestion logic change)

---

## Problem Statement

Five registered services, three of which are dead weight:

| Service | ID | Status | Verdict |
|---|---|---|---|
| `neo4j` | `svc_Vw2b3WN68nM` | Running, healthy | **KEEP** — infrastructure |
| `continuum-api` | `svc_JsVdYqujQAw` | Running, 1001 records ingested | **KEEP** — sole application service |
| `victor-kernel` | `svc_6OwvZPatO9k` | Orphan — module library, not an HTTP server | **DELETE** |
| `qore-runtime` | `svc_yAIjz0WDD_8` | Dead — workdir points to deleted `Zo-Qore/` | **DELETE** |
| `qore-ui` | `svc_4MyhxE2KHgk` | Dead — workdir points to deleted `Zo-Qore/` | **DELETE** |

Three functional issues:

1. **Continuum ingestion skips ~9 records/cycle** — Neo4j rejects `Map` property values when `entities[]` contains objects instead of strings
2. **Heartbeat state lost on reboot** — `/tmp/victor-heartbeat/` is ephemeral; API shows empty state after restart
3. **qore-runtime stale workdir** — Points to deleted path; service is non-functional

---

## Phase 1: Delete Dead Services

### Changes

Delete three services that serve no purpose:

```
svc_yAIjz0WDD_8  (qore-runtime)   — workdir deleted, entrypoint broken
svc_4MyhxE2KHgk  (qore-ui)        — workdir deleted, entrypoint broken
svc_6OwvZPatO9k  (victor-kernel)   — not an HTTP server, imported at build time by zo.space
```

### Verification

- `list_user_services` returns exactly 2 services: `neo4j` + `continuum-api`
- No change to zo.space functionality (routes import kernel files at build time, not via HTTP)

---

## Phase 2: Fix Continuum Ingestion — Flatten Nested Entities

### Root Cause

`getEntities()` in `src/ingest/memory-to-graph.ts` (line 91-92) returns raw array elements from memory records. Some records have entity arrays containing objects like `{name: "Qor", type: "project", status: "active"}` instead of plain strings. When these objects reach `ensureEntity(session, entityName)`, Neo4j rejects the Map value.

Error pattern from logs:
```
Skip record 527 in victor: Property values can only be of primitive types or arrays thereof.
Encountered: Map{type -> String("project"), entity -> String("Qor")}.
```

### Affected Files

- `Projects/continuous/Qor/continuum/src/ingest/memory-to-graph.ts` — `getEntities()` function + `ingestRecord()` entity loop

### Changes

**2a. Fix `getEntities()` to flatten object entities into strings:**

```typescript
function getEntities(r: MemoryRecord): string[] {
  const raw = isStructured(r) ? r.content.entities ?? [] : r.metadata?.entities ?? [];
  return raw.map((e: unknown) => {
    if (typeof e === "string") return e;
    if (e && typeof e === "object" && "name" in e) return String((e as Record<string, unknown>).name);
    if (e && typeof e === "object" && "entity" in e) return String((e as Record<string, unknown>).entity);
    return String(e);
  }).filter(Boolean);
}
```

**2b. Add metadata extraction for object entities:**

When an entity is an object with `type`/`status` fields, store those as properties on the Entity node:

```typescript
async function ensureEntity(session: Session, name: string, meta?: Record<string, string>) {
  const props = meta
    ? { name, now: Date.now(), ...meta }
    : { name, now: Date.now() };
  const setClause = meta
    ? Object.keys(meta).map(k => `e.${k} = $${k}`).join(", ") + ", "
    : "";
  await session.run(
    `MERGE (e:Entity {name: $name}) ON CREATE SET ${setClause}e.createdAt = $now`,
    props
  );
}
```

Update `ingestRecord()` entity loop to pass flattened metadata:

```typescript
for (const entityItem of rawEntities) {
  const { name, meta } = flattenEntity(entityItem);
  if (!name) continue;
  await ensureEntity(session, name, meta);
  await session.run(
    `MATCH (n {id: $id}), (e:Entity {name: $ename})
     MERGE (n)-[:MENTIONS]->(e)`,
    { id, ename: name }
  );
}
```

### Tests

- Ingest a record with `entities: [{name: "Qor", type: "project"}]` — should create Entity node with `name="Qor"`, `type="project"`
- Ingest a record with `entities: ["Victor", "Qora"]` — should create two Entity nodes (existing behavior)
- Ingest a record with `entities: [{entity: "Qor"}]` — should extract name from `entity` field
- Full `ingestAll()` completes with 0 skipped records for known test data
- Restart `continuum-api` service, verify next sync cycle shows 0 skips in logs

---

## Phase 3: Persist Heartbeat State

### Root Cause

Victor heartbeat agent writes state to `/tmp/victor-heartbeat/`. This directory is wiped on every reboot. The `/api/victor/project-state` route reads from these paths and falls back to empty state when they're missing.

### Affected Files

- `Projects/continuous/Qor/continuum/src/service/server.ts` — Add heartbeat state persistence endpoint
- zo.space route `/api/victor/project-state` — Update `PATHS.heartbeatCandidates` to read from persistent location first, `/tmp/` as fallback

### Changes

**3a. Create persistent heartbeat directory:**

```
mkdir -p /home/workspace/Projects/continuous/Qor/victor/.heartbeat/
```

**3b. Add heartbeat persistence endpoint to continuum-api:**

New route `POST /api/continuum/heartbeat-sync` that copies `/tmp/victor-heartbeat/*.json` to `Qor/victor/.heartbeat/` on each sync cycle. Add to the existing `syncCycle()` function so it runs automatically every 5 minutes.

```typescript
async function persistHeartbeat() {
  const tmpDir = "/tmp/victor-heartbeat";
  const persistDir = "/home/workspace/Projects/continuous/Qor/victor/.heartbeat";
  try {
    const files = await readdir(tmpDir);
    for (const f of files) {
      if (f.endsWith(".json")) {
        await Bun.write(join(persistDir, f), Bun.file(join(tmpDir, f)));
      }
    }
  } catch { /* /tmp dir may not exist yet */ }
}
```

Call `persistHeartbeat()` at the end of `syncCycle()`.

**3c. Update PATHS in `/api/victor/project-state`:**

```typescript
heartbeatCandidates: [
  "/home/workspace/Projects/continuous/Qor/victor/.heartbeat/victor.json",
  "/home/workspace/Projects/continuous/Qor/victor/.heartbeat/forge.json",
  "/tmp/victor-heartbeat/victor.json",
  "/tmp/victor-heartbeat/forge.json",
],
cadenceOverride: "/home/workspace/Projects/continuous/Qor/victor/.heartbeat/victor-shell-cadence.json",
```

The route already tries candidates in order and skips missing files, so persistent paths first + `/tmp/` fallback requires no logic change.

### Tests

- Write a test JSON to `/tmp/victor-heartbeat/test.json`, call `POST /api/continuum/heartbeat-sync`, verify file exists at `Qor/victor/.heartbeat/test.json`
- Reboot scenario: delete `/tmp/victor-heartbeat/`, verify `/api/victor/project-state` still returns heartbeat data from persistent path
- After heartbeat agent runs: verify both `/tmp/` and persistent copy exist and match

---

## Service Inventory After Plan

| Service | Port | Purpose |
|---|---|---|
| `neo4j` | 7474/7687 | Graph database infrastructure |
| `continuum-api` | 4100 | Memory ingestion + semantic recall + heartbeat persistence |

**2 services total.** Down from 5.

---

## Migration Steps

| # | Action | Risk |
|---|--------|------|
| 1 | Delete `qore-runtime` service | None — already broken |
| 2 | Delete `qore-ui` service | None — already broken |
| 3 | Delete `victor-kernel` service | Low — verify zo.space still builds |
| 4 | Fix `getEntities()` in memory-to-graph.ts | Low |
| 5 | Add entity metadata extraction | Low |
| 6 | Write + run ingestion tests | — |
| 7 | Restart `continuum-api`, verify 0 skipped records | — |
| 8 | Create persistent heartbeat directory | None |
| 9 | Add heartbeat persistence to continuum-api sync cycle | Low |
| 10 | Update PATHS in `/api/victor/project-state` | Low |
| 11 | Verify heartbeat data survives simulated reboot | — |
| 12 | Update META_LEDGER + push to GitHub | — |
