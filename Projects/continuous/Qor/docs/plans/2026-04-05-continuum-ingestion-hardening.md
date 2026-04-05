# Plan: Continuum Ingestion Pipeline Hardening

**Version**: 1.0  
**Date**: 2026-04-05  
**Status**: DRAFT — Pending `/qor-audit`  
**Chain**: Continuum Operational Independence  
**Risk Grade**: L1 (service registration + API proxy, no new logic)

---

## Problem Statement

Continuum has a fully tested ingestion pipeline (16+ tests passing), a Neo4j graph with 1,192 memory records, 384-dim vector embeddings via MiniLM-L6-v2, and 8 REST endpoints — but **none of it is running**. The API server on port 4100 isn't registered as a service, embeddings haven't been populated, and the zo.space `/qor/continuum` page reads flat JSON files instead of querying the graph.

**Current state**: Code works in tests. Zero operational value.

---

## Phase 1: Service Registration + Embedding Population

### Affected Files

- Zo service registry — register `continuum-api` on port 4100
- `/home/workspace/Projects/continuous/Qor/continuum/src/scripts/batch-embed.ts` — run to populate vectors

### Changes

**1a. Commit uncommitted Continuum changes**

4 files pending (2 modified, 2 new):
- `src/ingest/memory-to-graph.ts` — env-configurable Neo4j creds, entity metadata normalization
- `src/service/server.ts` — heartbeat persistence
- `tests/entity-flatten.test.ts` — 9 new tests
- `src/scripts/batch-embed.ts` — batch embedding utility

Push to `mythologiq/qor` on GitHub.

**1b. Register Continuum as persistent Zo service**

```
register_user_service:
  name: continuum-api
  entrypoint: bun /home/workspace/Projects/continuous/Qor/continuum/src/service/server.ts
  port: 4100
  env:
    NEO4J_URI: bolt://localhost:7687
    NEO4J_USER: neo4j
    NEO4J_PASS: victor-memory-dev
```

Service auto-restarts on crash, survives reboot, logs to `/dev/shm/continuum-api.log`.

**1c. Run batch embedding population**

Execute `bun src/scripts/batch-embed.ts` from the continuum directory. This populates MiniLM-L6-v2 vectors for all ~1,192 nodes. Blocking — wait for completion (~10-20 min).

**1d. Verify service health**

```
curl http://localhost:4100/api/continuum/health
curl http://localhost:4100/api/continuum/stats
curl http://localhost:4100/api/continuum/recall?q=governance&k=3
```

### Unit Tests

- Service responds on port 4100 with `{"status":"ok"}`
- Stats endpoint returns node/edge counts > 0
- Recall endpoint returns results with similarity scores (proves embeddings populated)
- Service appears in `list_user_services` output

---

## Phase 2: zo.space API Proxy + Page Rewire

### Affected Files

- `/api/continuum/graph` (NEW) — zo.space API route proxying to localhost:4100
- `/qor/continuum` — rewire to fetch from graph API instead of flat files

### Changes

**2a. Create `/api/continuum/graph` proxy route**

Single zo.space API route that forwards requests to the local Continuum service:

```typescript
import type { Context } from "hono";

const CONTINUUM_API = "http://localhost:4100";

export default async (c: Context) => {
  const url = new URL(c.req.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) return c.json({ error: "endpoint param required" }, 400);

  const allowed = ["health", "stats", "timeline", "cross-links", "entity", "recall", "sync"];
  if (!allowed.includes(endpoint)) return c.json({ error: "invalid endpoint" }, 400);

  const target = new URL(`${CONTINUUM_API}/api/continuum/${endpoint}`);
  for (const [k, v] of url.searchParams) {
    if (k !== "endpoint") target.searchParams.set(k, v);
  }

  const resp = await fetch(target.toString());
  const data = await resp.json();
  return c.json(data);
};
```

This avoids CORS issues and keeps the Continuum service internal-only.

**2b. Update `/qor/continuum` page to use graph data**

Replace flat-file fetching with graph API calls:

| Current Source | New Source | Data |
|---|---|---|
| `/api/continuum/status` (reads JSON files) | `/api/continuum/graph?endpoint=stats` | Node/edge counts |
| `/api/continuum/status` (recent activity) | `/api/continuum/graph?endpoint=timeline&agent=victor` | Victor stream |
| `/api/continuum/status` (recent activity) | `/api/continuum/graph?endpoint=timeline&agent=qora` | Qora stream |
| (not available) | `/api/continuum/graph?endpoint=recall&q=...&k=10` | Semantic search |
| (not available) | `/api/continuum/graph?endpoint=cross-links&a1=victor&a2=qora` | Cross-agent links |

Add a search bar to the Overview tab that calls the recall endpoint.

**2c. Keep `/api/continuum/status` as fallback**

Don't delete — it works without Neo4j and serves as degraded-mode fallback if the graph service is down. The page should try graph first, fall back to status.

### Unit Tests

- `/api/continuum/graph?endpoint=health` returns `{"status":"ok"}`
- `/api/continuum/graph?endpoint=stats` returns node counts
- `/api/continuum/graph?endpoint=recall&q=governance&k=3` returns scored results
- `/api/continuum/graph?endpoint=invalid` returns 400
- `/qor/continuum` page renders with graph data (stats show node/edge counts, not just file counts)
- Page falls back to `/api/continuum/status` if graph proxy returns error

---

## Phase 3: Test File

### Affected Files

- `continuum/tests/service-integration.test.ts` (NEW)

### Changes

**3a. Integration test for service + proxy**

```typescript
// Tests:
// 1. Service health endpoint responds
// 2. Stats returns non-zero counts
// 3. Timeline returns records for victor
// 4. Timeline returns records for qora
// 5. Cross-links returns relationships
// 6. Recall returns similarity-scored results
// 7. Entity lookup returns network
// 8. Sync triggers without error
```

### Unit Tests

- All 8 integration tests pass against running service
