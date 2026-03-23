/**
 * UOR Identity Generation Tests
 *
 * Tests for UOR fingerprint and identity generation functions
 * following deterministic identity principles from the UOR design.
 */

import { describe, expect, it } from 'bun:test';
import {
  createUORDocumentId,
  createUORChunkId,
  inferOntologyType,
  hashContent,
} from './provenance';
import type { SourceSpan } from './types';

describe('UOR Identity Generation', () => {
  describe('inferOntologyType', () => {
    it('should classify TypeScript files as CodeFile', () => {
      expect(inferOntologyType('/path/to/file.ts')).toBe('CodeFile');
      expect(inferOntologyType('/path/to/file.tsx')).toBe('CodeFile');
    });

    it('should classify JavaScript files as CodeFile', () => {
      expect(inferOntologyType('/path/to/file.js')).toBe('CodeFile');
      expect(inferOntologyType('/path/to/file.jsx')).toBe('CodeFile');
    });

    it('should classify Python files as CodeFile', () => {
      expect(inferOntologyType('/path/to/file.py')).toBe('CodeFile');
    });

    it('should classify Rust files as CodeFile', () => {
      expect(inferOntologyType('/path/to/file.rs')).toBe('CodeFile');
    });

    it('should classify Java files as CodeFile', () => {
      expect(inferOntologyType('/path/to/File.java')).toBe('CodeFile');
    });

    it('should classify C/C++ files as CodeFile', () => {
      expect(inferOntologyType('/path/to/file.c')).toBe('CodeFile');
      expect(inferOntologyType('/path/to/file.cpp')).toBe('CodeFile');
      expect(inferOntologyType('/path/to/file.h')).toBe('CodeFile');
    });

    it('should classify JSON files as Configuration', () => {
      expect(inferOntologyType('/path/to/config.json')).toBe('Configuration');
    });

    it('should classify YAML files as Configuration', () => {
      expect(inferOntologyType('/path/to/config.yaml')).toBe('Configuration');
      expect(inferOntologyType('/path/to/config.yml')).toBe('Configuration');
    });

    it('should classify TOML files as Configuration', () => {
      expect(inferOntologyType('/path/to/config.toml')).toBe('Configuration');
    });

    it('should classify CSV files as Data', () => {
      expect(inferOntologyType('/path/to/data.csv')).toBe('Data');
    });

    it('should classify XML files as Data', () => {
      expect(inferOntologyType('/path/to/data.xml')).toBe('Data');
    });

    it('should classify Markdown files as Document', () => {
      expect(inferOntologyType('/path/to/readme.md')).toBe('Document');
    });

    it('should classify text files as Document', () => {
      expect(inferOntologyType('/path/to/notes.txt')).toBe('Document');
    });

    it('should default unknown extensions to Document', () => {
      expect(inferOntologyType('/path/to/file.unknown')).toBe('Document');
      expect(inferOntologyType('/path/to/file')).toBe('Document');
    });

    it('should be case-insensitive for extensions', () => {
      expect(inferOntologyType('/path/to/file.TS')).toBe('CodeFile');
      expect(inferOntologyType('/path/to/file.JSON')).toBe('Configuration');
      expect(inferOntologyType('/path/to/file.MD')).toBe('Document');
    });
  });

  describe('createUORDocumentId', () => {
    it('should produce deterministic 64-character hex hash', () => {
      const uorId = createUORDocumentId(
        '/workspace/project/doc.md',
        'abc123hash',
        'victor-resident',
        'Document',
      );

      expect(uorId).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce same ID for same inputs (deterministic)', () => {
      const inputs = {
        sourceUrl: '/workspace/project/doc.md',
        contentHash: 'sha256:def456',
        canonicalScope: 'zo-qore',
        ontologyType: 'CodeFile' as const,
      };

      const id1 = createUORDocumentId(
        inputs.sourceUrl,
        inputs.contentHash,
        inputs.canonicalScope,
        inputs.ontologyType,
      );
      const id2 = createUORDocumentId(
        inputs.sourceUrl,
        inputs.contentHash,
        inputs.canonicalScope,
        inputs.ontologyType,
      );

      expect(id1).toBe(id2);
    });

    it('should produce different IDs for different source URLs', () => {
      const contentHash = 'sha256:samecontent';
      const scope = 'victor-resident';
      const type = 'Document' as const;

      const id1 = createUORDocumentId('/path/a.md', contentHash, scope, type);
      const id2 = createUORDocumentId('/path/b.md', contentHash, scope, type);

      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different content hashes', () => {
      const sourceUrl = '/path/doc.md';
      const scope = 'victor-resident';
      const type = 'Document' as const;

      const id1 = createUORDocumentId(sourceUrl, 'hash1', scope, type);
      const id2 = createUORDocumentId(sourceUrl, 'hash2', scope, type);

      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different scopes', () => {
      const sourceUrl = '/path/doc.md';
      const contentHash = 'sha256:samecontent';
      const type = 'Document' as const;

      const id1 = createUORDocumentId(sourceUrl, contentHash, 'scope-a', type);
      const id2 = createUORDocumentId(sourceUrl, contentHash, 'scope-b', type);

      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different ontology types', () => {
      const sourceUrl = '/path/doc.md';
      const contentHash = 'sha256:samecontent';
      const scope = 'victor-resident';

      const id1 = createUORDocumentId(sourceUrl, contentHash, scope, 'Document');
      const id2 = createUORDocumentId(sourceUrl, contentHash, scope, 'CodeFile');

      expect(id1).not.toBe(id2);
    });

    it('should incorporate all formula components', () => {
      // Verify the formula produces consistent results by checking same inputs give same outputs
      const sourceUrl = '/test/doc.md';
      const contentHash = 'content123';
      const canonicalScope = 'test-scope';
      const ontologyType = 'Document' as const;

      // Run multiple times to verify determinism
      const id1 = createUORDocumentId(sourceUrl, contentHash, canonicalScope, ontologyType);
      const id2 = createUORDocumentId(sourceUrl, contentHash, canonicalScope, ontologyType);
      const id3 = createUORDocumentId(sourceUrl, contentHash, canonicalScope, ontologyType);

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
      expect(id1).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('createUORChunkId', () => {
    it('should produce deterministic 64-character hex hash', () => {
      const span: SourceSpan = {
        startLine: 1,
        endLine: 10,
        startOffset: 0,
        endOffset: 100,
      };

      const chunkId = createUORChunkId(
        'parent-doc-uor-id-123',
        span,
        'chunk-content-hash',
      );

      expect(chunkId).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce same ID for same inputs (deterministic)', () => {
      const parentUorId = 'parent-doc-uor-id';
      const span: SourceSpan = { startLine: 5, endLine: 15, startOffset: 100, endOffset: 500 };
      const contentHash = 'chunk-hash-abc';

      const id1 = createUORChunkId(parentUorId, span, contentHash);
      const id2 = createUORChunkId(parentUorId, span, contentHash);

      expect(id1).toBe(id2);
    });

    it('should produce different IDs for different parent document IDs', () => {
      const span: SourceSpan = { startLine: 1, endLine: 5, startOffset: 0, endOffset: 100 };
      const contentHash = 'same-content';

      const id1 = createUORChunkId('parent-a', span, contentHash);
      const id2 = createUORChunkId('parent-b', span, contentHash);

      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different spans', () => {
      const parentUorId = 'parent-doc';
      const contentHash = 'same-content';

      const span1: SourceSpan = { startLine: 1, endLine: 5, startOffset: 0, endOffset: 100 };
      const span2: SourceSpan = { startLine: 6, endLine: 10, startOffset: 100, endOffset: 200 };

      const id1 = createUORChunkId(parentUorId, span1, contentHash);
      const id2 = createUORChunkId(parentUorId, span2, contentHash);

      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different content hashes', () => {
      const parentUorId = 'parent-doc';
      const span: SourceSpan = { startLine: 1, endLine: 5, startOffset: 0, endOffset: 100 };

      const id1 = createUORChunkId(parentUorId, span, 'hash-a');
      const id2 = createUORChunkId(parentUorId, span, 'hash-b');

      expect(id1).not.toBe(id2);
    });

    it('should incorporate span offsets as well as line numbers', () => {
      const parentUorId = 'parent-doc';
      const contentHash = 'same-content';

      // Same line numbers, different offsets
      const span1: SourceSpan = { startLine: 1, endLine: 5, startOffset: 0, endOffset: 100 };
      const span2: SourceSpan = { startLine: 1, endLine: 5, startOffset: 10, endOffset: 110 };

      const id1 = createUORChunkId(parentUorId, span1, contentHash);
      const id2 = createUORChunkId(parentUorId, span2, contentHash);

      expect(id1).not.toBe(id2);
    });

    it('should work with real-world span values', () => {
      const parentUorId = createUORDocumentId(
        '/workspace/project/readme.md',
        hashContent('readme content'),
        'victor-resident',
        'Document',
      );

      const span: SourceSpan = {
        startLine: 1,
        endLine: 50,
        startOffset: 0,
        endOffset: 2500,
      };

      const chunkContent = '# Introduction\n\nThis is the project readme...';
      const contentHash = hashContent(chunkContent);

      const chunkId = createUORChunkId(parentUorId, span, contentHash);

      expect(chunkId).toMatch(/^[a-f0-9]{64}$/);
      expect(chunkId).toBe(createUORChunkId(parentUorId, span, contentHash)); // Deterministic
    });
  });

  describe('Integration: Document and Chunk Identity Chain', () => {
    it('should create verifiable document-chunk identity chain', () => {
      // Step 1: Create document UOR ID
      const projectId = 'test-project';
      const path = '/docs/architecture.md';
      const content = '# Architecture\n\nThis document describes...';
      const canonicalScope = 'victor-resident';

      const contentHash = hashContent(path, content);
      const ontologyType = inferOntologyType(path);
      const documentUorId = createUORDocumentId(path, contentHash, canonicalScope, ontologyType);

      // Step 2: Create chunk referencing parent document
      const span: SourceSpan = { startLine: 1, endLine: 2, startOffset: 0, endOffset: content.length };
      const chunkContentHash = hashContent(content);
      const chunkUorId = createUORChunkId(documentUorId, span, chunkContentHash);

      // Step 3: Verify chain integrity
      expect(documentUorId).toMatch(/^[a-f0-9]{64}$/);
      expect(chunkUorId).toMatch(/^[a-f0-9]{64}$/);
      expect(documentUorId).not.toBe(chunkUorId);

      // Step 4: Verify determinism - same inputs yield same IDs
      const docId2 = createUORDocumentId(path, contentHash, canonicalScope, ontologyType);
      const chunkId2 = createUORChunkId(documentUorId, span, chunkContentHash);

      expect(documentUorId).toBe(docId2);
      expect(chunkUorId).toBe(chunkId2);
    });

    it('should produce different chunk IDs for same span in different documents', () => {
      const span: SourceSpan = { startLine: 1, endLine: 10, startOffset: 0, endOffset: 500 };
      const contentHash = 'same-chunk-content';

      const docA = createUORDocumentId('/doc/a.md', 'hash-a', 'scope', 'Document');
      const docB = createUORDocumentId('/doc/b.md', 'hash-b', 'scope', 'Document');

      const chunkA = createUORChunkId(docA, span, contentHash);
      const chunkB = createUORChunkId(docB, span, contentHash);

      expect(chunkA).not.toBe(chunkB);
    });
  });
});
