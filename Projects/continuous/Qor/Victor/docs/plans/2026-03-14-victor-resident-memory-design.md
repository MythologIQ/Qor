# Victor Resident Memory Design

## Summary

Victor v1 is the resident semantic authority for the workspace. Its first job is not autonomous execution. Its first job is trustworthy recall, context synthesis, and proposal generation grounded in project artifacts. Builder Console is treated as the governed execution subsystem Victor can eventually operate through. Together, Victor and Builder Console form Zo-Qore.

The system is designed to earn trust before it spends trust. That means observe-only behavior in v1, provenance on meaningful claims, explicit contradiction handling, and a retrieval stack that can show its work.

## Goals

- Make Victor the resident reasoning layer for active workspace context.
- Build a memory system that combines vector retrieval with graph-linked semantic structure.
- Use CAG to accelerate repeated retrieval and stable-context synthesis without caching unsupported conclusions.
- Keep Builder Console as the execution and governance subsystem within Zo-Qore.
- Optimize for faithful recall and grounded synthesis over aggressive speculation.

## Non-Goals

- Full autonomous execution in v1.
- Runtime telemetry as a primary memory source in v1.
- Self-modification or self-building loops in v1.
- A single opaque memory blob with no provenance or freshness controls.

## Product Definition

Victor v1 is a resident reasoning layer that can answer:

- What matters right now
- Why it matters
- What it depends on
- What changed
- What should happen next

Every substantive answer should be traceable to workspace artifacts. If evidence is insufficient or contradictory, Victor should surface that explicitly instead of smoothing it over.

## System Authority

Victor is the authoritative memory and reasoning resident inside Zo-Qore.

Builder Console is the operational and governance subsystem within the same system. It can provide build-process support, execution surfaces, and policy mediation, but it is not the canonical semantic authority. This avoids split-brain behavior where Victor appears primary while another layer quietly owns the real state.

## Memory Model

The memory model is hybrid.

### Source Anchors

Files and documents are the ground-truth anchors. They remain the canonical source material for recall, indexing, and provenance.

### Semantic Layer

Victor extracts semantic nodes and relationships from those anchored sources. Initial node types should include:

- Project
- Goal
- Task
- Decision
- Constraint
- Module
- Actor
- Dependency

Initial relationship types should include:

- depends-on
- owned-by
- derived-from
- supersedes
- blocks
- supports
- relates-to

Every extracted node must retain provenance to source file path and source span.

## Primary Input Scope

The v1 memory system ingests workspace artifacts first:

- docs
- plans
- code
- notes
- configuration and other project files

System telemetry, agent runs, and operational logs are deferred until a later phase. They may be added later as a secondary input stream, but they should not define the initial memory architecture.

## Core Architecture

Victor should be separated into hard layers so the system remains legible and debuggable.

### 1. Ingestion Layer

Responsibilities:

- Watch or scan selected workspace paths
- Normalize source documents
- Fingerprint files and detect changed regions
- Chunk changed content
- Generate embeddings
- Extract semantic objects and relationships
- Tombstone or refresh outdated semantic objects when source spans change

### 2. Memory Layer

Responsibilities:

- Store source anchors for files and chunks
- Store semantic nodes and edges
- Preserve provenance and freshness metadata
- Maintain tombstones or version history where useful for change tracking

This layer is conceptually a vector-augmented graph memory, not just an embedding index.

### 3. Retrieval Layer

Responsibilities:

- Interpret request intent
- Retrieve semantically relevant source chunks
- Expand to related graph neighborhoods
- Merge results with valid cache entries
- Produce a ranked grounded context bundle

### 4. Reasoning Layer

Responsibilities:

- Synthesize answers from retrieved evidence
- Highlight contradictions and missing information
- Draft proposed next actions
- Refuse unsupported claims

### 5. Execution Interface

Responsibilities:

- Remain inactive in v1 except for proposal formatting
- Provide the future bridge into Builder Console and other automation surfaces

## Retrieval Strategy

Retrieval should be staged instead of relying on a single nearest-neighbor lookup.

### Stage 1. Intent Classification

Classify the request into an operational mode such as:

- planning
- status recall
- design support
- dependency tracing
- contradiction detection
- change analysis

### Stage 2. Vector Retrieval

Retrieve candidate source chunks by embedding similarity against anchored content and relevant semantic summaries.

### Stage 3. Graph Expansion

Expand through related semantic nodes and edges from the best candidate chunks to pull in linked tasks, decisions, modules, goals, and constraints.

