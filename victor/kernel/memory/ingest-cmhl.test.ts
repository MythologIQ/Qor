import { describe, expect, it } from 'bun:test';
import type { DocumentInput, DocumentSnapshot, SourceChunkRecord } from './types';
import { planArtifactIngestion } from './ingest';
import { createTemporalMetadata, assignDecayProfile, DEFAULT_DECAY_LAMBDA } from './rank';

describe('CMHL Ingestion Assignment', () => {
  const mockInput: DocumentInput = {
    path: 'test.md',
    content: '# Test Module\n\n- [ ] Task 1\n  - Status: pending\n  - Owner: Test Owner\n\nDecision: Test decision\n\nConstraint: Test constraint',
    projectId: 'test-project',
  };

  const mockSnapshot: DocumentSnapshot = {
    document: undefined,
    chunks: [],
    semanticNodes: [],
    semanticEdges: [],
    cacheEntries: [],
  };

  describe('Source Chunk Temporal Metadata', () => {
    it('should assign temporal metadata to all chunks', () => {
      const plan = planArtifactIngestion(mockInput, mockSnapshot);

      for (const chunk of plan.chunks) {
        expect(chunk.temporal).toBeDefined();
        expect(chunk.temporal?.t0).toBeGreaterThan(0);
        expect(chunk.temporal?.w0).toBe(1.0);
        expect(chunk.temporal?.decayProfile).toBe('standard'); // observation default
        expect(chunk.temporal?.lambda).toBe(DEFAULT_DECAY_LAMBDA.standard);
        expect(chunk.temporal?.restakeCount).toBe(0);
      }
    });

    it('should use observation epistemic type for chunks (per governance policy)', () => {
      const plan = planArtifactIngestion(mockInput, mockSnapshot);

      for (const chunk of plan.chunks) {
        expect(chunk.governance?.epistemicType).toBe('observation');
      }
    });
  });

  describe('Semantic Node Temporal Metadata', () => {
    it('should assign temporal metadata to all semantic nodes', () => {
      const plan = planArtifactIngestion(mockInput, mockSnapshot);

      expect(plan.semanticNodes.length).toBeGreaterThan(0);

      for (const node of plan.semanticNodes) {
        expect(node.temporal).toBeDefined();
        expect(node.temporal?.t0).toBeGreaterThan(0);
        expect(node.temporal?.w0).toBe(1.0);
        expect(node.temporal?.restakeCount).toBe(0);
      }
    });

    it('should assign appropriate decay profiles by node type', () => {
      const plan = planArtifactIngestion(mockInput, mockSnapshot);

      for (const node of plan.semanticNodes) {
        const expectedProfile = assignDecayProfile('inferred-relation', node.nodeType);
        expect(node.temporal?.decayProfile).toBe(expectedProfile);
        expect(node.temporal?.lambda).toBe(DEFAULT_DECAY_LAMBDA[expectedProfile]);
      }
    });

    it('should assign permanent profile to Project nodes', () => {
      const plan = planArtifactIngestion(mockInput, mockSnapshot);
      const projectNodes = plan.semanticNodes.filter(n => n.nodeType === 'Project');

      for (const node of projectNodes) {
        expect(node.temporal?.decayProfile).toBe('permanent');
        expect(node.temporal?.lambda).toBe(0);
      }
    });

    it('should assign durable profile to Decision and Constraint nodes', () => {
      const plan = planArtifactIngestion(mockInput, mockSnapshot);
      const decisionNodes = plan.semanticNodes.filter(n => n.nodeType === 'Decision');
      const constraintNodes = plan.semanticNodes.filter(n => n.nodeType === 'Constraint');

      for (const node of [...decisionNodes, ...constraintNodes]) {
        expect(node.temporal?.decayProfile).toBe('durable');
        expect(node.temporal?.lambda).toBe(DEFAULT_DECAY_LAMBDA.durable);
      }
    });

    it('should assign session profile to Task nodes', () => {
      const plan = planArtifactIngestion(mockInput, mockSnapshot);
      const taskNodes = plan.semanticNodes.filter(n => n.nodeType === 'Task');

      for (const node of taskNodes) {
        expect(node.temporal?.decayProfile).toBe('session');
        expect(node.temporal?.lambda).toBe(DEFAULT_DECAY_LAMBDA.session);
      }
    });
  });

  describe('Semantic Edge Temporal Metadata', () => {
    it('should assign temporal metadata to all semantic edges', () => {
      const plan = planArtifactIngestion(mockInput, mockSnapshot);

      if (plan.semanticEdges.length > 0) {
        for (const edge of plan.semanticEdges) {
          expect(edge.temporal).toBeDefined();
          expect(edge.temporal?.t0).toBeGreaterThan(0);
          expect(edge.temporal?.w0).toBe(1.0);
          expect(edge.temporal?.restakeCount).toBe(0);
        }
      }
    });

    it('should use inferred-relation epistemic type for edges (session profile)', () => {
      const plan = planArtifactIngestion(mockInput, mockSnapshot);

      for (const edge of plan.semanticEdges) {
        expect(edge.temporal?.decayProfile).toBe('session'); // inferred-relation default
        expect(edge.temporal?.lambda).toBe(DEFAULT_DECAY_LAMBDA.session);
      }
    });
  });

  describe('createTemporalMetadata Helper', () => {
    it('should create temporal metadata with correct defaults', () => {
      const now = Date.now();
      const temporal = createTemporalMetadata('source-claim', undefined, now);

      expect(temporal.t0).toBe(now);
      expect(temporal.w0).toBe(1.0);
      expect(temporal.decayProfile).toBe('standard');
      expect(temporal.lambda).toBe(DEFAULT_DECAY_LAMBDA.standard);
      expect(temporal.restakeCount).toBe(0);
    });

    it('should use node type overrides when provided', () => {
      const temporalDecision = createTemporalMetadata('source-claim', 'Decision');
      expect(temporalDecision.decayProfile).toBe('durable'); // Decision overrides source-claim

      const temporalProject = createTemporalMetadata('inferred-relation', 'Project');
      expect(temporalProject.decayProfile).toBe('permanent'); // Project overrides inferred-relation
    });

    it('should use epistemic type defaults when no node type', () => {
      const temporalPolicy = createTemporalMetadata('policy-ruling');
      expect(temporalPolicy.decayProfile).toBe('permanent');

      const temporalObservation = createTemporalMetadata('observation');
      expect(temporalObservation.decayProfile).toBe('standard');

      const temporalSynthesis = createTemporalMetadata('synthesis');
      expect(temporalSynthesis.decayProfile).toBe('session');

      const temporalConjecture = createTemporalMetadata('conjecture');
      expect(temporalConjecture.decayProfile).toBe('ephemeral');
    });

    it('should use current time when now not specified', () => {
      const before = Date.now();
      const temporal = createTemporalMetadata('source-claim');
      const after = Date.now();

      expect(temporal.t0).toBeGreaterThanOrEqual(before);
      expect(temporal.t0).toBeLessThanOrEqual(after);
    });
  });

  describe('assignDecayProfile Helper', () => {
    it('should assign correct profiles for epistemic types', () => {
      expect(assignDecayProfile('policy-ruling')).toBe('permanent');
      expect(assignDecayProfile('observation')).toBe('standard');
      expect(assignDecayProfile('source-claim')).toBe('standard');
      expect(assignDecayProfile('inferred-relation')).toBe('session');
      expect(assignDecayProfile('synthesis')).toBe('session');
      expect(assignDecayProfile('conjecture')).toBe('ephemeral');
    });

    it('should use node type overrides over epistemic types', () => {
      expect(assignDecayProfile('conjecture', 'Decision')).toBe('durable');
      expect(assignDecayProfile('conjecture', 'Project')).toBe('permanent');
      expect(assignDecayProfile('policy-ruling', 'Task')).toBe('session');
    });
  });
});
