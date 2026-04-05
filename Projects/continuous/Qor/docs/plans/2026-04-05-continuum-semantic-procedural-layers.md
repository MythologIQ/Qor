# Plan: Continuum Semantic + Procedural Layers

**Version**: 1.0  
**Date**: 2026-04-05  
**Status**: DRAFT — Pending `/qor-audit`  
**Chain**: Continuum Intelligence Layers  
**Risk Grade**: L2 (new graph node types + derivation pipeline + API surface)

---

## Problem Statement

Continuum has 1,192 episodic records in Neo4j (observations + interactions) but zero Semantic, Procedural, or Relational layer nodes. The layer counts on `/qor/continuum` are hardcoded stubs returning 0. Episodic data goes in but nothing gets distilled out — Continuum is a journal, not an intelligence system.

---

## Architectural Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Derivation strategy | **Hybrid** — incremental for cheap extractions (entity co-occurrence), batch for expensive mining (embedding clusters, workflow sequences) |
| 2 | Semantic layer scope | **Both** — entity co-occurrence nodes (incremental) + embedding cluster nodes (batch). Coexist as different subtypes |
| 3 | Procedural layer scope | **Both** — temporal chain discovery (candidate) + outcome-anchored promotion (validated). Discovery → promotion pipeline |
| 4 | Code location | **Split** — derivation logic in `Qor/qora/src/continuum/`, exposed via API endpoints on Continuum service (port 4100) |

---

## Graph Schema Extensions

### Semantic Nodes

```typescript
interface SemanticNode {
  id: string;
  type: "semantic";
  subtype: "co-occurrence" | "cluster";
  label: string;
  entities: string[];           // contributing entities
  confidence: number;           // 0-1, derived from evidence count
  episodicCount: number;        // number of source records
  firstSeen: string;            // ISO timestamp
  lastSeen: string;
  embedding?: number[];         // 384-dim for cluster nodes
}
```

**Neo4j labels**: `:Semantic:CoOccurrence`, `:Semantic:Cluster`  
**Relationships**:
- `(:Semantic)-[:DERIVED_FROM]->(:Observation|:Interaction)` — provenance
- `(:Semantic)-[:RELATED_TO]->(:Semantic)` — concept-concept links
- `(:Entity)-[:PARTICIPATES_IN]->(:Semantic)` — entity membership

### Procedural Nodes

```typescript
interface ProceduralNode {
  id: string;
  type: "procedural";
  status: "candidate" | "validated";
  label: string;
  steps: { action: string; entity?: string; avgDuration?: number }[];
  occurrences: number;
  successRate: number;           // 0-1, only for validated
  outcomeType?: string;          // what success looks like
  firstSeen: string;
  lastSeen: string;
}
```

**Neo4j labels**: `:Procedural:Candidate`, `:Procedural:Validated`  
**Relationships**:
- `(:Procedural)-[:EXTRACTED_FROM]->(:Observation)` — source chain
- `(:Procedural)-[:PRODUCES]->(:Entity)` — outcome entity
- `(:Procedural)-[:PRECEDES]->(:Procedural)` — workflow composition

---

## Phase 1: Semantic Layer — Incremental Co-occurrence

### Affected Files

- `Qor/qora/src/continuum/semantic-derive.ts` — NEW: co-occurrence extraction logic
- `Qor/qora/tests/semantic-derive.test.ts` — NEW: test suite

### Changes

**`semantic-derive.ts`** — Core functions:

- `findCoOccurrences(records: EpisodicRecord[], minCount: number): CoOccurrence[]` — Scan entity pairs across records, return pairs appearing together ≥ `minCount` times (default 3)
- `createSemanticNode(cooc: CoOccurrence): SemanticNode` — Build a semantic node from a co-occurrence pair with label, confidence, timestamps
- `mergeSemanticNode(existing: SemanticNode, newEvidence: EpisodicRecord[]): SemanticNode` — Update existing node with new evidence (bump count, adjust confidence, update lastSeen)
- `deriveIncrementalSemantic(newRecord: EpisodicRecord, existingNodes: SemanticNode[]): SemanticNode[]` — Given a single new record, check its entities against existing co-occurrence nodes, merge or create as needed
- `persistSemanticNodes(nodes: SemanticNode[], neo4jClient): Promise<number>` — Write/merge nodes to graph with DERIVED_FROM and PARTICIPATES_IN edges
- `getSemanticNodes(neo4jClient, limit?: number): Promise<SemanticNode[]>` — Read semantic nodes from graph