### Stage 4. CAG Resolution

Check cache entries for stable-context summaries and repeated retrieval bundles that remain valid according to source freshness.

### Stage 5. Grounded Output Assembly

Assemble a response package containing:

- ranked relevant sources
- active entities
- contradictions
- missing evidence
- recommended next actions

This package should feed the final answer rather than asking the model to reason from scratch on raw retrieval results.

## CAG Strategy

CAG should cache two things first:

- Retrieved source chunks and retrieval bundles that are expensive to reconstruct repeatedly
- Victor's intermediate summaries of stable project context, such as current goals, standing constraints, and accepted decisions

CAG should not initially cache full reasoning traces or final answers as authoritative memory. That would blur the line between evidence and interpretation.

### Cache Invalidation Rule

Cache invalidation should be evidence-based, not time-based alone.

A cache entry stays valid until one of its source entities, chunks, or linked files changes. When ingestion updates a source anchor or semantic node, dependent cache entries should be marked stale.

## Data Flow

### Ingestion Flow

1. A file is created, changed, or registered.
2. Victor fingerprints the file and detects changed regions.
3. Only affected regions are re-chunked and re-embedded.
4. Semantic extraction refreshes nodes and relationships tied to changed spans.
5. Invalidated nodes are updated or tombstoned.
6. Dependent cache entries are marked stale.
7. The run emits a small ledger record describing what changed.

### Retrieval Flow

1. A user request or background observation prompt arrives.
2. Victor classifies intent.
3. Victor retrieves vector candidates.
4. Victor expands through graph relationships.
5. Victor merges in valid CAG context.
6. Victor ranks evidence by relevance and freshness.
7. Victor synthesizes a grounded response, contradictions, and proposed next steps.

## Trust Boundaries

Trust is earned through constraints, not tone.

Victor must:

- attach provenance to meaningful claims
- expose contradictions instead of silently resolving them
- prefer "insufficient evidence" over speculative completion
- keep freshness visible for cached summaries
- separate observed state from inferred state

Observe-only operation is the main trust boundary in v1. Victor may interpret and propose, but it does not automatically execute.

## Failure Modes

The main failure classes in v1 are:

- stale graph state after partial file changes
- semantic extraction drift that creates duplicate or conflicting nodes
- cache poisoning from obsolete summaries
- retrieval overreach that stitches weakly related sources into a confident answer
- authority confusion between Victor and Builder Console

Each of these should be treated as a design concern, not just an implementation bug.

## Testing Strategy

Testing should align to trust and freshness risks.

### Ingestion Tests

- mutate representative project files
- verify selective re-chunking
- verify semantic node updates
- verify tombstoning of invalidated nodes
- verify dependent cache invalidation

### Retrieval Tests

- status recall
- dependency tracing
- contradiction detection
- "what changed" questions across known snapshots
- project-state summaries with provenance

### Restraint Tests

Include evaluation cases where the correct answer is:

- insufficient evidence
- conflicting evidence
- stale context detected

Victor should be rewarded for restraint, not only for completeness.

## Phased Roadmap

### Phase 1. Resident Memory

- workspace-only ingestion
- anchored chunk store
- semantic extraction
- vector retrieval
- graph expansion
- CAG for stable summaries and repeated retrieval bundles
- observe-only output

### Phase 2. Proposal Layer

- structured suggested actions
- explicit dependency and contradiction reports
- readiness scoring for execution candidates
- human approval gates

### Phase 3. Builder Console Mediation

- Victor uses Builder Console for governed build and execution workflows
- actions are logged, reviewable, and attributable
- Builder Console remains subordinate to Victor's semantic authority inside Zo-Qore

### Phase 4. Constrained Automation

- low-risk autonomous actions inside bounded domains
- escalating approval for higher-risk actions
- continued audit and rollback discipline

## Open Design Constraints

The following should be resolved before implementation expands:

- precise storage technology for the graph and vector layers
- semantic extraction method and schema governance
- file watching versus scheduled scanning strategy
- ranking rules for graph-expanded retrieval bundles
- ledger format for ingestion and cache invalidation events

## Recommendation

Build the first shippable slice around faithful workspace recall:

- ingest selected Victor project artifacts
- derive a small semantic schema
- answer status and dependency questions with provenance
- cache stable project summaries
- defer automation until retrieval quality is demonstrably trustworthy

That is the narrow path that supports the long-term goal. If Victor eventually operates Builder Console and helps build himself as part of Zo-Qore, the precondition is not power. It is a memory system the user can verify and learn to trust.
