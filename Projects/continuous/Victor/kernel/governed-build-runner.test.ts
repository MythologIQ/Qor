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

  it('falls back to reflective review when governed automation work is already in progress', async () => {
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
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
              status: 'in-progress',
            },
          ],
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const result = await runGovernedAutomationBuild(
      {
        projectsDir,
        dryRun: false,
        maxActions: 1,
      },
      async () => groundedContext('in-progress'),
    );

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('dry-run');
    expect(result.selectedTask?.taskId).toBe('task-1');
    expect(result.selectionReason).toContain('grounded reflection');
    expect(result.automation.results[0]?.reason).toContain('reflective review');
  });

  it('creates a governed draft task from active-task reflection when the next action is concrete', async () => {
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
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
              status: 'in-progress',
            },
          ],
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const result = await runGovernedAutomationBuild(
      {
        projectsDir,
        dryRun: false,
        maxActions: 1,
      },
      async () => groundedContext('in-progress', ['Start implementation with prompt-construction operations telemetry wiring.']),
    );

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('execute');
    expect(result.selectionReason).toContain('follow-on draft task');
    expect(result.automation.executedCount).toBe(1);
    expect(result.automation.results[0]?.kind).toBe('create-draft-task');
    expect(result.automation.results[0]?.status).toBe('created');

    const updated = await pathStore.read<{ phases?: Array<{ tasks?: Array<{ title?: string }> }> }>();
    expect(updated?.phases?.[0]?.tasks).toHaveLength(2);
    expect(updated?.phases?.[0]?.tasks?.some((task) => task.title === 'Prompt-construction operations telemetry wiring')).toBe(true);
  });

  it('completes a specific active subtask when all acceptance evidence is grounded', async () => {
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
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
              taskId: 'task-parent',
              phaseId: 'phase-1',
              title: 'Automate comms-tab prompt construction',
              description: 'Umbrella task should stay open while subtasks remain active.',
              acceptance: ['All child work is complete.'],
              status: 'in-progress',
            },
            {
              taskId: 'task-audit',
              phaseId: 'phase-1',
              title: 'Implement automation audit logging',
              description: 'Add append-only automation audit records and query APIs.',
              acceptance: [
                'Automation runs produce run-started, action, and run-completed audit entries.',
                'Audit entries capture governance results and before/after state for task mutations.',
                'Victor exposes a query path for recent automation audit history.',
              ],
              status: 'in-progress',
            },
          ],
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const result = await runGovernedAutomationBuild(
      {
        projectsDir,
        dryRun: false,
        maxActions: 1,
      },
      async (_projectId, query) => completionReadyGroundedContext(query),
    );

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('execute');
    expect(result.selectedTask?.taskId).toBe('task-audit');
    expect(result.selectionReason).toContain('governed task completion');
    expect(result.automation.results[0]?.kind).toBe('update-task-status');
    expect(result.automation.results[0]?.status).toBe('updated');

    const updated = await pathStore.read<{ phases?: Array<{ tasks?: Array<{ taskId?: string; status?: string }> }> }>();
    const tasks = updated?.phases?.[0]?.tasks ?? [];
    expect(tasks.find((task) => task.taskId === 'task-audit')?.status).toBe('done');
    expect(tasks.find((task) => task.taskId === 'task-parent')?.status).toBe('in-progress');
  });

  it('prioritizes completion-ready active subtasks over umbrella draft recommendations', async () => {
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
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
              taskId: 'task-parent',
              phaseId: 'phase-1',
              title: 'Automate comms-tab prompt construction',
              description: 'Umbrella task should stay open while subtasks remain active.',
              acceptance: ['All child work is complete.'],
              status: 'in-progress',
            },
            {
              taskId: 'task-audit',
              phaseId: 'phase-1',
              title: 'Implement automation audit logging',
              description: 'Add append-only automation audit records and query APIs.',
              acceptance: [
                'Automation runs produce run-started, action, and run-completed audit entries.',
                'Audit entries capture governance results and before/after state for task mutations.',
                'Victor exposes a query path for recent automation audit history.',
              ],
              status: 'in-progress',
            },
          ],
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const result = await runGovernedAutomationBuild(
      {
        projectsDir,
        dryRun: false,
        maxActions: 1,
      },
      async (_projectId, query) => (
        query.includes('Automate comms-tab prompt construction')
          ? groundedContext('in-progress', ['Reduce comms tab to standard chat input/output'])
          : completionReadyGroundedContext(query)
      ),
    );

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('execute');
    expect(result.selectedTask?.taskId).toBe('task-audit');
    expect(result.selectionReason).toContain('governed task completion');
    expect(result.automation.results[0]?.kind).toBe('update-task-status');
    expect(result.automation.results[0]?.status).toBe('updated');

    const updated = await pathStore.read<{ phases?: Array<{ tasks?: Array<{ taskId?: string; status?: string }> }> }>();
    const tasks = updated?.phases?.[0]?.tasks ?? [];
    expect(tasks.find((task) => task.taskId === 'task-audit')?.status).toBe('done');
    expect(tasks.find((task) => task.taskId === 'task-parent')?.status).toBe('in-progress');
  });

  it('suppresses umbrella follow-on drafts while concrete child tasks are already in progress', async () => {
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
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
              taskId: 'task-parent',
              phaseId: 'phase-1',
              title: 'Automate comms-tab prompt construction',
              description: 'Umbrella task should stay focused on active child work.',
              acceptance: ['All child work is complete.'],
              status: 'in-progress',
            },
            {
              taskId: 'task-backend',
              phaseId: 'phase-1',
              title: 'Build backend prompt-construction pipeline',
              description: 'Implement the backend path that assembles prompt inputs and emits structured prompt-construction events.',
              acceptance: ['Prompt inputs are assembled by a backend pipeline instead of manual UI composition.'],
              status: 'in-progress',
            },
          ],
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const result = await runGovernedAutomationBuild(
      {
        projectsDir,
        dryRun: true,
        maxActions: 1,
      },
      async (_projectId, query) => (
        query.includes('Automate comms-tab prompt construction')
          ? groundedContext('in-progress', ['Build prompt-construction operations display'])
          : activeTaskGroundedContext(
              'Build backend prompt-construction pipeline',
              'task-backend',
              'Prompt inputs are assembled by a backend pipeline instead of manual UI composition.',
            )
      ),
    );

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('dry-run');
    expect(result.selectedTask?.taskId).toBe('task-backend');
    expect(result.selectionReason).not.toContain('follow-on draft task');
    expect(result.automation.results[0]?.reason).toContain('eligible for governed execution');

    const updated = await pathStore.read<{ phases?: Array<{ tasks?: Array<{ taskId?: string }> }> }>();
    expect(updated?.phases?.[0]?.tasks).toHaveLength(2);
  });
});

