/**
 * Memory File Ingestion Surface — Governed Document Ingestion API
 *
 * Exposes file and document ingestion so external materials can enter the
 * governed memory pipeline with preserved provenance instead of bypassing
 * the memory system.
 *
 * @module Victor/kernel/memory/memory-file-ingestion
 */

import type {
  DocumentInput,
  SourceDocumentRecord,
  SourceChunkRecord,
  SemanticNodeRecord,
  SemanticEdgeRecord,
  GovernanceMetadata,
  TemporalMetadata,
  GovernanceState,
  EpistemicType,
  DecayProfile,
  SourceTrustLevel,
  IngestionPlan,
} from './types.js';
import type { SourceTrustMetadata } from './source-trust.js';
import type { ThermodynamicState } from './thermodynamic-decay.js';
import { hashContent, createSourceDocument, createUORChunkId } from './provenance.js';
import { chunkDocument } from './chunking.js';
import { extractSemanticGraph } from './semantic-extract.js';
import { createGovernanceMetadata } from './governance.js';
import { createTemporalMetadata } from './rank.js';
import { initializeThermodynamicState } from './thermodynamic-decay.js';

// ============================================================================
// Document Class Types
// ============================================================================

export type DocumentClass =
  | 'code'           // Source code files (ts, js, py, etc.)
  | 'documentation'  // Markdown, text, README files
  | 'configuration'  // Config files (json, yaml, toml, etc.)
  | 'data'          // Data files (csv, xml, etc.)
  | 'test'          // Test files
  | 'unknown';      // Fallback for unrecognized types

export interface DocumentTypeDetection {
  documentClass: DocumentClass;
  mimeType: string;
  extension: string;
  confidence: number;
}

export interface FileIngestionOptions {
  /** File path (relative or absolute) */
  path: string;
  /** File content as string */
  content: string;
  /** Project ID for organization */
  projectId: string;
  /** Optional title override */
  title?: string;
  /** Source trust level for provenance */
  sourceTrustLevel?: SourceTrustLevel;
  /** Initial governance state */
  initialGovernanceState?: GovernanceState;
  /** Decay profile for temporal metadata */
  decayProfile?: DecayProfile;
  /** Epistemic type classification */
  epistemicType?: EpistemicType;
  /** Initial confidence score (0.0-1.0) */
  initialConfidence?: number;
  /** Enable automatic chunking */
  autoChunk?: boolean;
  /** Enable semantic extraction */
  autoExtract?: boolean;
  /** Maximum chunk size in tokens */
  maxChunkSize?: number;
  /** Overlap between chunks in tokens */
  chunkOverlap?: number;
}

export interface IngestionResult {
  success: boolean;
  document: SourceDocumentRecord | null;
  chunks: SourceChunkRecord[];
  semanticNodes: SemanticNodeRecord[];
  semanticEdges: SemanticEdgeRecord[];
  governance: GovernanceMetadata;
  provenance: IngestionProvenance;
  errors: IngestionError[];
  warnings: IngestionWarning[];
}

export interface IngestionProvenance {
  ingestionId: string;
  ingestedAt: number;
  documentClass: DocumentClass;
  sourceTrustLevel: SourceTrustLevel;
  contentFingerprint: string;
  chunkCount: number;
  nodeCount: number;
  edgeCount: number;
  policyVersion: string;
}

export interface IngestionError {
  code: string;
  message: string;
  severity: 'fatal' | 'recoverable';
  context?: Record<string, unknown>;
}

