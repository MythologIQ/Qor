import { describe, expect, it } from 'bun:test';

import { planArtifactIngestion } from './ingest';
import type { DocumentSnapshot } from './types';

const EMPTY_SNAPSHOT: DocumentSnapshot = {
  chunks: [],
  semanticNodes: [],
  semanticEdges: [],
  cacheEntries: [],
};

describe('planArtifactIngestion', () => {
  it('produces deterministic chunks and semantic outputs for a new file', () => {
    const content = `# Victor Memory

- [ ] Build ingestion pipeline depends on Neo4j
Decision: Use Neo4j first
Constraint: Trust is earned
`;

    const plan = planArtifactIngestion(
      {
        path: '/home/workspace/Projects/continuous/Victor/docs/memory.md',
        content,
        projectId: 'victor',
      },
      EMPTY_SNAPSHOT,
    );

    expect(plan.document.path).toContain('memory.md');
    expect(plan.chunks.length).toBeGreaterThan(0);
    expect(plan.semanticNodes.length).toBeGreaterThan(0);
    expect(plan.changedChunkIds.length).toBe(plan.chunks.length);
    expect(plan.ingestionRun.changedChunkIds).toEqual(plan.changedChunkIds);
  });

  it('marks removed nodes and stale cache entries when content changes', () => {
    const initial = planArtifactIngestion(
      {
        path: '/home/workspace/Projects/continuous/Victor/docs/memory.md',
        content: `# Victor Memory

- [ ] Build ingestion pipeline depends on Neo4j
Constraint: Trust is earned
`,
        projectId: 'victor',
      },
      EMPTY_SNAPSHOT,
    );

    const changed = planArtifactIngestion(
      {
        path: '/home/workspace/Projects/continuous/Victor/docs/memory.md',
        content: `# Victor Memory

Decision: Use Neo4j first
`,
        projectId: 'victor',
      },
      {
        document: initial.document,
        chunks: initial.chunks,
        semanticNodes: initial.semanticNodes,
        semanticEdges: initial.semanticEdges,
        cacheEntries: [
          {
            id: 'cache-1',
            cacheType: 'stable-summary',
            summary: 'cached summary',
            status: 'fresh',
            dependencyRefs: [
              { kind: 'document', id: initial.document.id },
              { kind: 'semantic-node', id: initial.semanticNodes[0].id },
            ],
            updatedAt: Date.now(),
          },
        ],
      },
    );

    expect(changed.removedNodeIds.length).toBeGreaterThan(0);
    expect(changed.staleCacheIds).toEqual(['cache-1']);
  });
});
