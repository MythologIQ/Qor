---
title: Victor Memory Governance Architecture
date: 2026-03-15
status: proposed
owners:
  - Victor
  - Zo-Qore
---

# Victor Memory Governance Architecture

## Purpose

Define a governed memory architecture for Victor that treats incoming data as chaotic by default and converts it into usable, auditable, revisable memory.

This architecture formalizes the user's working model:

- CAG as short-term memory
- ingest/consolidation as the transformation process
- GraphRAG as long-term memory
- vector embeddings as mnemonic triggers

The key addition in this document is built-in memory governance: every memory write, update, recall, and promotion step must preserve provenance, distinguish observation from inference, and remain reversible.

## Core Thesis

Victor should not behave like a passive knowledge bucket.

Victor should behave like an observing, self-revising epistemic system:

- chaos enters through experience, documents, conversation, logs, and artifacts
- short-term memory holds the active field of attention
- consolidation turns unstable experience into structured candidates
- governance decides what is allowed to become durable memory
- retrieval uses vectors to surface possibilities and the graph to justify meaning

In short:

> vectors retrieve, graphs justify, governance decides.

Retrieval itself should also remain inspectable. Victor should be able to explain not only what he recalled, but how the recall bundle was assembled:

- which chunk strategy was used
- whether semantic graph expansion added evidence
- whether cache mediated the result
- whether negative constraints came from derived summary cache or raw failure memory
- why recall was classified as grounded, advisory, or blocked

## Design Principles

1. Data is chaos until structured.
2. Observation is never neutral and must be labeled.
3. Similarity is not equivalence.
4. Durable memory requires provenance.
5. Contradictions are preserved, not smoothed away.
6. Learning updates models, not just storage volume.
7. Retrieval is advisory until grounded by evidence.
8. Memory writes are governed actions, not background convenience.

## Memory Layers

### 1. CAG: Short-Term Memory

Purpose:

- hold recent interaction state
- preserve current task context
- maintain transient summaries, hypotheses, and active work products

Properties:

- low latency
- mutable
- dependency-tracked
- explicitly staleable
- not automatically durable

Contents:

- current conversation frames
- active hypotheses
- temporary summaries
- working plans
- unresolved contradictions
- recent tool outputs

Rule:

Nothing in CAG becomes long-term memory without passing consolidation and governance.

### 2. Consolidation Layer: Ingest Contract

Purpose:

- metabolize short-term traces and newly ingested artifacts into memory candidates

This is the equivalent of memory consolidation, including REM-like recombination, but it is broader than REM. It includes both synthesis and strict bookkeeping.

Functions:

- source classification
- chunking and anchoring
- claim extraction
- concept extraction
- entity normalization
- relation typing
- contradiction detection
- confidence assignment
- salience scoring
- memory promotion decisions

Outputs:

- graph write candidates
- vector embeddings
- stale-cache invalidations
- audit entries
- unresolved questions

### 3. GraphRAG: Long-Term Memory

Purpose:

- hold durable, typed, traversable memory

Properties:

- provenance-first
- contradiction-aware
- revision-friendly
- queryable by relationship and evidence trail

Contents:

- source documents
- source chunks
- concepts
- claims
- tasks
- decisions
- constraints
- projects
- modules
- personas
- events
- contradictions
- governance rulings

Rule:

GraphRAG stores memory that can explain why it exists.

### 4. Vector Embedding Layer: Mnemonic Triggers

Purpose:

- provide fuzzy semantic recall from chaotic or partial prompts

Properties:

- associative
- approximate
- fast
- non-authoritative on its own

Rule:

Embeddings may trigger retrieval. They may not independently establish truth.

## Memory Governance Model

Memory governance sits across all layers and decides:

- what may be written
- what remains provisional
- what becomes durable
- what becomes stale
- what is allowed to influence response generation

### Governance Objectives

1. Prevent false memory formation.
2. Prevent stale context from masquerading as truth.
3. Preserve minority or contradictory evidence.
4. Bound autonomous memory growth.
5. Keep memory useful for governed action.

### Governance States

Every memory candidate must be in one of these states:

- `ephemeral`: lives only in CAG
- `provisional`: extracted and structured, not yet durable
- `durable`: promoted into GraphRAG
- `contested`: durable but in active contradiction
- `stale`: present but not eligible for trusted recall without refresh
- `deprecated`: superseded but preserved for lineage
- `rejected`: blocked from durable memory

### Governance Gates

#### Gate 1: Provenance Gate

Required before any durable write:

- source exists
- source span or anchor exists
- ingestion run is recorded
- source timestamp or fingerprint is known