**Confidence formula**: `confidence = min(1.0, episodicCount / 20)` — reaches full confidence at 20 co-occurrences.

### Unit Tests

- Co-occurrence detection finds entity pairs above threshold
- Co-occurrence detection ignores pairs below threshold
- Merge updates count, confidence, and lastSeen without duplicating
- Incremental derivation creates new node when new pair hits threshold
- Incremental derivation merges into existing node when pair already tracked
- Persist writes correct Neo4j node labels and relationships
- Empty input returns empty output (no side effects)

---

## Phase 2: Semantic Layer — Batch Embedding Clusters

### Affected Files

- `Qor/qora/src/continuum/semantic-cluster.ts` — NEW: embedding-based clustering
- `Qor/qora/tests/semantic-cluster.test.ts` — NEW: test suite

### Changes

**`semantic-cluster.ts`** — Core functions:

- `fetchEpisodicEmbeddings(neo4jClient, since?: string): Promise<{id: string, embedding: number[], content: string}[]>` — Pull records with embeddings from graph
- `clusterByCosineSimilarity(records: EmbeddedRecord[], threshold: number): Cluster[]` — Simple agglomerative clustering: merge records with cosine similarity ≥ threshold (default 0.75). Each cluster gets a centroid embedding.
- `labelCluster(cluster: Cluster): string` — Derive label from most frequent entities + top terms across cluster members
- `createClusterNode(cluster: Cluster): SemanticNode` — Build semantic node with subtype "cluster", embedding = centroid
- `reconcileClusters(newClusters: Cluster[], existingNodes: SemanticNode[]): {create: SemanticNode[], merge: SemanticNode[], retire: string[]}` — Diff new clusters against existing cluster nodes. Merge if centroid similarity > 0.85, retire if cluster dissolved, create if new.
- `runBatchClustering(neo4jClient, since?: string): Promise<{created: number, merged: number, retired: number}>` — Full pipeline: fetch → cluster → reconcile → persist

**Clustering approach**: No external dependencies. Cosine similarity with greedy agglomerative merge. O(n²) but episodic count is <10k — tractable.

### Unit Tests

- Cosine similarity correctly groups similar records
- Dissimilar records stay in separate clusters
- Label derivation picks most representative terms
- Reconciliation merges overlapping clusters
- Reconciliation retires dissolved clusters
- Reconciliation creates genuinely new clusters
- Empty embedding set returns zero clusters

---

## Phase 3: Procedural Layer — Discovery + Promotion

### Affected Files

- `Qor/qora/src/continuum/procedural-mine.ts` — NEW: workflow pattern mining
- `Qor/qora/tests/procedural-mine.test.ts` — NEW: test suite

### Changes

**`procedural-mine.ts`** — Core functions:

- `extractTemporalChains(neo4jClient, minLength: number, agent?: string): Promise<Chain[]>` — Follow FOLLOWED_BY edges in graph, extract sequences of ≥ `minLength` (default 3) actions within the same session
- `fingerprint(chain: Chain): string` — Deterministic hash of action sequence (action types + entity types, not content) for dedup
- `findRepeatingPatterns(chains: Chain[], minOccurrences: number): Pattern[]` — Group chains by fingerprint, return patterns appearing ≥ `minOccurrences` (default 2) times
- `createCandidateProcedure(pattern: Pattern): ProceduralNode` — Build candidate procedural node with steps, occurrence count, timestamps
- `checkOutcomeEvidence(procedure: ProceduralNode, neo4jClient): Promise<{hasOutcome: boolean, successRate: number, outcomeType: string}>` — Look at the terminal record of each chain instance. If it has type "task_complete", "evidence_seal", or "governance_verdict" → positive outcome.
- `promoteProcedure(candidate: ProceduralNode, evidence: OutcomeEvidence): ProceduralNode` — Flip status to "validated", set successRate and outcomeType
- `runProcedureMining(neo4jClient): Promise<{candidates: number, promoted: number}>` — Full pipeline: extract chains → find patterns → create/update candidates → check outcomes → promote
- `getProcedures(neo4jClient, status?: string): Promise<ProceduralNode[]>` — Read procedural nodes from graph

