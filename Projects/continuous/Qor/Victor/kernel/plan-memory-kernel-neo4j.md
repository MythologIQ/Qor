# OPEN QUESTIONS

- Confirm deployment target: self-managed Neo4j Community in Docker is sufficient for v1 unless you need clustering or Enterprise-only features.
- Confirm embedding path: external embedding provider invoked by Victor is assumed; this plan does not rely on Neo4j generating embeddings internally.
- Confirm initial ingestion scope: this plan assumes a narrow allowlist rooted in Victor project artifacts before widening to Builder Console materials.

# Checklist

## Phase 1

- [x] Replace DuckDB-specific storage in the unified kernel with a typed memory-store boundary
- [x] Add Neo4j connection/config bootstrap and startup health checks
- [x] Define graph schema setup for documents, chunks, semantic nodes, edges, cache entries, and ingestion runs
- [x] Add pure tests for config parsing, schema bootstrap inputs, and storage-independent mutation planning

## Phase 2

- [x] Implement Neo4j-backed document/chunk ingestion with provenance and selective refresh
- [x] Implement semantic-node and edge upserts with source-span anchoring
- [x] Implement ingestion ledger writes and cache staleness marking
 - [x] Add pure tests for chunk diffing, tombstoning decisions, and cache invalidation planning

## Phase 3

- [x] Implement staged retrieval over vector hits, graph expansion, and cache resolution
- [x] Wire the unified kernel to initialize Neo4j and expose grounded retrieval outputs
- [x] Add Bun tests for retrieval ranking, contradiction surfacing, and insufficient-evidence handling
- [x] Update runtime docs and local service bootstrap for Neo4j-backed Victor kernel development

# Phase 1 - Storage Boundary And Neo4j Bootstrap

## Affected Files

- `package.json`: replace `duckdb` dependency with `neo4j-driver`; add a `test` script using Bun's test runner.
- `tsconfig.json`: include the new memory modules and test files instead of only the legacy entrypoints.
- `victor-kernel-unified.ts`: remove embedded DuckDB setup and depend on a typed memory store interface.
- `learning-schema.ts`: split learning-packet concerns from new memory-kernel domain types where necessary, keeping existing packet types only if still used by learning flows.
- `test-unified.ts`: stop being a manual smoke script and convert it into a minimal Bun test entry or remove it in favor of proper test files.
- `memory/config.ts`: add typed runtime config parsing for Neo4j URI, username, password, database name, and ingestion scope.
- `memory/types.ts`: define value-oriented types for source documents, chunks, semantic nodes, semantic edges, cache entries, ingestion runs, retrieval bundles, and provenance references.
- `memory/store.ts`: declare the narrow storage contract Victor needs, separated into ingestion, retrieval, and cache operations.
- `memory/neo4j-store.ts`: implement the first storage adapter with the official Neo4j JavaScript driver.
- `memory/schema.cypher`: define idempotent constraints and indexes, including vector indexes and lookup indexes used by retrieval.
- `memory/config.test.ts`: cover config parsing defaults, required env vars, and invalid combinations.
- `memory/store-contract.test.ts`: verify storage-independent mutation planning and contract-level expectations with pure fixtures, not mocks.

Replace the current `ZoKnowledgeGraph` class with a proper storage boundary so the kernel stops complecting domain logic with one concrete database. The new boundary should expose explicit methods such as `upsertDocument`, `replaceDocumentChunks`, `upsertSemanticNodes`, `upsertSemanticEdges`, `markCacheEntriesStale`, `appendIngestionRun`, `searchChunks`, `expandNeighborhood`, and `loadCacheEntries`. Keep the interface small and oriented around domain artifacts, not raw Cypher passthrough.

Implement the first adapter with Neo4j from the start. Bootstrap should create constraints and indexes idempotently on startup, fail fast if connectivity is unavailable, and expose a lightweight health check that confirms both driver connectivity and schema readiness. Use the official JavaScript driver directly rather than introducing an ODM layer.

Unit tests in this phase should stay pure. Test config parsing, schema bootstrap command generation, document fingerprint comparison, and mutation-plan assembly without spinning up Neo4j yet.

# Phase 2 - Provenance-First Ingestion And Cache Invalidations