Fail condition:

- no provenance means no durable memory

#### Gate 2: Epistemic Type Gate

Each unit must be labeled as one of:

- observation
- source claim
- inferred relation
- synthesis
- conjecture
- policy ruling

Fail condition:

- unlabeled epistemic content cannot be promoted

#### Gate 3: Confidence Gate

Confidence must be assigned separately for:

- extraction confidence
- grounding confidence
- cross-source support
- operational usefulness

Fail condition:

- low confidence may still be stored, but only as provisional or contested

#### Gate 4: Contradiction Gate

Before promotion, the system checks:

- does this contradict an existing durable claim
- is the contradiction resolvable by timestamp, scope, or source authority
- if unresolved, should both claims persist as contested

Fail condition:

- unresolved contradiction cannot be silently merged

#### Gate 5: Promotion Gate

Promotion to durable memory requires:

- provenance complete
- epistemic type assigned
- confidence above configurable threshold
- policy allows the write
- no unresolved safety issue

#### Gate 6: Recall Gate

Before memory may influence output:

- dependencies are not stale
- source grounding is available
- contradiction state is surfaced if relevant
- recall bundle includes evidence trail

Fail condition:

- memory may be shown as weak lead, but not as settled truth

## Data Model

## Core Node Types

- `SourceDocument`
- `SourceChunk`
- `Claim`
- `Concept`
- `Entity`
- `Decision`
- `Constraint`
- `Task`
- `Project`
- `Session`
- `Persona`
- `PolicyRule`
- `GovernanceEvent`
- `Contradiction`
- `CacheEntry`

## Core Edge Types

- `DERIVED_FROM`
- `SUPPORTED_BY`
- `CONTRADICTS`
- `REFINES`
- `SUPERSEDES`
- `IMPLEMENTS`
- `CONSTRAINS`
- `MENTIONS`
- `PART_OF`
- `APPLIES_TO`
- `PROMOTED_BY`
- `REJECTED_BY`
- `DEPENDS_ON`
- `TRIGGERED_BY`

## Required Metadata

Every durable node or edge should carry:

- stable id
- created_at
- updated_at
- source anchor
- source fingerprint
- epistemic type
- confidence score
- governance state
- ingestion run id
- project scope
- actor or pipeline origin

## End-to-End Pipeline

### Stage 0: Encounter

Inputs:

- chat messages
- research docs
- code
- tests
- logs
- plans
- runtime events

Action:

- store raw encounter references in CAG

### Stage 1: Stabilize

Action:

- identify source boundaries
- compute fingerprints
- assign scope
- classify artifact type

Output:

- stable source units

### Stage 2: Observe

Action:

- extract claims, concepts, entities, decisions, constraints, and unresolved questions

Output:

- provisional memory packets

### Stage 3: Differentiate

Action:

- separate observation from inference
- separate source claims from Victor synthesis
- separate implementation facts from aspirations

Output:

- typed provisional graph candidates

### Stage 4: Recombine

Action:

- cluster similar concepts
- relate new observations to prior memory
- detect novelty, reinforcement, and conflict

This is the REM-like function:

- pattern recombination
- abstraction
- salience weighting
- conflict surfacing

### Stage 5: Govern

Action:

- run provenance, confidence, contradiction, and policy gates

Output:

- durable writes
- contested writes
- stale markers
- rejected candidates

### Stage 6: Index

Action:

- write graph entities and relations
- generate embeddings
- update dependency links
- invalidate affected cache entries

### Stage 7: Reflect

Action:

- record what changed in memory
- record what was rejected
- record remaining uncertainty

Output:

- governance ledger event

## Retrieval Arbitration

Retrieval must follow this order:

1. classify request shape
2. search vectors for candidate resonance
3. traverse graph for explicit grounding
4. load fresh cache entries from CAG if dependencies are current
5. assemble evidence bundle
6. surface contradictions and missing information
7. permit response construction

### Retrieval Bundle Contract

A grounded retrieval result should include:

- `query_shape`
- `candidate_hits`
- `grounded_evidence`
- `contradictions`
- `stale_dependencies`
- `missing_information`
- `recommended_next_actions`
- `confidence_summary`

Victor should answer from the retrieval bundle, not directly from nearest-neighbor similarity.

## CAG Governance

CAG must not become an ungoverned dumping ground.

Each cache entry should have:

- cache key
- purpose
- dependency list
- freshness status
- created_at
- expires_at or invalidation trigger
- confidence

### CAG Rules

1. CAG entries are disposable.
2. CAG entries must declare dependencies.
3. Dependency changes automatically mark entries stale.
4. Stale CAG entries cannot outrank grounded graph evidence.
5. Summaries in CAG must preserve links back to graph and sources.