**Promotion threshold**: `occurrences >= 3 AND successRate >= 0.6`

### Unit Tests

- Chain extraction follows FOLLOWED_BY edges correctly
- Fingerprint is deterministic for same action sequence
- Fingerprint differs for different sequences
- Pattern detection groups matching fingerprints
- Pattern detection respects minimum occurrence threshold
- Candidate creation captures correct step sequence
- Outcome check identifies task completions
- Promotion flips status and sets metrics
- Procedures below threshold stay as candidates
- Full pipeline runs end-to-end with mock graph data

---

## Phase 4: API Endpoints + Service Wiring

### Affected Files

- `Qor/qora/src/continuum/server-routes.ts` — NEW: route definitions for derivation endpoints
- `Qor/qora/tests/server-routes.test.ts` — NEW: endpoint tests

### Changes

**New endpoints on Continuum service (port 4100)**:

| Method | Path | Purpose | Trigger |
|--------|------|---------|---------|
| POST | `/api/continuum/derive-semantic` | Run incremental co-occurrence for recent records | Heartbeat tick / new record |
| POST | `/api/continuum/cluster-semantic` | Run batch embedding clustering | Scheduled / on-demand |
| POST | `/api/continuum/mine-procedures` | Run full procedural mining pipeline | Scheduled / on-demand |
| GET | `/api/continuum/layers` | Return counts and summaries for all layers | Page load |
| GET | `/api/continuum/semantic?limit=20` | List semantic nodes with metadata | Page display |
| GET | `/api/continuum/procedural?status=all` | List procedural nodes, filterable by status | Page display |

**`/api/continuum/layers` response shape**:
```json
{
  "episodic": { "count": 1192, "latest": "2026-04-05T..." },
  "semantic": {
    "count": 47,
    "coOccurrence": 32,
    "clusters": 15,
    "latest": "2026-04-05T..."
  },
  "procedural": {
    "count": 12,
    "candidates": 8,
    "validated": 4,
    "latest": "2026-04-05T..."
  }
}
```

**Wiring**: Import route handlers into existing Continuum server entry point. No new server process.

### Unit Tests

- POST derive-semantic returns created/merged counts
- POST cluster-semantic returns created/merged/retired counts
- POST mine-procedures returns candidates/promoted counts
- GET layers returns correct shape with real counts from graph
- GET semantic returns paginated list
- GET procedural filters by status parameter
- All POST endpoints are idempotent (running twice doesn't duplicate)

---

## Phase 5: Wire `/qor/continuum` Page to Real Data

### Affected Files

- `/qor/continuum` zo.space page route — UPDATE: replace hardcoded layer stubs with live API calls
- `/api/continuum/graph` zo.space proxy route — UPDATE: add proxy paths for new endpoints

### Changes

**Proxy additions**: Forward `/api/continuum/graph?endpoint=layers`, `semantic`, `procedural`, `derive-semantic`, `cluster-semantic`, `mine-procedures` through the existing graph proxy.

**Page updates**:
- Replace hardcoded `layers` array with fetch from `/api/continuum/graph?endpoint=layers`
- Add "Semantic" tab showing concept nodes (co-occurrence + clusters) with confidence bars
- Add "Procedural" tab showing workflows with candidate/validated badges and success rates
- Add "Derive" button (triggers POST to derive-semantic + mine-procedures, refreshes counts)
- Layer cards in sidebar show real counts from API

### Unit Tests

- Page loads without errors when Continuum service is live
- Page loads with fallback when service is down (existing behavior preserved)
- Layer counts reflect API response
- Derive button triggers POST and refreshes

---

## Migration Steps

| # | Action | Risk |
|---|--------|------|
| 1 | Create `semantic-derive.ts` + tests | Low |
| 2 | Create `semantic-cluster.ts` + tests | Low |
| 3 | Create `procedural-mine.ts` + tests | Low |
| 4 | Create `server-routes.ts` + wire into Continuum server | Medium |
| 5 | Update zo.space proxy to forward new endpoints | Low |
| 6 | Update `/qor/continuum` page to consume real layer data | Low |
| 7 | Run initial derivation to populate layers | Low |
| 8 | Verify all endpoints return live data | — |
| 9 | Substantiate + push to GitHub | — |
