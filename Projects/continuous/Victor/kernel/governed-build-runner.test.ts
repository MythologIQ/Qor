import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { createProjectStore } from '../../Zo-Qore/runtime/planning';
import { runGovernedAutomationBuild } from './governed-build-runner';
import type { GroundedContextBundle } from './memory/types';

describe('runGovernedAutomationBuild', () => {
  let projectsDir: string;

  beforeEach(async () => {
    projectsDir = await mkdtemp(join(tmpdir(), 'victor-governed-build-'));
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    await projectStore.create({
      name: 'Builder Console',
      description: 'Governed build fixture',
      createdBy: 'tester',
    });

    const revealStore = await projectStore.getViewStore('reveal');
    await revealStore.write({
      clusters: [
        {
          clusterId: 'cluster-1',
          projectId: 'builder-console',
          label: 'Governed Automation',
          thoughtIds: [],
          notes: 'Grounded planning cluster',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'formed',
        },
      ],
    });

    const constellationStore = await projectStore.getViewStore('constellation');
    await constellationStore.write({
      constellationId: 'const-1',
      projectId: 'builder-console',
      nodes: [{ nodeId: 'node-1', clusterId: 'cluster-1', position: { x: 0, y: 0 } }],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'mapped',
    });

    const pathStore = await projectStore.getViewStore('path');
    await pathStore.write({
      phases: [
        {
          phaseId: 'phase-1',
          projectId: 'builder-console',
          ordinal: 1,
          name: 'Comms Tab Prompt Automation',
          objective: 'Advance governed automation in the comms tab.',
          sourceClusterIds: ['cluster-1'],
          tasks: [
            {
              taskId: 'task-1',
              phaseId: 'phase-1',
              title: 'Automate comms-tab prompt construction',
              description: 'Make the prompt pipeline governed and observable.',
              acceptance: ['Result is ready for Victor-mediated automation under governance.'],
              status: 'pending',
            },
            {
              taskId: 'task-2',
              phaseId: 'phase-1',
              title: 'Style button padding',
              description: 'Cosmetic polish only.',
              acceptance: ['Looks nicer.'],
              status: 'pending',
            },
          ],
          status: 'planned',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  afterEach(async () => {
    await rm(projectsDir, { recursive: true, force: true });
  });

  it('selects the governed automation task and returns a dry-run preview by default', async () => {
    const result = await runGovernedAutomationBuild(
      {
        projectsDir,
      },
      async () => groundedContext(),
    );

    expect(result.mode).toBe('dry-run');
    expect(result.selectedTask?.taskId).toBe('task-1');
    expect(result.automation.results[0]?.status).toBe('eligible');
  });

  it('executes one governed automation action when dryRun is false', async () => {
    const result = await runGovernedAutomationBuild(
      {
        projectsDir,
        dryRun: false,
        maxActions: 1,
      },
      async () => groundedContext(),
    );

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('execute');
    expect(result.automation.executedCount).toBe(1);
    expect(result.automation.results[0]?.status).toBe('updated');
  });

  it('blocks when no governed automation task is eligible', async () => {
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    const pathStore = await projectStore.getViewStore('path');
    await pathStore.write({
      phases: [
        {
          phaseId: 'phase-1',
          projectId: 'builder-console',
          ordinal: 1,
          name: 'Cosmetic Cleanup',
          objective: 'Minor visual polish.',
          sourceClusterIds: ['cluster-1'],
          tasks: [
            {
              taskId: 'task-2',
              phaseId: 'phase-1',
              title: 'Style button padding',
              description: 'Cosmetic polish only.',
              acceptance: ['Looks nicer.'],
              status: 'pending',
            },
          ],
          status: 'planned',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const result = await runGovernedAutomationBuild(
      {
        projectsDir,
      },
      async () => groundedContext(),
    );

    expect(result.status).toBe('blocked');
    expect(result.selectedTask).toBeUndefined();
    expect(result.selectionReason).toContain('No eligible governed automation task');
  });
});

function groundedContext(): GroundedContextBundle {
  return {
    query: 'What should happen next with the governed automation task?',
    chunkHits: [
      {
        score: 5,
        chunk: {
          id: 'chunk-1',
          documentId: 'doc-1',
          index: 0,
          fingerprint: 'chunk-1',
          text: 'Decision: Builder Console governance is binding on Victor when operating through these artifacts.',
          tokenEstimate: 16,
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 40 },
        },
      },
    ],
    semanticNodes: [
      {
        id: 'decision-1',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-1',
        nodeType: 'Decision',
        label: 'Builder Console governance is binding on Victor when operating through these artifacts.',
        summary: 'Builder Console governance is binding on Victor when operating through these artifacts.',
        fingerprint: 'decision-1',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 40 },
        attributes: {},
        state: 'active',
      },
      {
        id: 'task-1',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-1',
        nodeType: 'Task',
        label: 'Automate comms-tab prompt construction',
        summary: 'Automate comms-tab prompt construction',
        fingerprint: 'task-1',
        span: { startLine: 2, endLine: 2, startOffset: 41, endOffset: 80 },
        attributes: { status: 'pending', taskId: 'task-1' },
        state: 'active',
      },
    ],
    semanticEdges: [],
    cacheEntries: [],
    contradictions: [],
    recommendedNextActions: ['Advance the governed automation task into active execution.'],
    missingInformation: [],
  };
}
