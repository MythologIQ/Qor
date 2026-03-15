import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';

import type { DocumentInput, SourceDocumentRecord, SourceSpan } from './types';

export function hashContent(...parts: string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part);
    hash.update('\n');
  }
  return hash.digest('hex');
}

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
  return {
    id: hashContent(input.projectId, input.path),
    path: input.path,
    projectId: input.projectId,
    title: basename(input.path),
    contentType: inferContentType(input.path),
    fingerprint: hashContent(input.path, input.content),
    contentLength: input.content.length,
    updatedAt: Date.now(),
  };
}

export function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
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
