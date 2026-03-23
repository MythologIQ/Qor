import { describe, it, expect, beforeEach } from 'bun:test';
import type { FileIngestionOptions, IngestionResult } from './memory-file-ingestion.js';
import {
  ingestFile,
  ingestBatch,
  detectDocumentClass,
  mapTrustToGovernance,
  validateIngestionRequest,
  getIngestionStats,
  filterByDocumentClass,
  filterByGovernanceState,
  allIngestionsValid,
  formatIngestionResult,
  setIngestionPolicy,
  resetIngestionPolicy,
  getIngestionPolicy,
  DEFAULT_INGESTION_POLICY,
} from './memory-file-ingestion.js';

describe('Memory File Ingestion Surface', () => {
  beforeEach(() => {
    resetIngestionPolicy();
  });

  // ============================================================================
  // Document Class Detection
  // ============================================================================

  describe('detectDocumentClass', () => {
    it('should detect TypeScript files as code', () => {
      const result = detectDocumentClass('src/utils.ts', 'const x = 1;');
      expect(result.documentClass).toBe('code');
      expect(result.extension).toBe('ts');
      expect(result.confidence).toBe(0.9);
    });

    it('should detect JavaScript files as code', () => {
      const result = detectDocumentClass('app.js', 'function foo() {}');
      expect(result.documentClass).toBe('code');
      expect(result.extension).toBe('js');
    });

    it('should detect Python files as code', () => {
      const result = detectDocumentClass('main.py', 'def main():');
      expect(result.documentClass).toBe('code');
      expect(result.extension).toBe('py');
    });

    it('should detect Markdown files as documentation', () => {
      const result = detectDocumentClass('README.md', '# Title');
      expect(result.documentClass).toBe('documentation');
      expect(result.extension).toBe('md');
    });

    it('should detect JSON files as configuration', () => {
      const result = detectDocumentClass('config.json', '{}');
      expect(result.documentClass).toBe('configuration');
      expect(result.extension).toBe('json');
    });

    it('should detect YAML files as configuration', () => {
      const result = detectDocumentClass('.github/workflows/ci.yml', 'name: CI');
      expect(result.documentClass).toBe('configuration');
      expect(result.extension).toBe('yml');
    });

    it('should detect CSV files as data', () => {
      const result = detectDocumentClass('data.csv', 'a,b,c');
      expect(result.documentClass).toBe('data');
      expect(result.extension).toBe('csv');
    });

    it('should detect unknown extensions', () => {
      const result = detectDocumentClass('file.xyz', 'content');
      expect(result.documentClass).toBe('unknown');
      expect(result.confidence).toBe(0.5);
    });

    it('should handle files without extensions', () => {
      const result = detectDocumentClass('Makefile', 'all:');
      expect(result.documentClass).toBe('unknown');
      expect(result.extension).toBe('makefile');
    });
  });

  // ============================================================================
  // Trust to Governance Mapping
  // ============================================================================

  describe('mapTrustToGovernance', () => {
    it('should map unverified to provisional state', () => {
      const result = mapTrustToGovernance('unverified');
      expect(result.state).toBe('provisional');
      expect(result.confidence).toBe(0.5);
      expect(result.rationale).toContain('provisional');
    });

    it('should map user-reviewed to durable state', () => {
      const result = mapTrustToGovernance('user-reviewed');
      expect(result.state).toBe('durable');
      expect(result.confidence).toBe(0.75);
      expect(result.rationale).toContain('elevated trust');
    });

    it('should map verified to durable state', () => {
      const result = mapTrustToGovernance('verified');
      expect(result.state).toBe('durable');
      expect(result.confidence).toBe(0.9);
      expect(result.rationale).toContain('high-confidence');
    });

    it('should map cross-verified to durable state with max confidence', () => {
      const result = mapTrustToGovernance('cross-verified');
      expect(result.state).toBe('durable');
      expect(result.confidence).toBe(0.95);
      expect(result.rationale).toContain('maximum confidence');
    });
  });

  // ============================================================================
  // Policy Validation
  // ============================================================================

  describe('validateIngestionRequest', () => {
    it('should allow valid ingestion requests', () => {
      const options: FileIngestionOptions = {
        path: 'src/utils.ts',
        content: 'const x = 1;',
        projectId: 'test-project',
      };

      const result = validateIngestionRequest(options);
      expect(result.allowed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject oversized files', () => {
      setIngestionPolicy({ maxFileSizeBytes: 10 });
      const options: FileIngestionOptions = {
        path: 'large.txt',
        content: 'This is more than 10 bytes of content',
        projectId: 'test-project',
      };

      const result = validateIngestionRequest(options);
      expect(result.allowed).toBe(false);
      expect(result.errors[0].code).toBe('FILE_TOO_LARGE');
      expect(result.errors[0].severity).toBe('fatal');
    });

    it('should reject disallowed document classes', () => {
      setIngestionPolicy({ allowedDocumentClasses: ['code', 'documentation'] });
      const options: FileIngestionOptions = {
        path: 'data.csv',
        content: 'a,b,c',
        projectId: 'test-project',
      };

      const result = validateIngestionRequest(options);
      expect(result.allowed).toBe(false);
      expect(result.errors[0].code).toBe('DOCUMENT_CLASS_NOT_ALLOWED');
    });

    it('should warn on low confidence', () => {
      setIngestionPolicy({ minConfidenceThreshold: 0.8 });
      const options: FileIngestionOptions = {
        path: 'unknown.xyz',
        content: 'content',
        projectId: 'test-project',
        initialConfidence: 0.5,
      };

      const result = validateIngestionRequest(options);
      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('LOW_CONFIDENCE');
    });
  });

  // ============================================================================
  // Single File Ingestion
  // ============================================================================

  describe('ingestFile', () => {
    it('should successfully ingest a TypeScript file', () => {
      const options: FileIngestionOptions = {
        path: 'src/example.ts',
        content: 'export function hello() { return "world"; }',
        projectId: 'test-project',
        sourceTrustLevel: 'verified',
      };

      const result = ingestFile(options);

      expect(result.success).toBe(true);
      expect(result.document).not.toBeNull();
      expect(result.document?.path).toBe('src/example.ts');
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.provenance.documentClass).toBe('code');
      expect(result.provenance.sourceTrustLevel).toBe('verified');
      expect(result.governance.state).toBe('durable');
      expect(result.governance.confidence).toBe(0.9);
    });

    it('should preserve source provenance', () => {
      const options: FileIngestionOptions = {
        path: 'docs/readme.md',
        content: '# Project Documentation\n\nThis is a test.',
        projectId: 'test-project',
        sourceTrustLevel: 'user-reviewed',
      };

      const result = ingestFile(options);

      expect(result.success).toBe(true);
      expect(result.provenance.contentFingerprint).toBeTruthy();
      expect(result.document?.uorId).toBeTruthy();
      
      // All chunks should have UOR IDs
      for (const chunk of result.chunks) {
        expect(chunk.uorId).toBeTruthy();
        expect(chunk.parentDocUorId).toBe(result.document?.uorId);
      }
    });

    it('should create proper governance metadata', () => {
      const options: FileIngestionOptions = {
        path: 'config.json',
        content: '{"key": "value"}',
        projectId: 'test-project',
        initialGovernanceState: 'durable',
        epistemicType: 'source-claim',
        initialConfidence: 0.85,
      };

      const result = ingestFile(options);

      expect(result.governance.state).toBe('durable');
      expect(result.governance.epistemicType).toBe('source-claim');
      expect(result.governance.confidence).toBe(0.85);
      expect(result.governance.provenanceComplete).toBe(true);
    });

    it('should chunk content with UOR IDs', () => {
      const options: FileIngestionOptions = {
        path: 'src/large.ts',
        content: Array(100).fill('// line of code').join('\n'),
        projectId: 'test-project',
      };

      const result = ingestFile(options);

      expect(result.chunks.length).toBeGreaterThan(1);
      
      for (const chunk of result.chunks) {
        expect(chunk.id).toBeTruthy();
        expect(chunk.uorId).toBeTruthy();
        expect(chunk.fingerprint).toBeTruthy();
        expect(chunk.span).toBeDefined();
        expect(chunk.span.startLine).toBeGreaterThanOrEqual(0);
        expect(chunk.span.endLine).toBeGreaterThan(chunk.span.startLine);
      }
    });

    it('should extract semantic nodes and edges', () => {
      const options: FileIngestionOptions = {
        path: 'src/module.ts',
        content: `
# TestProject Module

Goal: Process test data efficiently

**Solution:** Implement a handler class that transforms input data.

**Next Steps:**
- [ ] Create the handler class
- [ ] Add data transformation methods
- [ ] Write tests for edge cases

Decision: Use uppercase transformation for consistency.
        `.trim(),
        projectId: 'test-project',
      };

      const result = ingestFile(options);

      expect(result.semanticNodes.length).toBeGreaterThan(0);
      expect(result.semanticEdges.length).toBeGreaterThanOrEqual(0);
      
      // Semantic nodes should have governance
      for (const node of result.semanticNodes) {
        expect(node.governance).toBeDefined();
        expect(node.governance?.epistemicType).toBe('inferred-relation');
      }
    });

    it('should fail policy validation for oversized files', () => {
      setIngestionPolicy({ maxFileSizeBytes: 10 });
      const options: FileIngestionOptions = {
        path: 'large.txt',
        content: 'This is a large file with many bytes that exceeds the limit',
        projectId: 'test-project',
      };

      const result = ingestFile(options);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('FILE_TOO_LARGE');
      expect(result.document).toBeNull();
    });

    it('should fail on too many chunks', () => {
      setIngestionPolicy({ maxChunkCount: 1 });
      const options: FileIngestionOptions = {
        path: 'src/many.ts',
        content: Array(200).fill('// line').join('\n'),
        projectId: 'test-project',
      };

      const result = ingestFile(options);

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('TOO_MANY_CHUNKS');
    });

    it('should handle autoChunk disabled', () => {
      const options: FileIngestionOptions = {
        path: 'src/small.ts',
        content: 'const x = 1;',
        projectId: 'test-project',
        autoChunk: false,
      };

      const result = ingestFile(options);

      expect(result.success).toBe(true);
      expect(result.chunks).toHaveLength(0);
    });

    it('should handle autoExtract disabled', () => {
      const options: FileIngestionOptions = {
        path: 'src/module.ts',
        content: '// Project: Test\nconst x = 1;',
        projectId: 'test-project',
        autoExtract: false,
      };

      const result = ingestFile(options);

      expect(result.success).toBe(true);
      expect(result.semanticNodes).toHaveLength(0);
      expect(result.semanticEdges).toHaveLength(0);
    });

    it('should apply decay profile correctly', () => {
      const options: FileIngestionOptions = {
        path: 'src/temp.ts',
        content: 'const x = 1;',
        projectId: 'test-project',
        decayProfile: 'ephemeral',
      };

      const result = ingestFile(options);

      expect(result.success).toBe(true);
      expect(result.chunks.length).toBeGreaterThan(0);
      // Check that thermodynamic state is initialized
      expect(result.chunks[0].temporal).toBeDefined();
    });

    it('should map different trust levels correctly', () => {
      const trustLevels = ['unverified', 'user-reviewed', 'verified', 'cross-verified'] as const;
      const expectedConfidences = [0.5, 0.75, 0.9, 0.95];

      for (let i = 0; i < trustLevels.length; i++) {
        const result = ingestFile({
          path: `test${i}.ts`,
          content: 'const x = 1;',
          projectId: 'test-project',
          sourceTrustLevel: trustLevels[i],
        });

        expect(result.governance.confidence).toBe(expectedConfidences[i]);
      }
    });
  });

  // ============================================================================
  // Batch Ingestion
  // ============================================================================

  describe('ingestBatch', () => {
    it('should ingest multiple files', () => {
      const options: FileIngestionOptions[] = [
        {
          path: 'src/a.ts',
          content: 'export const a = 1;',
          projectId: 'test-project',
        },
        {
          path: 'src/b.ts',
          content: 'export const b = 2;',
          projectId: 'test-project',
        },
        {
          path: 'docs/readme.md',
          content: '# README',
          projectId: 'test-project',
        },
      ];

      const result = ingestBatch(options);

      expect(result.totalFiles).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.summary.totalChunks).toBeGreaterThan(0);
    });

    it('should track document class distribution', () => {
      const options: FileIngestionOptions[] = [
        { path: 'src/code.ts', content: 'code', projectId: 'p1' },
        { path: 'docs/doc.md', content: 'doc', projectId: 'p1' },
        { path: 'config.json', content: '{}', projectId: 'p1' },
      ];

      const result = ingestBatch(options);

      expect(result.summary.byDocumentClass.code).toBe(1);
      expect(result.summary.byDocumentClass.documentation).toBe(1);
      expect(result.summary.byDocumentClass.configuration).toBe(1);
    });

    it('should handle partial failures', () => {
      setIngestionPolicy({ maxFileSizeBytes: 50 });
      const options: FileIngestionOptions[] = [
        { path: 'small.ts', content: 'const x = 1;', projectId: 'p1' },
        { path: 'large.ts', content: 'x'.repeat(100), projectId: 'p1' },
      ];

      const result = ingestBatch(options);

      expect(result.totalFiles).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should aggregate totals correctly', () => {
      const options: FileIngestionOptions[] = [
        { path: 'a.ts', content: 'line1\nline2\nline3', projectId: 'p1' },
        { path: 'b.ts', content: 'line1\nline2\nline3', projectId: 'p1' },
      ];

      const result = ingestBatch(options);
      
      expect(result.summary.totalChunks).toBeGreaterThan(0);
      expect(result.summary.totalNodes).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Statistics and Filtering
  // ============================================================================

  describe('getIngestionStats', () => {
    it('should calculate batch statistics', () => {
      const batchResult = ingestBatch([
        { path: 'a.ts', content: 'const a = 1;', projectId: 'p1' },
        { path: 'b.ts', content: 'const b = 2;', projectId: 'p1' },
      ]);

      const stats = getIngestionStats(batchResult);

      expect(stats.successRate).toBe(1.0);
      expect(stats.totalChunks).toBeGreaterThan(0);
      expect(stats.averageChunksPerFile).toBeGreaterThan(0);
    });

    it('should handle zero files', () => {
      const batchResult = ingestBatch([]);
      const stats = getIngestionStats(batchResult);

      expect(stats.successRate).toBe(0);
      expect(stats.averageChunksPerFile).toBe(0);
    });
  });

  describe('filterByDocumentClass', () => {
    it('should filter results by class', () => {
      const results: IngestionResult[] = [
        { 
          success: true,
          document: { id: '1', path: 'a.ts', title: '', contentType: '', fingerprint: '', contentLength: 0, updatedAt: 0, projectId: 'p1' },
          chunks: [],
          semanticNodes: [],
          semanticEdges: [],
          governance: { state: 'durable', epistemicType: 'source-claim', provenanceComplete: true, confidence: 0.8, policyVersion: '1.0.0' },
          provenance: { ingestionId: '1', ingestedAt: 0, documentClass: 'code', sourceTrustLevel: 'verified', contentFingerprint: '', chunkCount: 0, nodeCount: 0, edgeCount: 0, policyVersion: '1.0.0' },
          errors: [],
          warnings: [],
        },
        {
          success: true,
          document: { id: '2', path: 'b.md', title: '', contentType: '', fingerprint: '', contentLength: 0, updatedAt: 0, projectId: 'p1' },
          chunks: [],
          semanticNodes: [],
          semanticEdges: [],
          governance: { state: 'durable', epistemicType: 'source-claim', provenanceComplete: true, confidence: 0.8, policyVersion: '1.0.0' },
          provenance: { ingestionId: '2', ingestedAt: 0, documentClass: 'documentation', sourceTrustLevel: 'verified', contentFingerprint: '', chunkCount: 0, nodeCount: 0, edgeCount: 0, policyVersion: '1.0.0' },
          errors: [],
          warnings: [],
        },
      ];

      const codeResults = filterByDocumentClass(results, 'code');
      expect(codeResults).toHaveLength(1);
      expect(codeResults[0].provenance.documentClass).toBe('code');
    });
  });

  describe('filterByGovernanceState', () => {
    it('should filter results by governance state', () => {
      const results: IngestionResult[] = [
        {
          success: true,
          document: { id: '1', path: 'a.ts', title: '', contentType: '', fingerprint: '', contentLength: 0, updatedAt: 0, projectId: 'p1' },
          chunks: [],
          semanticNodes: [],
          semanticEdges: [],
          governance: { state: 'durable', epistemicType: 'source-claim', provenanceComplete: true, confidence: 0.8, policyVersion: '1.0.0' },
          provenance: { ingestionId: '1', ingestedAt: 0, documentClass: 'code', sourceTrustLevel: 'verified', contentFingerprint: '', chunkCount: 0, nodeCount: 0, edgeCount: 0, policyVersion: '1.0.0' },
          errors: [],
          warnings: [],
        },
        {
          success: true,
          document: { id: '2', path: 'b.ts', title: '', contentType: '', fingerprint: '', contentLength: 0, updatedAt: 0, projectId: 'p1' },
          chunks: [],
          semanticNodes: [],
          semanticEdges: [],
          governance: { state: 'provisional', epistemicType: 'source-claim', provenanceComplete: true, confidence: 0.5, policyVersion: '1.0.0' },
          provenance: { ingestionId: '2', ingestedAt: 0, documentClass: 'code', sourceTrustLevel: 'unverified', contentFingerprint: '', chunkCount: 0, nodeCount: 0, edgeCount: 0, policyVersion: '1.0.0' },
          errors: [],
          warnings: [],
        },
      ];

      const durableResults = filterByGovernanceState(results, 'durable');
      expect(durableResults).toHaveLength(1);
      expect(durableResults[0].governance.state).toBe('durable');
    });
  });

  describe('allIngestionsValid', () => {
    it('should return true when all succeed', () => {
      const result = ingestBatch([
        { path: 'a.ts', content: 'const a = 1;', projectId: 'p1' },
        { path: 'b.ts', content: 'const b = 2;', projectId: 'p1' },
      ]);

      expect(allIngestionsValid(result)).toBe(true);
    });

    it('should return false when any fail', () => {
      setIngestionPolicy({ maxFileSizeBytes: 10 });
      const result = ingestBatch([
        { path: 'small.ts', content: 'x', projectId: 'p1' },
        { path: 'large.ts', content: 'x'.repeat(100), projectId: 'p1' },
      ]);

      expect(allIngestionsValid(result)).toBe(false);
    });
  });

  // ============================================================================
  // Formatting
  // ============================================================================

  describe('formatIngestionResult', () => {
    it('should format successful ingestion', () => {
      const result = ingestFile({
        path: 'src/test.ts',
        content: 'const x = 1;',
        projectId: 'test',
      });

      const formatted = formatIngestionResult(result);
      expect(formatted).toContain('SUCCESS');
      expect(formatted).toContain('src/test.ts');
      expect(formatted).toContain('code');
    });

    it('should format failed ingestion with errors', () => {
      setIngestionPolicy({ maxFileSizeBytes: 10 });
      const result = ingestFile({
        path: 'large.txt',
        content: 'This is too large for the policy',
        projectId: 'test',
      });

      const formatted = formatIngestionResult(result);
      expect(formatted).toContain('FAILED');
      expect(formatted).toContain('FILE_TOO_LARGE');
    });
  });

  // ============================================================================
  // Policy Management
  // ============================================================================

  describe('ingestion policy management', () => {
    it('should get default policy', () => {
      const policy = getIngestionPolicy();
      expect(policy.requireGovernanceCheck).toBe(true);
      expect(policy.defaultSourceTrustLevel).toBe('unverified');
      expect(policy.maxFileSizeBytes).toBe(10 * 1024 * 1024);
    });

    it('should set custom policy', () => {
      setIngestionPolicy({ maxFileSizeBytes: 1000 });
      const policy = getIngestionPolicy();
      expect(policy.maxFileSizeBytes).toBe(1000);
    });

    it('should reset to defaults', () => {
      setIngestionPolicy({ maxFileSizeBytes: 1000 });
      resetIngestionPolicy();
      const policy = getIngestionPolicy();
      expect(policy.maxFileSizeBytes).toBe(DEFAULT_INGESTION_POLICY.maxFileSizeBytes);
    });
  });

  // ============================================================================
  // Acceptance Criteria Tests
  // ============================================================================

  describe('Acceptance Criteria', () => {
    it('AC1: File ingestion supports the intended document classes', () => {
      const docClasses: Array<{ path: string; expected: import('./memory-file-ingestion.js').DocumentClass }> = [
        { path: 'src/code.ts', expected: 'code' },
        { path: 'docs/readme.md', expected: 'documentation' },
        { path: 'config.json', expected: 'configuration' },
        { path: 'data.csv', expected: 'data' },
      ];

      for (const testCase of docClasses) {
        const result = ingestFile({
          path: testCase.path,
          content: 'test content',
          projectId: 'test-project',
        });

        expect(result.success).toBe(true);
        expect(result.provenance.documentClass).toBe(testCase.expected);
      }
    });

    it('AC2: Chunking, encoding, and routing preserve source provenance', () => {
      const result = ingestFile({
        path: 'src/module.ts',
        content: 'export class Example {\n  method() {\n    return 42;\n  }\n}',
        projectId: 'test-project',
        sourceTrustLevel: 'verified',
      });

      expect(result.success).toBe(true);
      expect(result.document?.uorId).toBeTruthy();
      expect(result.provenance.contentFingerprint).toBeTruthy();

      // Each chunk should preserve provenance
      for (const chunk of result.chunks) {
        expect(chunk.uorId).toBeTruthy();
        expect(chunk.parentDocUorId).toBe(result.document?.uorId);
        expect(chunk.fingerprint).toBeTruthy();
        expect(chunk.governance).toBeDefined();
      }

      // Source trust level should be preserved
      expect(result.provenance.sourceTrustLevel).toBe('verified');
    });

    it('AC3: Ingestion remains policy-checked instead of bypassing governance', () => {
      // Set a restrictive policy
      setIngestionPolicy({
        maxFileSizeBytes: 50,
        minConfidenceThreshold: 0.9,
        allowedDocumentClasses: ['code'],
      });

      // Should fail - too large
      const tooLarge = ingestFile({
        path: 'large.ts',
        content: 'x'.repeat(100),
        projectId: 'test',
      });
      expect(tooLarge.success).toBe(false);
      expect(tooLarge.errors[0].code).toBe('FILE_TOO_LARGE');

      // Should pass - meets all criteria
      const valid = ingestFile({
        path: 'valid.ts',
        content: 'const x = 1;',
        projectId: 'test',
        initialConfidence: 0.95,
      });
      expect(valid.success).toBe(true);

      // Should fail - wrong document class
      const wrongClass = ingestFile({
        path: 'data.csv',
        content: 'a,b,c',
        projectId: 'test',
      });
      expect(wrongClass.success).toBe(false);
      expect(wrongClass.errors[0].code).toBe('DOCUMENT_CLASS_NOT_ALLOWED');

      // Governance should be applied to all results
      for (const result of [tooLarge, valid, wrongClass]) {
        expect(result.governance).toBeDefined();
        expect(result.governance.epistemicType).toBeDefined();
        expect(result.governance.confidence).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
