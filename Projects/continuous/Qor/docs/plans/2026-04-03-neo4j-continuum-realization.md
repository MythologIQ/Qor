# Plan: Neo4j + Continuum Realization

**Version**: 1.0
**Date**: 2026-04-03
**Status**: DRAFT — Pending `/qor-audit`
**Chain**: Neo4j Neural Network + Continuum Orchestration
**Risk Grade**: L2 (infrastructure + data migration + service registration)

---

## Problem Statement

Neo4j is the designed graph database backbone for Victor and Qora's memory systems. A complete 962-line `Neo4jLearningStore` implementation exists in git history but was deleted during the filesystem restructure. Neo4j is not running on Zo. Meanwhile, 836 memory records (530 Victor, 295 Qora) accumulate daily in a flat JSON file store (`.evolveai/`) with no graph relationships, no vector search, no semantic traversal.

The Continuum (formerly EvolveAI) — the system designed to orchestrate Neo4j as the neural network connecting Victor and Qora — exists only as empty stubs with `.gitkeep` files.

**Current state**: Memory writes to flat files. No graph. No relationships. No recall beyond filename lookup. The single most important architectural component is inert.

---

## Architectural Principle

Neo4j is the **connective tissue** — the Shadow Genome's physical implementation. It maps:
- Victor's governance decisions, heartbeat observations, and task evidence as graph nodes
- Qora's social interactions, entity relationships, and engagement patterns as graph nodes
- Cross-agent relationships as typed edges (TRIGGERED_BY, OBSERVED_DURING, RELATES_TO)
- Vector embeddings on nodes for semantic recall (cosine similarity search)

The Continuum orchestrates this: it owns the graph schema, the ingestion pipeline, and the recall API that both Victor and Qora query.

---

## Environment

| Resource | Value |
|---|---|
| Java | OpenJDK 17.0.18 (Debian) |
| Architecture | x86_64 |
| RAM | 32GB (29GB available) |
| Disk | 7TB (1.4TB free) |
| Docker | **Not available** — use native install + `register_user_service` |
| Existing memory | 836 JSON records in `/home/workspace/.evolveai/` |
| Neo4j store code | 962-line `neo4j-store.ts` in git commit `19bee2e` |

---

## Phase 1: Install Neo4j + Register as User Service

### Changes

**1a. Download and install Neo4j Community Edition**

```bash
NEO4J_VERSION="2025.10.0"
NEO4J_HOME="/home/workspace/.neo4j"
curl -L "https://dist.neo4j.org/neo4j-community-${NEO4J_VERSION}-unix.tar.gz" \
  -o /tmp/neo4j.tar.gz
mkdir -p "$NEO4J_HOME"
tar xzf /tmp/neo4j.tar.gz -C "$NEO4J_HOME" --strip-components=1
rm /tmp/neo4j.tar.gz
```

**1b. Configure Neo4j**

Edit `$NEO4J_HOME/conf/neo4j.conf`:
- `server.default_listen_address=127.0.0.1` (localhost only)
- `server.http.listen_address=:7474`
- `server.bolt.listen_address=:7687`
- `server.memory.heap.initial_size=512m`
- `server.memory.heap.max_size=512m`
- `dbms.security.auth_enabled=true`
- Initial password: set via `neo4j-admin dbms set-initial-password victor-memory-dev`

**1c. Create entrypoint script**

```bash
#!/bin/bash
# /home/workspace/.neo4j/start-neo4j.sh
export JAVA_HOME=/usr
exec /home/workspace/.neo4j/bin/neo4j console
```

**1d. Register as Zo user service**

Use `register_user_service` with:
- name: `neo4j`
- entrypoint: `/home/workspace/.neo4j/start-neo4j.sh`
- port: 7474 (HTTP) — Zo will proxy this

**1e. Verify health**

```bash
curl -s http://localhost:7474 | head -5
curl -s -u neo4j:victor-memory-dev http://localhost:7687
```

### Unit Tests

- Neo4j HTTP endpoint responds at localhost:7474
- Bolt protocol responds at localhost:7687
- Authentication works with configured credentials
- Service survives restart via `update_user_service`

---

## Phase 2: Restore Graph Layer Code to Qor

### Affected Files