export interface IngestionWarning {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface BatchIngestionResult {
  totalFiles: number;
  successful: number;
  failed: number;
  results: IngestionResult[];
  summary: BatchIngestionSummary;
}

export interface BatchIngestionSummary {
  totalChunks: number;
  totalNodes: number;
  totalEdges: number;
  byDocumentClass: Record<DocumentClass, number>;
  byGovernanceState: Record<GovernanceState, number>;
}

export interface IngestionPolicy {
  requireGovernanceCheck: boolean;
  allowedDocumentClasses: DocumentClass[];
  maxFileSizeBytes: number;
  maxChunkCount: number;
  minConfidenceThreshold: number;
  defaultSourceTrustLevel: SourceTrustLevel;
  defaultDecayProfile: DecayProfile;
  defaultEpistemicType: EpistemicType;
}

// ============================================================================
// Default Policy Configuration
// ============================================================================

export const DEFAULT_INGESTION_POLICY: IngestionPolicy = {
  requireGovernanceCheck: true,
  allowedDocumentClasses: ['code', 'documentation', 'configuration', 'data', 'test', 'unknown'],
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  maxChunkCount: 1000,
  minConfidenceThreshold: 0.3,
  defaultSourceTrustLevel: 'unverified',
  defaultDecayProfile: 'standard',
  defaultEpistemicType: 'source-claim',
};

// ============================================================================
// Document Class Detection
// ============================================================================

const EXTENSION_TO_CLASS: Record<string, DocumentClass> = {
  // Code
  ts: 'code',
  js: 'code',
  py: 'code',
  rs: 'code',
  go: 'code',
  java: 'code',
  cpp: 'code',
  c: 'code',
  h: 'code',
  hpp: 'code',
  rb: 'code',
  php: 'code',
  swift: 'code',
  kt: 'code',
  scala: 'code',
  // Documentation
  md: 'documentation',
  txt: 'documentation',
  rst: 'documentation',
  adoc: 'documentation',
  // Configuration
  json: 'configuration',
  yaml: 'configuration',
  yml: 'configuration',
  toml: 'configuration',
  ini: 'configuration',
  cfg: 'configuration',
  env: 'configuration',
  // Data
  csv: 'data',
  xml: 'data',
  // Test
  test: 'test',
  spec: 'test',
};

/**
 * Detect document class from file path and content.
 */
export function detectDocumentClass(path: string, _content: string): DocumentTypeDetection {
  const extension = path.split('.').pop()?.toLowerCase() || '';
  const documentClass = EXTENSION_TO_CLASS[extension] || 'unknown';
  
  // Determine MIME type based on extension
  const mimeTypes: Record<string, string> = {
    ts: 'text/typescript',
    js: 'text/javascript',
    py: 'text/x-python',
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    csv: 'text/csv',
    xml: 'text/xml',
  };

  return {
    documentClass,
    mimeType: mimeTypes[extension] || 'text/plain',
    extension,
    confidence: documentClass === 'unknown' ? 0.5 : 0.9,
  };
}

// ============================================================================
// Source Trust Integration
// ============================================================================

/**
 * Map source trust level to initial governance state and confidence.
 */
export function mapTrustToGovernance(
  trustLevel: SourceTrustLevel,
): { state: GovernanceState; confidence: number; rationale: string } {
  const mappings: Record<SourceTrustLevel, { state: GovernanceState; confidence: number; rationale: string }> = {
    unverified: {
      state: 'provisional',
      confidence: 0.5,
      rationale: 'Unverified external source requires provisional governance.',
    },
    'user-reviewed': {
      state: 'durable',
      confidence: 0.75,
      rationale: 'User-reviewed content receives elevated trust.',
    },
    verified: {
      state: 'durable',
      confidence: 0.9,
      rationale: 'Verified source earns high-confidence durable state.',
    },
    'cross-verified': {
      state: 'durable',
      confidence: 0.95,
      rationale: 'Cross-verified claims achieve maximum confidence.',
    },
  };

  return mappings[trustLevel];
}

/**
 * Create source trust metadata for ingestion.
 */
export function createIngestionTrustMetadata(
  trustLevel: SourceTrustLevel,
  sourcePath: string,
): SourceTrustMetadata {
  return {
    level: trustLevel,
    source: sourcePath,
    verifiedAt: Date.now(),
    verificationMethod: 'ingestion-pipeline',
  };
}

// ============================================================================
// Governance-Checked Ingestion
// ============================================================================

let currentPolicy: IngestionPolicy = { ...DEFAULT_INGESTION_POLICY };

/**
 * Get current ingestion policy.
 */
export function getIngestionPolicy(): IngestionPolicy {
  return { ...currentPolicy };
}

/**
 * Update ingestion policy.
 */
export function setIngestionPolicy(policy: Partial<IngestionPolicy>): IngestionPolicy {
  currentPolicy = { ...currentPolicy, ...policy };
  return { ...currentPolicy };
}

/**
 * Validate ingestion request against policy.
 */
export function validateIngestionRequest(
  options: FileIngestionOptions,
  policy: IngestionPolicy = currentPolicy,
): { allowed: boolean; errors: IngestionError[]; warnings: IngestionWarning[] } {
  const errors: IngestionError[] = [];
  const warnings: IngestionWarning[] = [];

  // Check file size
  const contentSize = new TextEncoder().encode(options.content).length;
  if (contentSize > policy.maxFileSizeBytes) {
    errors.push({
      code: 'FILE_TOO_LARGE',
      message: `File size ${contentSize} bytes exceeds maximum ${policy.maxFileSizeBytes}`,
      severity: 'fatal',
      context: { size: contentSize, max: policy.maxFileSizeBytes },
    });
  }

  // Check document class
  const detection = detectDocumentClass(options.path, options.content);
  if (!policy.allowedDocumentClasses.includes(detection.documentClass)) {
    errors.push({
      code: 'DOCUMENT_CLASS_NOT_ALLOWED',
      message: `Document class '${detection.documentClass}' is not in allowed list`,
      severity: 'fatal',
      context: { detectedClass: detection.documentClass },
    });
  }

  // Check confidence threshold
  const confidence = options.initialConfidence ?? detection.confidence;
  if (confidence < policy.minConfidenceThreshold) {
    warnings.push({
      code: 'LOW_CONFIDENCE',
      message: `Initial confidence ${confidence} is below threshold ${policy.minConfidenceThreshold}`,
      context: { confidence, threshold: policy.minConfidenceThreshold },
    });
  }

  return {
    allowed: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Core Ingestion Functions
// ============================================================================

/**
 * Ingest a single file into the governed memory pipeline.
 *
 * This is the primary operator-facing function for document ingestion.
 * It performs policy validation, provenance preservation, chunking,
 * and semantic extraction under unified governance.
 */
export function ingestFile(options: FileIngestionOptions): IngestionResult {
  const errors: IngestionError[] = [];
  const warnings: IngestionWarning[] = [];
  const ingestionId = generateIngestionId(options.path, options.content);

  // Step 1: Policy validation
  const validation = validateIngestionRequest(options);
  errors.push(...validation.errors);
  warnings.push(...validation.warnings);

  if (!validation.allowed) {
    return {
      success: false,
      document: null,
      chunks: [],
      semanticNodes: [],
      semanticEdges: [],
      governance: createFailedGovernance(),
      provenance: createEmptyProvenance(ingestionId),
      errors,
      warnings,
    };
  }

  try {
    // Step 2: Document class detection
    const detection = detectDocumentClass(options.path, options.content);

    // Step 3: Create source document with provenance
    const documentInput: DocumentInput = {
      path: options.path,
      content: options.content,
      projectId: options.projectId,
    };

    const sourceDoc = createSourceDocument(documentInput);
    const contentFingerprint = sourceDoc.fingerprint;

    // Step 4: Determine trust and governance
    const trustLevel = options.sourceTrustLevel ?? currentPolicy.defaultSourceTrustLevel;
    const trustMapping = mapTrustToGovernance(trustLevel);
    const governanceState = options.initialGovernanceState ?? trustMapping.state;

    // Step 5: Create governance metadata (policy-checked)
    const governance = createGovernanceMetadata('sourceDocument', {
      state: governanceState,
      epistemicType: options.epistemicType ?? currentPolicy.defaultEpistemicType,
      confidence: options.initialConfidence ?? trustMapping.confidence,
      rationale: trustMapping.rationale,
    });

    // Step 6: Chunk document with provenance
    const rawChunks = options.autoChunk !== false
      ? chunkDocument(sourceDoc, options.content)
      : [];

    const chunks: SourceChunkRecord[] = rawChunks.map((chunk, index) => {
      const thermodynamicState = initializeThermodynamicState(
        options.decayProfile ? mapDecayProfileToSaturation(options.decayProfile) : 0.5
      );

      return {
        id: chunk.id,
        uorId: createUORChunkId(sourceDoc.uorId!, chunk.span, hashContent(chunk.text)),
        parentDocUorId: sourceDoc.uorId,
        documentId: sourceDoc.id,
        index,
        fingerprint: hashContent(chunk.text),
        text: chunk.text,
        tokenEstimate: chunk.tokenEstimate,
        span: chunk.span,
        governance: {
          ...createGovernanceMetadata('sourceChunk', {
            state: governanceState,
            epistemicType: 'source-claim',
            confidence: options.initialConfidence ?? trustMapping.confidence,
          }),
          rationale: `Chunk ${index} of document ${sourceDoc.path}`,
        },
        temporal: createTemporalMetadata('source-claim', {
          thermodynamic: thermodynamicState,
          decayProfile: options.decayProfile ?? currentPolicy.defaultDecayProfile,
        }),
      };
    });

    // Step 7: Validate chunk count
    if (chunks.length > currentPolicy.maxChunkCount) {
      errors.push({
        code: 'TOO_MANY_CHUNKS',
        message: `Generated ${chunks.length} chunks exceeds maximum ${currentPolicy.maxChunkCount}`,
        severity: 'fatal',
        context: { chunkCount: chunks.length, max: currentPolicy.maxChunkCount },
      });

      return {
        success: false,
        document: null,
        chunks: [],
        semanticNodes: [],
        semanticEdges: [],
        governance,
        provenance: createEmptyProvenance(ingestionId),
        errors,
        warnings,
      };
    }

    // Step 8: Extract semantic graph (if enabled)
    let semanticNodes: SemanticNodeRecord[] = [];
    let semanticEdges: SemanticEdgeRecord[] = [];

    if (options.autoExtract !== false && chunks.length > 0) {
      const extraction = extractSemanticGraph(chunks);
      semanticNodes = extraction.nodes.map(node => ({
        ...node,
        governance: {
          ...createGovernanceMetadata('semanticNode', {
            state: governanceState,
            epistemicType: 'inferred-relation',
            confidence: (options.initialConfidence ?? trustMapping.confidence) * 0.9,
          }),
          rationale: 'Inferred from source chunk via semantic extraction',
        },
      }));
      semanticEdges = extraction.edges.map(edge => ({
        ...edge,
        governance: {
          ...createGovernanceMetadata('semanticEdge', {
            state: governanceState,
            epistemicType: 'inferred-relation',
            confidence: (options.initialConfidence ?? trustMapping.confidence) * 0.85,
          }),
          rationale: 'Inferred from co-anchored source structure',
        },
      }));
    }

    // Step 9: Build provenance record
    const provenance: IngestionProvenance = {
      ingestionId,
      ingestedAt: Date.now(),
      documentClass: detection.documentClass,
      sourceTrustLevel: trustLevel,
      contentFingerprint,
      chunkCount: chunks.length,
      nodeCount: semanticNodes.length,
      edgeCount: semanticEdges.length,
      policyVersion: governance.policyVersion,
    };

    return {
      success: true,
      document: {
        ...sourceDoc,
        governance,
      },
      chunks,
      semanticNodes,
      semanticEdges,
      governance,
      provenance,
      errors,
      warnings,
    };

  } catch (error) {
    errors.push({
      code: 'INGESTION_EXCEPTION',
      message: error instanceof Error ? error.message : String(error),
      severity: 'fatal',
      context: { path: options.path },
    });

    return {
      success: false,
      document: null,
      chunks: [],
      semanticNodes: [],
      semanticEdges: [],
      governance: createFailedGovernance(),
      provenance: createEmptyProvenance(ingestionId),
      errors,
      warnings,
    };
  }
}

/**
 * Ingest multiple files in a batch operation.
 */
export function ingestBatch(options: FileIngestionOptions[]): BatchIngestionResult {
  const results: IngestionResult[] = [];
  let successful = 0;
  let failed = 0;

  const summary: BatchIngestionSummary = {
    totalChunks: 0,
    totalNodes: 0,
    totalEdges: 0,
    byDocumentClass: {
      code: 0,
      documentation: 0,
      configuration: 0,
      data: 0,
      test: 0,
      unknown: 0,
    },
    byGovernanceState: {
      ephemeral: 0,
      provisional: 0,
      durable: 0,
      contested: 0,
      deprecated: 0,
      rejected: 0,
      quarantined: 0,
    },
  };

  for (const fileOptions of options) {
    const result = ingestFile(fileOptions);
    results.push(result);

    if (result.success) {
      successful++;
      summary.totalChunks += result.chunks.length;
      summary.totalNodes += result.semanticNodes.length;
      summary.totalEdges += result.semanticEdges.length;
      
      if (result.provenance) {
        summary.byDocumentClass[result.provenance.documentClass]++;
        summary.byGovernanceState[result.governance.state]++;
      }
    } else {
      failed++;
    }
  }

  return {
    totalFiles: options.length,
    successful,
    failed,
    results,
    summary,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateIngestionId(path: string, content: string): string {
  return hashContent(path, content, String(Date.now()));
}

function createFailedGovernance(): GovernanceMetadata {
  return createGovernanceMetadata(undefined, {
    state: 'rejected',
    epistemicType: 'policy-ruling',
    confidence: 0.0,
    rationale: 'Ingestion failed policy validation.',
  });
}

function createEmptyProvenance(ingestionId: string): IngestionProvenance {
  return {
    ingestionId,
    ingestedAt: Date.now(),
    documentClass: 'unknown',
    sourceTrustLevel: 'unverified',
    contentFingerprint: '',
    chunkCount: 0,
    nodeCount: 0,
    edgeCount: 0,
    policyVersion: '1.0.0',
  };
}

function mapDecayProfileToSaturation(profile: DecayProfile): number {
  const mappings: Record<DecayProfile, number> = {
    ephemeral: 0.1,
    session: 0.3,
    standard: 0.5,
    durable: 0.7,
    permanent: 1.0,
  };
  return mappings[profile];
}

/**
 * Get ingestion statistics for governance inspection.
 */
export function getIngestionStats(result: BatchIngestionResult): {
  successRate: number;
  totalChunks: number;
  totalNodes: number;
  totalEdges: number;
  averageChunksPerFile: number;
} {
  const successRate = result.totalFiles > 0 ? result.successful / result.totalFiles : 0;
  const avgChunks = result.totalFiles > 0 ? result.summary.totalChunks / result.totalFiles : 0;

  return {
    successRate,
    totalChunks: result.summary.totalChunks,
    totalNodes: result.summary.totalNodes,
    totalEdges: result.summary.totalEdges,
    averageChunksPerFile: avgChunks,
  };
}

/**
 * Filter ingestion results by document class.
 */
export function filterByDocumentClass(
  results: IngestionResult[],
  docClass: DocumentClass,
): IngestionResult[] {
  return results.filter(r => r.success && r.provenance.documentClass === docClass);
}

/**
 * Filter ingestion results by governance state.
 */
export function filterByGovernanceState(
  results: IngestionResult[],
  state: GovernanceState,
): IngestionResult[] {
  return results.filter(r => r.governance.state === state);
}

/**
 * Check if all results in a batch passed policy validation.
 */
export function allIngestionsValid(result: BatchIngestionResult): boolean {
  return result.failed === 0 && result.results.every(r => r.errors.length === 0);
}

/**
 * Format ingestion result for human-readable display.
 */
export function formatIngestionResult(result: IngestionResult): string {
  const lines = [
    `Ingestion: ${result.success ? 'SUCCESS' : 'FAILED'}`,
    `  Document: ${result.document?.path ?? 'N/A'}`,
    `  Class: ${result.provenance.documentClass}`,
    `  Chunks: ${result.chunks.length}`,
    `  Nodes: ${result.semanticNodes.length}`,
    `  Edges: ${result.semanticEdges.length}`,
    `  Governance: ${result.governance.state} (${result.governance.confidence})`,
    `  Trust: ${result.provenance.sourceTrustLevel}`,
  ];

  if (result.errors.length > 0) {
    lines.push(`  Errors: ${result.errors.length}`);
    for (const error of result.errors) {
      lines.push(`    - [${error.severity}] ${error.code}: ${error.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`  Warnings: ${result.warnings.length}`);
    for (const warning of result.warnings) {
      lines.push(`    - ${warning.code}: ${warning.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * Reset ingestion policy to defaults (primarily for testing).
 */
export function resetIngestionPolicy(): void {
  currentPolicy = { ...DEFAULT_INGESTION_POLICY };
}
