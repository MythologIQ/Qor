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

  it('extracts Builder Console task metadata into graph structure', () => {
    const content = `# Builder Console Path Phases

## Phases
### Phase 1: Comms Tab Prompt Automation
Goal: Automate prompt-building inside the comms tab.

- [ ] Automate comms-tab prompt construction
  - Description: Move prompt-building behind the scenes.
  - Owner: Victor
  - Depends On: Prompt construction event stream
  - Acceptance: Show standard chat input/output with a compact operations display.
  - Blocks: Governed write automation
`;
    const document = createSourceDocument({
      path: '/home/workspace/Projects/continuous/Zo-Qore/path/phases.md',
      content,
      projectId: 'builder-console',
    });
    const chunks = chunkDocument(document, content, 500);
    const graph = extractSemanticGraph(chunks);

    const taskNode = graph.nodes.find((node) => node.nodeType === 'Task' && node.label === 'Automate comms-tab prompt construction');
    expect(taskNode).toBeDefined();
    expect(taskNode?.attributes.owner).toBe('Victor');
    expect(taskNode?.summary).toContain('Description: Move prompt-building behind the scenes.');
    expect(graph.nodes.some((node) => node.nodeType === 'Actor' && node.label === 'Victor')).toBe(true);
    expect(graph.nodes.some((node) => node.nodeType === 'Dependency' && node.label === 'Prompt construction event stream')).toBe(true);
    expect(graph.nodes.some((node) => node.nodeType === 'Dependency' && node.label === 'Governed write automation')).toBe(true);
    expect(graph.nodes.some((node) => node.nodeType === 'Goal' && node.label === 'Show standard chat input/output with a compact operations display.')).toBe(true);
    expect(graph.edges.some((edge) => edge.edgeType === 'owned-by')).toBe(true);
    expect(graph.edges.some((edge) => edge.edgeType === 'blocks')).toBe(true);
  });
});