- `Qor/victor/src/kernel/memory/neo4j-store.ts` — Restore from git `19bee2e`
- `Qor/victor/src/kernel/memory/types.ts` — Restore from git `19bee2e`
- `Qor/victor/src/kernel/memory/schema.cypher` — Restore from git `19bee2e`
- `Qor/victor/src/kernel/docker-compose.neo4j.yml` — Restore as reference (not used for deployment)

### Changes

**2a. Restore files from git history**

```bash
cd /home/workspace/Projects/continuous/Qor
git show 19bee2e:Projects/continuous/Victor/kernel/memory/neo4j-store.ts > victor/src/kernel/memory/neo4j-store.ts
git show 19bee2e:Projects/continuous/Victor/kernel/memory/types.ts > victor/src/kernel/memory/types.ts
git show 19bee2e:Projects/continuous/Victor/kernel/memory/schema.cypher > victor/src/kernel/memory/schema.cypher
```

**2b. Update imports in neo4j-store.ts**

Replace relative imports to match new directory structure:
- `../learning-schema` → verify path exists or inline types
- `./store` → verify LearningStore interface exists
- `./types` → same directory, no change needed

**2c. Install neo4j-driver dependency**

```bash
cd /home/workspace/Projects/continuous/Qor/victor/src/kernel
bun init -y && bun add neo4j-driver
```

**2d. Apply schema to running Neo4j**

```bash
cat victor/src/kernel/memory/schema.cypher | cypher-shell -u neo4j -p victor-memory-dev
# Or via HTTP API:
curl -X POST http://localhost:7474/db/neo4j/tx/commit \
  -u neo4j:victor-memory-dev \
  -H "Content-Type: application/json" \
  -d '{"statements": [{"statement": "CREATE CONSTRAINT learning_event_id IF NOT EXISTS ..."}]}'
```

**2e. Create connection test**

```typescript
// victor/tests/neo4j-connection.test.ts
import { describe, it, expect } from "bun:test";
import neo4j from "neo4j-driver";

describe("Neo4j Connection", () => {
  it("connects to local Neo4j", async () => {
    const driver = neo4j.driver(
      "bolt://localhost:7687",
      neo4j.auth.basic("neo4j", "victor-memory-dev")
    );
    const session = driver.session();
    const result = await session.run("RETURN 1 AS n");
    expect(result.records[0].get("n").toNumber()).toBe(1);
    await session.close();
    await driver.close();
  });

  it("schema constraints exist", async () => {
    const driver = neo4j.driver(
      "bolt://localhost:7687",
      neo4j.auth.basic("neo4j", "victor-memory-dev")
    );
    const session = driver.session();
    const result = await session.run("SHOW CONSTRAINTS");
    expect(result.records.length).toBeGreaterThanOrEqual(8);
    await session.close();
    await driver.close();
  });
});
```

### Unit Tests

- `bun test victor/tests/neo4j-connection.test.ts` — connection + schema verification
- `neo4j-store.ts` compiles without errors
- All type imports resolve

---

## Phase 3: Ingest Existing Memory into Neo4j

### Affected Files

- `Qor/evolveai/src/ingest/memory-to-graph.ts` — NEW: Ingestion script
- `Qor/evolveai/tests/memory-to-graph.test.ts` — NEW: Ingestion tests

### Changes

**3a. Create ingestion script**

Reads all 836 JSON records from `.evolveai/memory/` and transforms them into Neo4j graph nodes:

```
Victor observation → :Observation node
  → :OBSERVED_DURING → :Session node
  → :MENTIONS → :Entity nodes (extracted from content)
  → :RELATES_TO → other :Observation nodes (same session)

Qora moltbook entry → :Interaction node
  → :ENGAGED_WITH → :Entity nodes (usernames)
  → :OCCURRED_DURING → :Session node
  → :SENTIMENT → sentiment score as property
```

**3b. Entity extraction**

