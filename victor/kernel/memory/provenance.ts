import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';

import type { DocumentInput, SourceDocumentRecord, SourceSpan } from './types';
import { createGovernanceMetadata } from './governance';

export function hashContent(...parts: string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part);
    hash.update('\n');
  }
  return hash.digest('hex');
}

// ============================================================================
// UOR Identity Generation
// ============================================================================

/**
 * Infer canonical ontology type from file path/content type
 * Maps MIME types and extensions to UOR ontology terms
 */
export function inferOntologyType(path: string, contentType?: string): 'Document' | 'CodeFile' | 'Configuration' | 'Data' {
  const extension = extname(path).toLowerCase();
  
  // Code files
  if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.cpp', '.c', '.h', '.rb', '.php', '.swift', '.kt'].includes(extension)) {
    return 'CodeFile';
  }
  
  // Configuration files
  if (['.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf'].includes(extension)) {
    return 'Configuration';
  }
  
  // Data files
  if (['.csv', '.xml', '.sqlite', '.db'].includes(extension)) {
    return 'Data';
  }
  
  // Default to Document for markdown, text, and unknown types
  return 'Document';
}

/**
 * Create UOR fingerprint for a source document
 * Formula: sha256(sourceUrl + "|" + contentHash + "|" + canonicalScope + "|" + ontologyType)
 * 
 * @param sourceUrl - Normalized file path or URL
 * @param contentHash - SHA256 hash of normalized content
 * @param canonicalScope - Project or domain scope (e.g., "victor-resident")
 * @param ontologyType - Canonical type from shared ontology
 * @returns Deterministic UOR fingerprint
 */
export function createUORDocumentId(
  sourceUrl: string,
  contentHash: string,
  canonicalScope: string,
  ontologyType: 'Document' | 'CodeFile' | 'Configuration' | 'Data',
): string {
  const hash = createHash('sha256');
  hash.update(sourceUrl);
  hash.update('|');
  hash.update(contentHash);
  hash.update('|');
  hash.update(canonicalScope);
  hash.update('|');
  hash.update(ontologyType);
  return hash.digest('hex');
}

/**
 * Create UOR fingerprint for a source chunk
 * Formula: sha256(parentDocUorId + "|" + span.start + "|" + span.end + "|" + contentHash)
 * 
 * @param parentDocUorId - UOR ID of parent document
 * @param span - Source span with start/end line and offset info
 * @param contentHash - SHA256 hash of chunk content
 * @returns Deterministic UOR fingerprint for chunk
 */
export function createUORChunkId(
  parentDocUorId: string,
  span: SourceSpan,
  contentHash: string,
): string {
  const hash = createHash('sha256');
  hash.update(parentDocUorId);
  hash.update('|');
  hash.update(String(span.startLine));
  hash.update('|');
  hash.update(String(span.endLine));
  hash.update('|');
  hash.update(String(span.startOffset));
  hash.update('|');
  hash.update(String(span.endOffset));
  hash.update('|');
  hash.update(contentHash);
  return hash.digest('hex');
}

// ============================================================================

export function inferContentType(path: string): string {
  const extension = extname(path).toLowerCase();

  switch (extension) {
    case '.md':
      return 'text/markdown';
    case '.ts':
    case '.tsx':
      return 'text/typescript';
    case '.js':
    case '.jsx':
      return 'text/javascript';
    case '.json':
      return 'application/json';
    case '.yaml':
    case '.yml':
      return 'application/yaml';
    default:
      return 'text/plain';
  }
}

export function createSourceDocument(input: DocumentInput): SourceDocumentRecord {
  const contentHash = hashContent(input.path, input.content);
  const ontologyType = inferOntologyType(input.path);
  const uorId = createUORDocumentId(input.path, contentHash, input.projectId, ontologyType);
  
  return {
    id: hashContent(input.projectId, input.path),
    uorId,
    path: input.path,
    projectId: input.projectId,
    title: basename(input.path),
    contentType: inferContentType(input.path),
    fingerprint: contentHash,
    contentLength: input.content.length,
    updatedAt: Date.now(),
    governance: createGovernanceMetadata('sourceDocument', {
      rationale: 'Source document identity is directly grounded in workspace provenance with UOR canonical identity.',
    }),
  };
}

export function normalizeText(value: string): string {
  return repairCommonMojibake(value.replace(/\r\n/g, '\n')).trim();
}

export function lineOffsets(content: string): number[] {
  const offsets = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

export function createSpan(startLine: number, endLine: number, offsets: number[], endOffset: number): SourceSpan {
  return {
    startLine,
    endLine,
    startOffset: offsets[startLine - 1] ?? 0,
    endOffset,
  };
}

function repairCommonMojibake(value: string): string {
  return value
    .replace(/Ã¢â‚¬â€/g, ' - ')
    .replace(/Ã¢â‚¬Ëœ|Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬Å“|Ã¢â‚¬Â/g, '"')
    .replace(/Ã¢â‚¬Â¦/g, '...')
    .replace(/Ã£â‚¬Â/g, ' ')
    .replace(/Ã£â‚¬â€˜/g, ' ')
    .replace(/Ã‚\u00a0/g, ' ')
    .replace(/\u00a0/g, ' ');
}
