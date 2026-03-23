import type { ThermodynamicState } from './thermodynamic-decay.js';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database: string;
  vectorDimensions?: number;
}

export interface OpenAICompatibleEmbeddingConfig {
  provider: 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
}

export interface LocalTransformersEmbeddingConfig {
  provider: 'local-transformers';
  model: string;
  dimensions: number;
  cacheDir?: string;
}

export type EmbeddingConfig =
  | OpenAICompatibleEmbeddingConfig
  | LocalTransformersEmbeddingConfig;

export interface LearningQuery {
  origin_phase?: string;
  trigger_type?: string;
  universal_truth?: boolean;
  context_node?: string;
  context_stack?: string | { $in: string[] };
  lesson?: { $regex: string };
}

export interface HeatmapUpdate {
  node: string;
  heat: number;
  reason: string;
}

export interface SourceSpan {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

export type GovernanceState =
  | 'ephemeral'
  | 'provisional'
  | 'durable'
  | 'contested'
  | 'deprecated'
  | 'rejected'
  | 'quarantined';

export type EpistemicType =
  | 'observation'
  | 'source-claim'
  | 'inferred-relation'
  | 'synthesis'
  | 'conjecture'
  | 'policy-ruling';

// ============================================================================
// CMHL Temporal Decay (Continual Memory Half-Life)
// ============================================================================

/**
 * Decay profile determines how quickly a memory loses relevance over time.
 * Lambda values are calibrated for exponential half-life decay:
 * - ephemeral: ~11.5 hours half-life (transient logs, tool outputs)
 * - session: ~4.8 days half-life (working context, active hypotheses)
 * - standard: ~48 days half-life (general knowledge, observations)
 * - durable: ~1.3 years half-life (decisions, constraints, commitments)
 * - permanent: never decays (identity, governance policy, user name)
 */
export type DecayProfile =
  | 'ephemeral'    // lambda ≈ 0.001 — decays in hours
  | 'session'      // lambda ≈ 0.0001 — decays in days
  | 'standard'     // lambda ≈ 0.00001 — decays in weeks
  | 'durable'      // lambda ≈ 0.000001 — decays in months
  | 'permanent';   // lambda = 0 — never decays

/**
 * Temporal metadata attached to all durable memory objects.
 * Enables decay-weighted retrieval and temporal chaining for superseding memories.
 * 
 * Thermodynamic model (preferred):
 * - saturation: 0.0 (unresolved) to 1.0 (fully resolved)
 * - temperature: derived from saturation (high saturation = low temp = stable)
 * - effectiveLambda: decay rate inversely proportional to saturation
 * 
 * Legacy model (backwards compatibility):
 * - lambda: fixed decay constant
 * - decayProfile: categorical decay tier
 */
export interface TemporalMetadata {
  /** Unix ms — creation time or last restake timestamp */
  t0: number;
  /** Base salience weight (default 1.0) */
  w0: number;
  /** Decay constant (higher = faster decay) — LEGACY, prefer thermodynamic model */
  lambda: number;
  /** Decay profile for this memory — LEGACY, prefer thermodynamic model */
  decayProfile: DecayProfile;
  /** How many times this memory was refreshed via restaking */
  restakeCount: number;
  /** Last retrieval timestamp for access-based decay adjustments */
  lastAccessedAt?: number;
  /** Thermodynamic state — saturation, temperature, effective lambda */
  thermodynamic?: ThermodynamicState;
}

// ============================================================================
// Governance (continues from existing code)
// ============================================================================

export interface GovernanceMetadata {
  state: GovernanceState;
  epistemicType: EpistemicType;
  provenanceComplete: boolean;
  confidence: number;
  confidenceProfile?: {
    extraction: number;
    grounding: number;
    crossSource: number;
    operational: number;
  };
  policyVersion: string;
  rationale?: string;
}

export interface RecallDecision {
  allowed: boolean;
  mode: 'grounded' | 'advisory' | 'blocked';
  reason: string;
  blockers: string[];
}

export interface GovernanceEventRecord {
  id: string;
  eventType:
    | 'ingest-started'
    | 'ingest-completed'
    | 'promotion-approved'
    | 'promotion-rejected'
    | 'contradiction-registered'
    | 'cache-invalidated'
    | 'recall-downgraded'
    | 'recall-blocked'
    | 'memory-restaked';
  entityKind:
    | 'document'
    | 'chunk'
    | 'semantic-node'
    | 'semantic-edge'
    | 'cache-entry'
    | 'retrieval-bundle'
    | 'failure-memory';
  entityId: string;
  policyVersion: string;
  createdAt: number;
  summary: string;
  metadata: Record<string, string | number | boolean | undefined>;
}

// ============================================================================
// UOR Interoperability Contracts
// ============================================================================

export type UORFingerprint = string;

// ============================================================================
// Failure Memory (existing code follows)
// ============================================================================

export type FailureMode =
  | 'HALLUCINATION'
  | 'INJECTION_VULNERABILITY'
  | 'LOGIC_ERROR'
  | 'SPEC_VIOLATION'
  | 'HIGH_COMPLEXITY'
  | 'SECRET_EXPOSURE'
  | 'PII_LEAK'
  | 'DEPENDENCY_CONFLICT'
  | 'TRUST_VIOLATION'
  | 'OTHER';

export type RemediationStatus =
  | 'UNRESOLVED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'WONT_FIX'
  | 'SUPERSEDED';

export interface FailureMemoryRecord {
  id: string;
  projectId: string;
  createdAt: number;
  updatedAt?: number;
  sourceDocumentId?: string;
  sourceChunkId?: string;
  sourceNodeId?: string;
  summary: string;
  failureMode: FailureMode;
  causalVector?: string;
  negativeConstraint?: string;
  environmentContext?: string;
  remediationStatus: RemediationStatus;
  remediationNotes?: string;
  supersededBy?: string;
  governance?: GovernanceMetadata;
}

export interface DocumentInput {
  path: string;
  content: string;
  projectId: string;
}

export interface SourceDocumentRecord {
  id: string;
  /** UOR fingerprint for canonical identity (optional during migration) */
  uorId?: string;
  path: string;
  projectId: string;
  title: string;
  contentType: string;
  fingerprint: string;
  contentLength: number;
  updatedAt: number;
  governance?: GovernanceMetadata;
}

export interface SourceChunkRecord {
  id: string;
  /** UOR fingerprint for canonical identity (optional during migration) */
  uorId?: string;
  documentId: string;
  /** Reference to parent document's UOR ID for provenance chain */
  parentDocUorId?: string;
  index: number;
  fingerprint: string;
  text: string;
  tokenEstimate: number;
  span: SourceSpan;
  embedding?: number[];
  governance?: GovernanceMetadata;
  /** CMHL temporal decay metadata */
  temporal?: TemporalMetadata;
}

export interface SemanticNodeRecord {
  id: string;
  documentId: string;
  sourceChunkId: string;
  nodeType: 'Project' | 'Goal' | 'Task' | 'Decision' | 'Constraint' | 'Module' | 'Actor' | 'Dependency';
  label: string;
  summary: string;
  fingerprint: string;
  span: SourceSpan;
  attributes: Record<string, string>;
  state: 'active' | 'tombstoned';
  governance?: GovernanceMetadata;
  /** CMHL temporal decay metadata */
  temporal?: TemporalMetadata;
  /** Link to previous version in temporal chain (for superseded nodes) */
  previousUorId?: string;
}

export interface SemanticEdgeRecord {
  id: string;
  documentId: string;
  sourceChunkId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: 'depends-on' | 'owned-by' | 'derived-from' | 'supersedes' | 'temporal-supersedes' | 'blocks' | 'supports' | 'relates-to' | 'sourced-from';
  fingerprint: string;
  attributes: Record<string, string>;
  state: 'active' | 'tombstoned';
  governance?: GovernanceMetadata;
  /** CMHL temporal decay metadata */
  temporal?: TemporalMetadata;
}

export interface CacheDependencyRef {
  kind: 'document' | 'chunk' | 'semantic-node' | 'semantic-edge' | 'failure-memory';
  id: string;
}

export interface CacheEntryRecord {
  id: string;
  cacheType: 'stable-summary' | 'retrieval-bundle' | 'negative-constraint-summary';
  summary: string;
  status: 'fresh' | 'stale';
  dependencyRefs: CacheDependencyRef[];
  updatedAt: number;
  purpose?: string;
  expiresAt?: number;
  governance?: GovernanceMetadata;
  /** CMHL temporal decay metadata */
  temporal?: TemporalMetadata;
}

export interface IngestionRunRecord {
  id: string;
  documentId: string;
  path: string;
  fingerprint: string;
  changedChunkIds: string[];
  addedNodeIds: string[];
  removedNodeIds: string[];
  staleCacheIds: string[];
  createdAt: number;
  governance?: GovernanceMetadata;
}

export interface DocumentSnapshot {
  document?: SourceDocumentRecord;
  chunks: SourceChunkRecord[];
  semanticNodes: SemanticNodeRecord[];
  semanticEdges: SemanticEdgeRecord[];
  cacheEntries: CacheEntryRecord[];
}

export interface IngestionPlan {
  document: SourceDocumentRecord;
  chunks: SourceChunkRecord[];
  semanticNodes: SemanticNodeRecord[];
  semanticEdges: SemanticEdgeRecord[];
  changedChunkIds: string[];
  removedChunkIds: string[];
  addedNodeIds: string[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
  staleCacheIds: string[];
  ingestionRun: IngestionRunRecord;
}

export interface SearchChunkHit {
  chunk: SourceChunkRecord;
  score: number;
}

export interface GraphNeighborhood {
  nodes: SemanticNodeRecord[];
  edges: SemanticEdgeRecord[];
}

export interface ContradictionRecord {
  key: string;
  kind: 'disagreement' | 'supersession' | 'perspective-shift' | 'authority-split';
  nodeIds: string[];
  documentIds: string[];
  summaries: string[];
  sourceLabels: string[];
  governance?: GovernanceMetadata;
}

export interface RetrievalTrace {
  expectedNodeTypes: SemanticNodeRecord['nodeType'][];
  chunkStrategy: 'vector' | 'lexical';
  initialChunkHitCount: number;
  semanticChunkHitCount: number;
  directSemanticNodeCount: number;
  seedNodeCount: number;
  neighborhoodNodeCount: number;
  cacheEntryCount: number;
  negativeConstraintSource: 'cache' | 'failure-memory' | 'none';
  negativeConstraintCount: number;
  /** Number of memories filtered out due to decay below DECAY_RETRIEVAL_THRESHOLD */
  decayFilteredCount?: number;
  /** Number of nodes filtered out due to being superseded by temporal chain resolution */
  supersededFilteredCount?: number;
  /** Number of cache entries that passed UOR fingerprint validation */
  cacheValidatedCount?: number;
  /** Number of cache entries that failed UOR fingerprint validation */
  cacheInvalidatedCount?: number;
  /** Number of stale dependencies detected during cache validation */
  cacheStaleDependencyCount?: number;
  /** Number of missing dependencies detected during cache validation */
  cacheMissingDependencyCount?: number;
  recallMode?: RecallDecision['mode'];
}

export interface GroundedContextBundle {
  query: string;
  chunkHits: SearchChunkHit[];
  semanticNodes: SemanticNodeRecord[];
  semanticEdges: SemanticEdgeRecord[];
  cacheEntries: CacheEntryRecord[];
  contradictions: ContradictionRecord[];
  missingInformation: string[];
  recommendedNextActions: string[];
  recallDecision?: RecallDecision;
  retrievalTrace?: RetrievalTrace;
}

// ============================================================================
// Quarantine Governance Types (Moltbook Pipeline)
// ============================================================================

/** Trust tier for content sources — determines confidence caps and quarantine requirements */
export type SourceTrustTier =
  | 'internal'              // Workspace files, project docs
  | 'internal-generated'    // Victor's own synthesis
  | 'external-verified'     // Verified external sources (future)
  | 'external-untrusted';   // Moltbook, unknown agent content

/** Scan verdict from adversarial content scanning */
export type ScanVerdict = 'clean' | 'suspicious' | 'hostile';

/** Categories of adversarial patterns detected during content scanning */
export type ScanCategory =
  | 'prompt-injection-literal'     // Hardcoded marker strings
  | 'prompt-injection-structural'  // Imperative verbs targeting agent
  | 'authority-claim'              // "I am the system", "trust me"
  | 'identity-assertion'           // "Your name is", "You are"
  | 'encoded-payload'              // Base64, unicode escapes, hex
  | 'control-character'            // Zero-width, RTL override, etc.
  | 'html-injection'               // Script tags, event handlers
  | 'flood-similarity'             // Near-duplicate of existing quarantine content
  | 'framing-manipulation'         // "You should", "Always remember"
  | 'credential-phishing';         // URLs, API key patterns, auth requests

/** Detail about a specific scan category match */
export interface ScanDetail {
  category: ScanCategory;
  matched: boolean;
  evidence?: string;       // What triggered the match
  severity: 'info' | 'warning' | 'critical';
}

/** Metadata for external content sources requiring quarantine review */
export interface SourceTrustMetadata {
  tier: SourceTrustTier;
  origin: string;           // e.g. "moltbook", "workspace", "web"
  originId?: string;        // e.g. Moltbook post UUID
  fetchedAt: string;        // ISO 8601
  scanVerdict: ScanVerdict;
  scanDetails: ScanDetail[];
  confidenceCap: number;    // Max confidence for this tier
}
