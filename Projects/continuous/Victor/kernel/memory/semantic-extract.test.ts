import { describe, expect, it } from 'bun:test';

import { chunkDocument } from './chunking';
import { createSourceDocument } from './provenance';
import { extractSemanticGraph } from './semantic-extract';

describe('extractSemanticGraph', () => {
  it('extracts modules, tasks, dependencies, decisions, constraints, and declarative design semantics', () => {
    const content = `# Victor Memory

- [ ] Build ingestion pipeline depends on Neo4j
Victor is the resident intelligence.
Decision: Victor is the resident intelligence
Constraint: Trust is earned

## Goals

- Build a memory system that combines vector retrieval with graph-linked semantic structure.
`;
    const document = createSourceDocument({
      path: '/home/workspace/Projects/continuous/Victor/docs/memory.md',
      content,
      projectId: 'victor',
    });
    const chunks = chunkDocument(document, content, 400);
    const graph = extractSemanticGraph(chunks);

    expect(graph.nodes.some((node) => node.nodeType === 'Module' && node.label === 'Victor Memory')).toBe(true);
    expect(graph.nodes.some((node) => node.nodeType === 'Task' && node.label === 'Build ingestion pipeline')).toBe(true);
    expect(graph.nodes.some((node) => node.nodeType === 'Dependency' && node.label === 'Neo4j')).toBe(true);
    expect(graph.nodes.some((node) => node.nodeType === 'Decision')).toBe(true);
    expect(graph.nodes.some((node) => node.nodeType === 'Constraint')).toBe(true);
    expect(
      graph.nodes.some(
        (node) => node.nodeType === 'Decision' && node.label === 'Victor is the resident intelligence',
      ),
    ).toBe(true);
    expect(
      graph.nodes.some(
        (node) =>
          node.nodeType === 'Goal'
          && node.label === 'Build a memory system that combines vector retrieval with graph-linked semantic structure',
      ),
    ).toBe(true);
    expect(graph.edges.some((edge) => edge.edgeType === 'depends-on')).toBe(true);
  });
});