function groundedContext(
  status: 'pending' | 'in-progress' = 'pending',
  recommendedNextActions: string[] = ['Advance the governed automation task into active execution.'],
): GroundedContextBundle {
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
        attributes: { status, taskId: 'task-1' },
        state: 'active',
      },
    ],
    semanticEdges: [],
    cacheEntries: [],
    contradictions: [],
    recommendedNextActions,
    missingInformation: [],
  };
}

function activeTaskGroundedContext(
  title: string,
  taskId: string,
  acceptanceEvidence: string,
  recommendedNextActions: string[] = ['Advance the governed automation task into active execution.'],
): GroundedContextBundle {
  return {
    query: `What is the next grounded reflection for the active governed automation task "${title}"?`,
    chunkHits: [
      {
        score: 5,
        chunk: {
          id: `chunk-${taskId}`,
          documentId: `doc-${taskId}`,
          index: 0,
          fingerprint: `chunk-${taskId}`,
          text: acceptanceEvidence,
          tokenEstimate: 16,
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: acceptanceEvidence.length },
        },
      },
    ],
    semanticNodes: [
      {
        id: taskId,
        documentId: `doc-${taskId}`,
        sourceChunkId: `chunk-${taskId}`,
        nodeType: 'Task',
        label: title,
        summary: title,
        fingerprint: taskId,
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: title.length },
        attributes: { status: 'in-progress', taskId },
        state: 'active',
      },
      {
        id: `goal-${taskId}`,
        documentId: `doc-${taskId}`,
        sourceChunkId: `chunk-${taskId}`,
        nodeType: 'Goal',
        label: acceptanceEvidence,
        summary: acceptanceEvidence,
        fingerprint: `goal-${taskId}`,
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: acceptanceEvidence.length },
        attributes: {},
        state: 'active',
      },
    ],
    semanticEdges: [
      {
        id: `edge-${taskId}`,
        documentId: `doc-${taskId}`,
        sourceChunkId: `chunk-${taskId}`,
        fromNodeId: taskId,
        toNodeId: `goal-${taskId}`,
        edgeType: 'supports',
        fingerprint: `edge-${taskId}`,
        attributes: {},
        state: 'active',
      },
    ],
    cacheEntries: [],
    contradictions: [],
    recommendedNextActions,
    missingInformation: [],
  };
}

