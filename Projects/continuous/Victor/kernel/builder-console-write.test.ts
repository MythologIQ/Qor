import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { createProjectStore } from '../../Zo-Qore/runtime/planning';
import {
  appendGovernedBuilderConsolePlanningNote,
  createGovernedBuilderConsoleDraftTask,
  updateGovernedBuilderConsoleTaskStatus,
} from './builder-console-write';
import type { GroundedContextBundle } from './memory/types';

describe('createGovernedBuilderConsoleDraftTask', () => {
  let projectsDir: string;

  beforeEach(async () => {
    projectsDir = await mkdtemp(join(tmpdir(), 'victor-builder-write-'));
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    await projectStore.create({
      name: 'Builder Console',
      description: 'Governed task creation fixture',
      createdBy: 'tester',
    });
    const voidStore = await projectStore.getVoidStore();
    await voidStore.addThought({
      thoughtId: 'thought-1',
      projectId: 'builder-console',
      content: 'Governed automation reflection anchor.',
      source: 'text',
      capturedAt: new Date().toISOString(),
      capturedBy: 'tester',
      tags: ['governance'],
      status: 'raw',
    }, 'tester');

    const revealStore = await projectStore.getViewStore('reveal');
    await revealStore.write({
      clusters: [
        {
          clusterId: 'cluster-1',
          projectId: 'builder-console',
          label: 'Operational Memory',
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
          name: 'Execution',
          objective: 'Execute grounded work',
          sourceClusterIds: ['cluster-1'],
          tasks: [],
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

  it('creates a governed draft task when grounded evidence is complete', async () => {
    const result = await createGovernedBuilderConsoleDraftTask(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        title: 'Create Victor draft task adapter',
        description: 'Allow Victor to create governed draft tasks through Builder Console.',
        acceptance: ['Draft task is persisted under the target phase'],
        query: 'What comms tab prompt automation task exists in Builder Console?',
      },
      groundedContext(),
    );

    expect(result.status).toBe('created');
    expect(result.classification).toBe('low-risk');
    expect(result.task?.title).toBe('Create Victor draft task adapter');
    expect(result.ledgerEntryId).toBeString();
  });

  it('blocks task creation when the grounded context is incomplete', async () => {
    const result = await createGovernedBuilderConsoleDraftTask(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        title: 'Unsafe write',
        description: 'This should not be created.',
        query: 'What Builder Console task is active?',
      },
      {
        ...groundedContext(),
        missingInformation: ['No active task node was found in the retrieved context.'],
      },
    );

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('evidence is incomplete');
  });

  it('returns duplicate when a near-identical task already exists', async () => {
    await createGovernedBuilderConsoleDraftTask(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        title: 'Create Victor draft task adapter',
        description: 'Allow Victor to create governed draft tasks through Builder Console.',
        query: 'What comms tab prompt automation task exists in Builder Console?',
      },
      groundedContext(),
    );

    const duplicate = await createGovernedBuilderConsoleDraftTask(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        title: 'Create Victor draft task adapter',
        description: 'Duplicate write attempt.',
        query: 'What comms tab prompt automation task exists in Builder Console?',
      },
      groundedContext(),
    );

    expect(duplicate.status).toBe('duplicate');
    expect(duplicate.duplicateTaskId).toBeString();
  });

  it('treats input/output wording as a duplicate of I/O wording', async () => {
    await createGovernedBuilderConsoleDraftTask(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        title: 'Reduce comms tab to standard chat I/O',
        description: 'Collapse the comms tab to standard chat I/O.',
        query: 'What comms tab prompt automation task exists in Builder Console?',
      },
      groundedContext(),
    );

    const duplicate = await createGovernedBuilderConsoleDraftTask(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        title: 'Reduce comms tab to standard chat input/output',
        description: 'Equivalent wording for the same work.',
        query: 'What comms tab prompt automation task exists in Builder Console?',
      },
      groundedContext(),
    );

    expect(duplicate.status).toBe('duplicate');
    expect(duplicate.duplicateTaskId).toBeString();
  });

  it('blocks task creation when the target phase does not exist', async () => {
    const result = await createGovernedBuilderConsoleDraftTask(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-missing',
        title: 'Missing phase write',
        description: 'This should fail because the phase is missing.',
        query: 'What comms tab prompt automation task exists in Builder Console?',
      },
      groundedContext(),
    );

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('target phase was not found');
  });

  it('blocks task creation when grounded evidence contains contradictions', async () => {
    const result = await createGovernedBuilderConsoleDraftTask(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        title: 'Contradictory write',
        description: 'This should fail because the memory bundle conflicts.',
        query: 'What is the authority model for Victor?',
      },
      {
        ...groundedContext(),
        contradictions: [
          {
            key: 'Decision:authority model',
            nodeIds: ['decision-1', 'decision-2'],
            summaries: ['Victor is authoritative', 'Builder Console is authoritative'],
          },
        ],
      },
    );

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('contains contradictions');
  });

  it('blocks task creation when Builder Console governance denies the write', async () => {
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    const constellationStore = await projectStore.getViewStore('constellation');
    await constellationStore.write({
      constellationId: 'const-1',
      projectId: 'builder-console',
      nodes: [{ nodeId: 'node-1', clusterId: 'missing-cluster', position: { x: 0, y: 0 } }],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'mapped',
    });

    const result = await createGovernedBuilderConsoleDraftTask(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        title: 'Governance denied write',
        description: 'This should fail because project state violates Builder Console governance.',
        query: 'What comms tab prompt automation task exists in Builder Console?',
      },
      groundedContext(),
    );

    expect(result.status).toBe('blocked');
    expect(result.governance?.allowed).toBe(false);
    expect(result.reason).toContain('PL-POL-07');
  });
});