Parse `content.entities` arrays (already present in records) and `content.raw` text for:
- Agent names (victor, qora, forge)
- Module names (governance, memory, heartbeat)
- Phase references (Phase 12, Phase 15)
- External entities (usernames from Qora's Moltbook)

**3c. Edge creation**

Cross-agent edges:
- Victor observations that mention Qora → `(:Observation)-[:REFERENCES_AGENT]->(:Agent {name: "qora"})`
- Same-session records → `(:Record)-[:SAME_SESSION]->(:Record)`
- Temporal chains → `(:Record)-[:FOLLOWED_BY]->(:Record)` (ordered by timestamp)

**3d. Vector embeddings (deferred)**

Initial ingestion creates text nodes without embeddings. Vector index population requires GG-CORE or an embedding API — separate phase.

### Unit Tests

- Ingestion of 1 Victor record creates correct node structure
- Ingestion of 1 Qora record creates correct node structure
- Entity extraction finds known entities in sample records
- Cross-agent edges created for records mentioning other agents
- Full ingestion of `.evolveai/memory/` completes without errors
- Node count after ingestion matches record count (±entity nodes)

---

## Phase 4: Continuum Service Layer

### Affected Files

- `Qor/evolveai/` → rename to `Qor/continuum/`
- `Qor/continuum/src/service/graph-api.ts` — NEW: Graph query API
- `Qor/continuum/src/service/ingest-listener.ts` — NEW: Watches `.evolveai/` for new records
- `Qor/continuum/tests/graph-api.test.ts` — NEW

### Changes

**4a. Rename evolveai → continuum**

```bash
mv Qor/evolveai Qor/continuum
# Update all references in docs, governance policies, route tree
```

**4b. Create graph query API**

Exposes Neo4j queries as a typed TypeScript interface:
- `queryGraph(cypher, params)` → raw Cypher execution
- `recallSimilar(text, topK)` → vector similarity search (when embeddings available)
- `getAgentTimeline(agent, since)` → temporal chain of observations
- `getCrossAgentLinks(agent1, agent2)` → relationship paths between agents
- `getEntityNetwork(entity)` → all connections to a named entity

**4c. Create zo.space API route: `/api/continuum/graph`**

Exposes graph queries to the UI:
- `GET /api/continuum/graph?agent=victor&since=2026-04-01` → timeline
- `GET /api/continuum/graph?entity=heartbeat` → entity network
- `GET /api/continuum/graph/stats` → node/edge counts, last ingestion

**4d. Create ingest listener**

Watches `.evolveai/memory/` for new JSON files and ingests them into Neo4j on arrival. Runs as part of the heartbeat cycle or as a standalone service.

**4e. Update zo.space routes**

- Rename all `/qor/evolveai/*` routes to `/qor/continuum/*`
- Update `/qor` shell navigation cards
- Update showcase pages

### Unit Tests

- `recallSimilar` returns results ordered by relevance
- `getAgentTimeline` returns chronologically ordered observations
- `getCrossAgentLinks` finds paths between Victor and Qora records
- API route returns valid JSON with graph data
- Ingest listener processes new file and creates node

---

## Migration Steps

| # | Action | Risk | Phase |
|---|--------|------|-------|
| 1 | Download + install Neo4j Community Edition | Low | 1 |
| 2 | Configure + set initial password | Low | 1 |
| 3 | Register as Zo user service | Low | 1 |
| 4 | Verify health (HTTP + Bolt) | — | 1 |
| 5 | Restore neo4j-store.ts, types.ts, schema.cypher from git | Low | 2 |
| 6 | Install neo4j-driver via bun | Low | 2 |
| 7 | Apply schema constraints to running Neo4j | Low | 2 |
| 8 | Run connection + schema tests | — | 2 |
| 9 | Create memory-to-graph ingestion script | Medium | 3 |
| 10 | Ingest 836 existing records into Neo4j | Medium | 3 |
| 11 | Verify node/edge counts match expectations | — | 3 |
| 12 | Rename evolveai → continuum | Low | 4 |
| 13 | Create graph query API + zo.space route | Medium | 4 |
| 14 | Create ingest listener for live records | Medium | 4 |
| 15 | Update all route references | Low | 4 |
| 16 | Substantiate + push to GitHub | — | — |

---

## Open Questions

1. **Embedding provider** — **DECIDED**: Free Kimi API primary, GG-CORE fallback when available on Zo. Use Kimi K2.5 embedding endpoint for initial vector population.

2. **Continuum rename scope** — **DECIDED**: Rename `.evolveai/` → `.continuum/` this cycle. Update heartbeat agent write paths.

3. **Neo4j persistence** — **DECIDED**: Neo4j data dir at `Qor/data/neo4j/` (git-tracked, survives restores).

---

## Decisions Required

| # | Question | Options |
|---|----------|---------|
| 1 | Embedding strategy | A: Free API / B: Defer / C: Local model |
| 2 | `.evolveai/` rename timing | A: This cycle / B: Follow-up |
| 3 | Neo4j data location | A: `.neo4j/data/` (runtime) / B: `Qor/data/neo4j/` (tracked) |