function completionReadyGroundedContext(query: string): GroundedContextBundle {
  return {
    query,
    chunkHits: [
      {
        score: 8,
        chunk: {
          id: 'chunk-audit',
          documentId: 'doc-audit',
          index: 0,
          fingerprint: 'chunk-audit',
          text: 'Automation runs produce run-started, action, and run-completed audit entries. Audit entries capture governance results and before/after state for task mutations. Victor exposes a query path for recent automation audit history.',
          tokenEstimate: 32,
          span: { startLine: 1, endLine: 3, startOffset: 0, endOffset: 80 },
        },
      },
    ],
    semanticNodes: [
      {
        id: 'task-audit',
        documentId: 'doc-audit',
        sourceChunkId: 'chunk-audit',
        nodeType: 'Task',
        label: 'Implement automation audit logging',
        summary: 'Implement automation audit logging',
        fingerprint: 'task-audit',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: { status: 'in-progress', taskId: 'task-audit' },
        state: 'active',
      },
      {
        id: 'goal-audit-1',
        documentId: 'doc-audit',
        sourceChunkId: 'chunk-audit',
        nodeType: 'Goal',
        label: 'Automation runs produce run-started, action, and run-completed audit entries.',
        summary: 'Automation runs produce run-started, action, and run-completed audit entries.',
        fingerprint: 'goal-audit-1',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: {},
        state: 'active',
      },
      {
        id: 'goal-audit-2',
        documentId: 'doc-audit',
        sourceChunkId: 'chunk-audit',
        nodeType: 'Goal',
        label: 'Audit entries capture governance results and before/after state for task mutations.',
        summary: 'Audit entries capture governance results and before/after state for task mutations.',
        fingerprint: 'goal-audit-2',
        span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 20 },
        attributes: {},
        state: 'active',
      },
      {
        id: 'goal-audit-3',
        documentId: 'doc-audit',
        sourceChunkId: 'chunk-audit',
        nodeType: 'Goal',
        label: 'Victor exposes a query path for recent automation audit history.',
        summary: 'Victor exposes a query path for recent automation audit history.',
        fingerprint: 'goal-audit-3',
        span: { startLine: 3, endLine: 3, startOffset: 21, endOffset: 30 },
        attributes: {},
        state: 'active',
      },
    ],
    semanticEdges: [
      {
        id: 'edge-audit-1',
        documentId: 'doc-audit',
        sourceChunkId: 'chunk-audit',
        fromNodeId: 'task-audit',
        toNodeId: 'goal-audit-1',
        edgeType: 'supports',
        fingerprint: 'edge-audit-1',
        attributes: {},
        state: 'active',
      },
      {
        id: 'edge-audit-2',
        documentId: 'doc-audit',
        sourceChunkId: 'chunk-audit',
        fromNodeId: 'task-audit',
        toNodeId: 'goal-audit-2',
        edgeType: 'supports',
        fingerprint: 'edge-audit-2',
        attributes: {},
        state: 'active',
      },
      {
        id: 'edge-audit-3',
        documentId: 'doc-audit',
        sourceChunkId: 'chunk-audit',
        fromNodeId: 'task-audit',
        toNodeId: 'goal-audit-3',
        edgeType: 'supports',
        fingerprint: 'edge-audit-3',
        attributes: {},
        state: 'active',
      },
    ],
    cacheEntries: [],
    contradictions: [],
    recommendedNextActions: [],
    missingInformation: [],
  };
}