describe('updateGovernedBuilderConsoleTaskStatus', () => {
  let projectsDir: string;

  beforeEach(async () => {
    projectsDir = await mkdtemp(join(tmpdir(), 'victor-builder-status-'));
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    await projectStore.create({
      name: 'Builder Console',
      description: 'Governed task status fixture',
      createdBy: 'tester',
    });
    const voidStore = await projectStore.getVoidStore();
    await voidStore.addThought({
      thoughtId: 'thought-1',
      projectId: 'builder-console',
      content: 'Governed execution anchor.',
      source: 'text',
      capturedAt: new Date().toISOString(),
      capturedBy: 'tester',
      tags: ['governance'],
      status: 'raw',
    }, 'tester');

    const revealStore = await projectStore.getViewStore('reveal');
    await revealStore.write({
      clusters: [
        {
          clusterId: 'cluster-1',
          projectId: 'builder-console',
          label: 'Operational Memory',
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
          name: 'Execution',
          objective: 'Execute grounded work',
          sourceClusterIds: ['cluster-1'],
          tasks: [
            {
              taskId: 'task-1',
              phaseId: 'phase-1',
              title: 'Automate comms-tab prompt construction',
              description: 'Reduce the comms tab to standard chat IO plus prompt-build visibility.',
              acceptance: ['Prompt construction is visible in operations display'],
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

  it('updates a governed task status when grounded evidence is complete', async () => {
    const result = await updateGovernedBuilderConsoleTaskStatus(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        taskId: 'task-1',
        status: 'in-progress',
        query: 'What should happen next with the comms-tab prompt automation task?',
      },
      groundedContext(),
    );

    expect(result.status).toBe('updated');
    expect(result.classification).toBe('low-risk');
    expect(result.previousStatus).toBe('pending');
    expect(result.task?.status).toBe('in-progress');
    expect(result.ledgerEntryId).toBeString();
  });

  it('blocks task status updates when the grounded context is incomplete', async () => {
    const result = await updateGovernedBuilderConsoleTaskStatus(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        taskId: 'task-1',
        status: 'done',
        query: 'Can Victor mark the comms task as complete?',
      },
      {
        ...groundedContext(),
        missingInformation: ['No completion evidence was found in the retrieved context.'],
      },
    );

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('evidence is incomplete');
  });

  it('blocks task status updates when the target phase does not exist', async () => {
    const result = await updateGovernedBuilderConsoleTaskStatus(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-missing',
        taskId: 'task-1',
        status: 'in-progress',
        query: 'What should happen next with the comms-tab prompt automation task?',
      },
      groundedContext(),
    );

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('target phase was not found');
  });

  it('blocks task status updates when the target task does not exist', async () => {
    const result = await updateGovernedBuilderConsoleTaskStatus(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        taskId: 'task-missing',
        status: 'in-progress',
        query: 'What should happen next with the comms-tab prompt automation task?',
      },
      groundedContextForTask('task-missing'),
    );

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('target task was not found');
  });

  it('blocks task status updates when grounded evidence contains contradictions', async () => {
    const result = await updateGovernedBuilderConsoleTaskStatus(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        taskId: 'task-1',
        status: 'blocked',
        query: 'Is the comms task blocked?',
      },
      {
        ...groundedContext(),
        contradictions: [
          {
            key: 'Task:task-1:status',
            nodeIds: ['task-1', 'task-1b'],
            summaries: ['Task is ready for execution', 'Task is blocked on missing UI state'],
          },
        ],
      },
    );

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('contains contradictions');
  });

  it('blocks task status updates when no grounded task matches the target task', async () => {
    const result = await updateGovernedBuilderConsoleTaskStatus(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        taskId: 'task-1',
        status: 'done',
        query: 'Can Victor mark the comms task as complete?',
      },
      {
        ...groundedContext(),
        semanticNodes: groundedContext().semanticNodes.filter((node) => node.nodeType !== 'Task'),
      },
    );

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('no grounded task evidence matched');
  });

  it('blocks task status updates when Builder Console governance denies the write', async () => {
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    const constellationStore = await projectStore.getViewStore('constellation');
    await constellationStore.write({
      constellationId: 'const-1',
      projectId: 'builder-console',
      nodes: [{ nodeId: 'node-1', clusterId: 'missing-cluster', position: { x: 0, y: 0 } }],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'mapped',
    });

    const result = await updateGovernedBuilderConsoleTaskStatus(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        taskId: 'task-1',
        status: 'in-progress',
        query: 'What should happen next with the comms-tab prompt automation task?',
      },
      groundedContext(),
    );

    expect(result.status).toBe('blocked');
    expect(result.governance?.allowed).toBe(false);
    expect(result.reason).toContain('PL-POL-07');
  });
});

describe('appendGovernedBuilderConsolePlanningNote', () => {
  let projectsDir: string;

  beforeEach(async () => {
    projectsDir = await mkdtemp(join(tmpdir(), 'victor-builder-note-'));
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    await projectStore.create({
      name: 'Builder Console',
      description: 'Governed planning note fixture',
      createdBy: 'tester',
    });
    const voidStore = await projectStore.getVoidStore();
    await voidStore.addThought({
      thoughtId: 'thought-1',
      projectId: 'builder-console',
      content: 'Reflection anchor.',
      source: 'text',
      capturedAt: new Date().toISOString(),
      capturedBy: 'tester',
      tags: ['reflection'],
      status: 'raw',
    }, 'tester');

    const revealStore = await projectStore.getViewStore('reveal');
    await revealStore.write({
      clusters: [
        {
          clusterId: 'cluster-1',
          projectId: 'builder-console',
          label: 'Operational Memory',
          thoughtIds: [],
          notes: 'Existing notes',
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
          name: 'Execution',
          objective: 'Execute grounded work',
          sourceClusterIds: ['cluster-1'],
          tasks: [],
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

  it('appends a governed reflective planning note to the phase source cluster', async () => {
    const result = await appendGovernedBuilderConsolePlanningNote(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        taskId: 'task-1',
        content: '## Victor Cooldown Reflection\n- Result: grounded review remained read-only.',
        query: 'What should Victor reflect on during cooldown?',
      },
      groundedContext(),
    );

    expect(result.status).toBe('updated');
    expect(result.clusterId).toBe('cluster-1');
    expect(result.ledgerEntryId).toBeString();
  });

  it('blocks reflective planning note writes when no source cluster is attached to the phase', async () => {
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    const pathStore = await projectStore.getViewStore('path');
    await pathStore.write({
      phases: [
        {
          phaseId: 'phase-1',
          projectId: 'builder-console',
          ordinal: 1,
          name: 'Execution',
          objective: 'Execute grounded work',
          sourceClusterIds: [],
          tasks: [],
          status: 'planned',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const result = await appendGovernedBuilderConsolePlanningNote(
      {
        projectsDir,
        projectId: 'builder-console',
        phaseId: 'phase-1',
        content: 'Reflection content',
        query: 'What should Victor reflect on during cooldown?',
      },
      groundedContext(),
    );

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('no source Reveal cluster');
  });
});

function groundedContext(): GroundedContextBundle {
  return groundedContextForTask('task-1');
}

function groundedContextForTask(taskId: string): GroundedContextBundle {
  return {
    query: 'What comms tab prompt automation task exists in Builder Console?',
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
        id: taskId,
        documentId: 'doc-1',
        sourceChunkId: 'chunk-1',
        nodeType: 'Task',
        label: 'Automate comms-tab prompt construction',
        summary: 'Automate comms-tab prompt construction',
        fingerprint: taskId,
        span: { startLine: 2, endLine: 2, startOffset: 41, endOffset: 80 },
        attributes: { status: 'pending', taskId },
        state: 'active',
      },
    ],
    semanticEdges: [],
    cacheEntries: [],
    contradictions: [],
    missingInformation: [],
    recommendedNextActions: [],
  };
}