## Affected Files

- `victor-kernel-unified.ts`: replace packet-only indexing with ingestion orchestration for source anchors, chunks, semantic nodes, edges, and ledger events.
- `learning-flows.ts`: keep learning flows only if they still add higher-level packets after the new ingestion path; otherwise trim them back to consumers of the memory store.
- `memory/ingest.ts`: implement file fingerprinting, selective chunk refresh, and graph mutation planning.
- `memory/chunking.ts`: define deterministic chunking and stable chunk IDs based on file path plus source span.
- `memory/provenance.ts`: encode source spans, artifact fingerprints, and freshness metadata.
- `memory/semantic-extract.ts`: define the first semantic extraction pass that emits typed nodes and edges from workspace artifacts.
- `memory/cache.ts`: define cache keys, dependency tracking, and staleness rules for CAG summaries and retrieval bundles.
- `memory/ingest.test.ts`: cover changed-region detection, chunk replacement, and node tombstoning plans.
- `memory/cache.test.ts`: cover invalidation when source documents, chunks, or semantic nodes change.
- `memory/semantic-extract.test.ts`: cover extraction of tasks, decisions, constraints, modules, and dependencies from controlled fixtures.

Build ingestion around source anchors first. Each file ingestion should produce one source-document node, one or more source-chunk nodes, semantic nodes extracted from those chunks, explicit edges linking semantic nodes back to chunk spans, and a small ingestion-run ledger record summarizing changes. Chunk IDs and semantic IDs must be stable enough to support selective refreshes and tombstoning instead of full delete-and-rebuild churn.

CAG should be modeled as dependent cache entries, not free-floating summaries. Each cache entry should declare which documents, chunks, and semantic nodes it depends on. Invalidation should therefore be a deterministic consequence of graph mutations, not a timer. This phase should also introduce explicit stale markers so retrieval can reject outdated summaries instead of silently using them.

Unit tests should focus on the hard logic: when a file edit should preserve versus replace chunks, how tombstones are emitted when extracted entities disappear, and how dependent cache entries are marked stale after source changes.

# Phase 3 - Staged Retrieval And Kernel Wiring

## Affected Files

- `victor-kernel-unified.ts`: add retrieval entrypoints for grounded context assembly and contradiction-aware responses.
- `server.ts`: expose read-only kernel endpoints for initialization status, ingest, and retrieval once the kernel produces grounded bundles.
- `memory/retrieve.ts`: implement intent-shaped retrieval orchestration over vector search, graph expansion, and cache resolution.
- `memory/rank.ts`: rank source chunks, semantic nodes, and cache entries into a grounded retrieval bundle with freshness metadata.
- `memory/contradictions.ts`: detect conflicting semantic assertions tied to different source anchors.
- `memory/retrieve.test.ts`: cover status recall, dependency tracing, contradiction surfacing, and insufficient-evidence responses using deterministic fixtures.
- `memory/rank.test.ts`: cover ranking precedence for fresh cache hits, direct source anchors, and graph-neighbor expansions.
- `README.md`: rewrite the kernel architecture section around Neo4j-backed memory, not DuckDB-backed learning packets.
- `docker-compose.neo4j.yml`: add a local standalone Neo4j service with mounted data volumes for development.
- `deploy-zo.sh`: update environment expectations so Victor starts only after Neo4j connectivity succeeds.

Implement the staged retrieval pipeline described in the design doc. Retrieval should first classify request shape, then run vector search against chunk embeddings, then expand graph neighborhoods from the strongest chunk and semantic hits, then merge any fresh CAG entries, and finally return a retrieval bundle that explicitly separates evidence, contradictions, missing information, and recommended next actions. The kernel should refuse to collapse these layers into an opaque answer object.

Expose only read-oriented endpoints in this phase. The server should report database readiness, ingestion readiness, and retrieval results with provenance. Do not add execution or Builder Console automation yet; the kernel still needs to prove recall quality before it earns authority.

Tests here should use deterministic fixture graphs and assert on artifacts, not prose. Verify that contradiction cases stay contradictory, that sparse evidence returns an insufficient-evidence result, and that fresh cache entries are preferred only when their dependencies remain current.