## Promotion Policy

### Promote to Durable Memory When

- the material recurs
- it changes future action
- it constrains governance
- it encodes a stable concept or relation
- it records a decision or commitment
- it captures a reusable lesson with evidence

### Keep Provisional When

- the material is useful but weakly grounded
- the source is new or low trust
- extraction confidence is moderate
- conflict is present but unresolved

### Reject When

- no provenance
- hallucinated source linkage
- policy violation
- duplicate with no added value
- content is operationally irrelevant noise

## Contradiction Handling

Contradiction is a feature, not a bug.

The system should preserve contradiction when:

- two sources disagree
- two time periods differ materially
- aspiration and implementation diverge
- prior belief and new evidence conflict

Contradictions should produce:

- explicit `Contradiction` nodes
- scoped explanations
- resolution status
- recommended adjudication path

Victor should be able to say:

- these two things are similar but incompatible
- this newer source likely supersedes the older one
- this remains unresolved

## Memory Governance Ledger

Every governed memory action should write a ledger event:

- ingest started
- ingest completed
- durable write approved
- candidate rejected
- contradiction registered
- cache invalidated
- memory deprecated
- recall blocked due to staleness

This gives Victor a traceable memory metabolism rather than opaque storage churn.

## Minimal Interfaces

## Ingest

```ts
interface MemoryIngestService {
  stabilizeSource(input: RawArtifact): Promise<StableSource>;
  extractCandidates(source: StableSource): Promise<ProvisionalCandidate[]>;
  governCandidates(candidates: ProvisionalCandidate[]): Promise<GovernanceDecision[]>;
  commitApproved(decisions: GovernanceDecision[]): Promise<CommitResult>;
}
```

## Governance

```ts
interface MemoryGovernanceService {
  checkProvenance(candidate: ProvisionalCandidate): GovernanceCheck;
  classifyEpistemicType(candidate: ProvisionalCandidate): EpistemicType;
  scoreConfidence(candidate: ProvisionalCandidate): ConfidenceProfile;
  detectContradictions(candidate: ProvisionalCandidate): ContradictionReport;
  decidePromotion(candidate: ProvisionalCandidate): PromotionDecision;
}
```

## Retrieval

```ts
interface MemoryRetrievalService {
  search(query: MemoryQuery): Promise<RetrievalBundle>;
  validateRecall(bundle: RetrievalBundle): Promise<RecallDecision>;
}
```

## Failure Modes

### 1. False Coherence

Problem:

- semantically similar items get merged incorrectly

Control:

- graph promotion requires typed relation plus provenance

### 2. Stale Certainty

Problem:

- old summaries keep driving answers after source changes

Control:

- dependency-based invalidation

### 3. Confidence Inflation

Problem:

- inferred synthesis gets recalled as source fact

Control:

- epistemic type labeling and recall gating

### 4. Contradiction Collapse

Problem:

- competing sources are collapsed into bland summary

Control:

- contradiction node and contested state

### 5. Memory Bloat

Problem:

- everything gets promoted

Control:

- operational relevance and recurrence thresholds

### 6. Governance Drift

Problem:

- memory pipeline silently changes behavior

Control:

- policy versioning and governance ledger

## Recommended Implementation Order

### Phase 1: Governance Boundary

- define candidate, decision, contradiction, and retrieval bundle types
- add governance states and epistemic labels
- formalize CAG dependency metadata

### Phase 2: Provenance-First Ingest

- require source anchors for durable writes
- split extraction from promotion
- add contradiction registration

### Phase 3: Recall Arbitration

- make retrieval bundles evidence-first
- make stale CAG entries non-authoritative
- surface contradictions in response assembly

### Phase 4: Reflective Learning

- track memory promotion effectiveness
- demote low-value durable memory
- tune salience and promotion thresholds

## Success Criteria

This architecture is succeeding when:

- Victor can ingest ambiguous research without a user-supplied objective
- Victor distinguishes evidence from inference in recall
- Victor preserves contradictory material without flattening it
- stale summaries stop influencing grounded responses
- memory writes are auditable and reversible
- retrieval quality improves without requiring looser governance

## Bottom Line

Victor's memory system should behave like a governed organism:

- CAG keeps him awake
- consolidation turns experience into candidates
- GraphRAG preserves structured long-term memory
- embeddings act as mnemonic triggers
- governance protects identity, truthfulness, and usefulness

The system is not wise because it stores more.

It becomes wiser only if it learns what may be trusted, what must remain provisional, what conflicts, and what deserves to persist.
