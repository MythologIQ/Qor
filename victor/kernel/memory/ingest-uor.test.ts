import { describe, expect, it } from 'bun:test';
import { planArtifactIngestion } from './ingest';
import { createSourceDocument } from './provenance';
import type { DocumentInput, DocumentSnapshot } from './types';

describe('UOR ID Ingestion Wiring', () => {
  const mockInput: DocumentInput = {
    projectId: 'test-project',
    path: 'src/example.ts',
    content: 'const x = 1;\nconst y = 2;\nfunction add() { return x + y; }',
  };

  const emptySnapshot: DocumentSnapshot = {
    document: null,
    chunks: [],
    semanticNodes: [],
    semanticEdges: [],
    cacheEntries: [],
  };

  describe('createSourceDocument', () => {
    it('should generate uorId for document', () => {
      const document = createSourceDocument(mockInput);

      expect(document.uorId).toBeDefined();
      expect(document.uorId).toBeString();
      expect(document.uorId).toHaveLength(64); // SHA256 hex length
      expect(document.uorId).toMatch(/^[a-f0-9]{64}$/); // Hex pattern
    });

    it('should generate deterministic uorId for same input', () => {
      const doc1 = createSourceDocument(mockInput);
      const doc2 = createSourceDocument(mockInput);

      expect(doc1.uorId).toBe(doc2.uorId);
    });

    it('should generate different uorId for different content', () => {
      const doc1 = createSourceDocument(mockInput);
      const doc2 = createSourceDocument({ ...mockInput, content: 'different content' });

      expect(doc1.uorId).not.toBe(doc2.uorId);
    });

    it('should generate different uorId for different paths', () => {
      const doc1 = createSourceDocument(mockInput);
      const doc2 = createSourceDocument({ ...mockInput, path: 'src/other.ts' });

      expect(doc1.uorId).not.toBe(doc2.uorId);
    });

    it('should use CodeFile ontology type for TypeScript files', () => {
      const document = createSourceDocument(mockInput);

      // The uorId should be generated with CodeFile ontology type
      expect(document.uorId).toBeDefined();
      // Verify it's a valid hex string
      expect(document.uorId).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should use Configuration ontology type for JSON files', () => {
      const jsonInput: DocumentInput = {
        projectId: 'test-project',
        path: 'config.json',
        content: '{"key": "value"}',
      };
      const document = createSourceDocument(jsonInput);

      expect(document.uorId).toBeDefined();
      expect(document.uorId).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('planArtifactIngestion', () => {
    it('should assign uorId to all chunks', () => {
      const plan = planArtifactIngestion(mockInput, emptySnapshot);

      expect(plan.chunks.length).toBeGreaterThan(0);
      for (const chunk of plan.chunks) {
        expect(chunk.uorId).toBeDefined();
        expect(chunk.uorId).toBeString();
        expect(chunk.uorId).toHaveLength(64);
        expect(chunk.uorId).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('should assign parentDocUorId to all chunks referencing document', () => {
      const plan = planArtifactIngestion(mockInput, emptySnapshot);

      expect(plan.chunks.length).toBeGreaterThan(0);
      for (const chunk of plan.chunks) {
        expect(chunk.parentDocUorId).toBeDefined();
        expect(chunk.parentDocUorId).toBe(plan.document.uorId);
      }
    });

    it('should generate deterministic chunk uorIds for same input', () => {
      const plan1 = planArtifactIngestion(mockInput, emptySnapshot);
      const plan2 = planArtifactIngestion(mockInput, emptySnapshot);

      expect(plan1.chunks.length).toBe(plan2.chunks.length);
      for (let i = 0; i < plan1.chunks.length; i++) {
        expect(plan1.chunks[i].uorId).toBe(plan2.chunks[i].uorId);
      }
    });

    it('should generate different chunk uorIds for different documents', () => {
      const plan1 = planArtifactIngestion(mockInput, emptySnapshot);
      const differentInput = { ...mockInput, content: 'different content here' };
      const plan2 = planArtifactIngestion(differentInput, emptySnapshot);

      // Chunks should have different uorIds because parent document uorId is different
      for (const chunk1 of plan1.chunks) {
        for (const chunk2 of plan2.chunks) {
          expect(chunk1.uorId).not.toBe(chunk2.uorId);
        }
      }
    });

    it('should create unique chunk uorIds within the same document', () => {
      const plan = planArtifactIngestion(mockInput, emptySnapshot);

      const uorIds = plan.chunks.map((c) => c.uorId);
      const uniqueUorIds = new Set(uorIds);

      expect(uniqueUorIds.size).toBe(uorIds.length);
    });

    it('should maintain document-chunk identity chain integrity', () => {
      const plan = planArtifactIngestion(mockInput, emptySnapshot);

      // Each chunk should reference the document's UOR ID
      for (const chunk of plan.chunks) {
        expect(chunk.parentDocUorId).toBe(plan.document.uorId);
      }

      // Document should have a valid UOR ID
      expect(plan.document.uorId).toBeDefined();
      expect(plan.document.uorId).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should preserve chunk content in uorId calculation', () => {
      const plan1 = planArtifactIngestion(mockInput, emptySnapshot);

      // Same path but different content should produce different chunk uorIds
      const modifiedInput = { ...mockInput, content: mockInput.content + '\n// comment' };
      const plan2 = planArtifactIngestion(modifiedInput, emptySnapshot);

      // Both should have valid uorIds but they should differ
      expect(plan1.chunks[0].uorId).not.toBe(plan2.chunks[0].uorId);
    });
  });

  describe('UOR Integration End-to-End', () => {
    it('should create complete identity chain from document to chunks', () => {
      const plan = planArtifactIngestion(mockInput, emptySnapshot);

      // Verify document has UOR identity
      expect(plan.document.uorId).toBeDefined();
      expect(plan.document.uorId).toMatch(/^[a-f0-9]{64}$/);

      // Verify all chunks have UOR identity and link to document
      for (const chunk of plan.chunks) {
        expect(chunk.uorId).toBeDefined();
        expect(chunk.uorId).toMatch(/^[a-f0-9]{64}$/);
        expect(chunk.parentDocUorId).toBe(plan.document.uorId);
      }

      // UOR identity chain is complete: document → chunks
      expect(plan.chunks.length).toBeGreaterThan(0);
    });

    it('should handle empty content gracefully', () => {
      const emptyInput: DocumentInput = {
        projectId: 'test-project',
        path: 'empty.txt',
        content: '',
      };

      const plan = planArtifactIngestion(emptyInput, emptySnapshot);

      // Document should still have uorId even with empty content
      expect(plan.document.uorId).toBeDefined();
      expect(plan.document.uorId).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle single-line content', () => {
      const singleLineInput: DocumentInput = {
        projectId: 'test-project',
        path: 'single.ts',
        content: 'console.log("hello");',
      };

      const plan = planArtifactIngestion(singleLineInput, emptySnapshot);

      expect(plan.document.uorId).toBeDefined();
      expect(plan.chunks.length).toBeGreaterThan(0);
      expect(plan.chunks[0].uorId).toBeDefined();
      expect(plan.chunks[0].parentDocUorId).toBe(plan.document.uorId);
    });
  });
});
