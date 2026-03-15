import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { createProjectStore } from '../../Zo-Qore/runtime/planning';
import { listAutomationAuditRecords, summarizeAutomationActivity, summarizeBuildProgress } from './automation-audit';
import { runVictorSafeAutomation } from './automation-runner';
import type { GroundedContextBundle } from './memory/types';

describe('runVictorSafeAutomation', () => {
  let projectsDir: string;

  beforeEach(async () => {
    projectsDir = await mkdtemp(join(tmpdir(), 'victor-automation-runner-'));
    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    await projectStore.create({
      name: 'Builder Console',
      description: 'Safe automation fixture',
      createdBy: 'tester',
    });

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

  it('returns an eligible dry-run preview for a safe status update', async () => {
    const result = await runVictorSafeAutomation(
      {
        dryRun: true,
        maxActions: 1,
        projectsDir,
        actions: [
          {
            kind: 'update-task-status',
            projectId: 'builder-console',
            phaseId: 'phase-1',
            taskId: 'task-1',
            status: 'in-progress',
            query: 'What should happen next with the comms-tab prompt automation task?',
          },
        ],
      },
      async () => groundedContext(),
    );

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('dry-run');
    expect(result.results[0]?.status).toBe('eligible');
    expect(result.executedCount).toBe(0);
    const audit = await listAutomationAuditRecords('builder-console', projectsDir, { runId: result.runId });
    expect(audit.map((entry) => entry.event)).toEqual(['run-completed', 'action', 'run-started']);
    expect(audit[1]?.payload.resultStatus).toBe('eligible');
    expect(audit[1]?.payload.mode).toBe('dry-run');
  });

  it('blocks execution when the action budget is exceeded', async () => {
    const result = await runVictorSafeAutomation(
      {
        dryRun: false,
        maxActions: 1,
        projectsDir,
        actions: [
          {
            kind: 'update-task-status',
            projectId: 'builder-console',
            phaseId: 'phase-1',
            taskId: 'task-1',
            status: 'in-progress',
            query: 'What should happen next with the comms-tab prompt automation task?',
          },
          {
            kind: 'update-task-status',
            projectId: 'builder-console',
            phaseId: 'phase-1',
            taskId: 'task-1',
            status: 'done',
            query: 'Can Victor mark the comms task as complete?',
          },
        ],
      },
      async () => groundedContext(),
    );

    expect(result.status).toBe('blocked');
    expect(result.results[0]?.reason).toContain('exceeds the safe automation budget');
    const audit = await listAutomationAuditRecords('builder-console', projectsDir, { runId: result.runId });
    expect(audit.some((entry) => entry.event === 'action')).toBe(true);
    expect(audit.find((entry) => entry.event === 'action')?.payload.resultStatus).toBe('blocked');
  });

  it('blocks dry-run preview when evidence is weak', async () => {
    const result = await runVictorSafeAutomation(
      {
        dryRun: true,
        projectsDir,
        actions: [
          {
            kind: 'update-task-status',
            projectId: 'builder-console',
            phaseId: 'phase-1',
            taskId: 'task-1',
            status: 'done',
            query: 'Can Victor mark the comms task as complete?',
          },
        ],
      },
      async () => ({
        ...groundedContext(),
        missingInformation: ['No completion evidence was found in the retrieved context.'],
      }),
    );

    expect(result.status).toBe('blocked');
    expect(result.results[0]?.status).toBe('blocked');
    expect(result.results[0]?.reason).toContain('evidence is incomplete');
    const audit = await listAutomationAuditRecords('builder-console', projectsDir, { runId: result.runId });
    expect(audit.find((entry) => entry.event === 'action')?.payload.reason).toContain('evidence is incomplete');
  });

  it('executes a safe status update when dryRun is false', async () => {
    const result = await runVictorSafeAutomation(
      {
        dryRun: false,
        maxActions: 1,
        projectsDir,
        actions: [
          {
            kind: 'update-task-status',
            projectId: 'builder-console',
            phaseId: 'phase-1',
            taskId: 'task-1',
            status: 'in-progress',
            query: 'What should happen next with the comms-tab prompt automation task?',
          },
        ],
      },
      async () => groundedContext(),
    );

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('execute');
    expect(result.executedCount).toBe(1);
    expect(result.results[0]?.status).toBe('updated');
    const audit = await listAutomationAuditRecords('builder-console', projectsDir, { runId: result.runId });
    const actionEntry = audit.find((entry) => entry.event === 'action');
    expect(actionEntry?.payload.executed).toBe(true);
    expect(actionEntry?.payload.target).toBeObject();
  });

  it('summarizes automation activity from audit records', async () => {
    const first = await runVictorSafeAutomation(
      {
        dryRun: false,
        maxActions: 1,
        projectsDir,
        actions: [
          {
            kind: 'update-task-status',
            projectId: 'builder-console',
            phaseId: 'phase-1',
            taskId: 'task-1',
            status: 'in-progress',
            query: 'What should happen next with the comms-tab prompt automation task?',
          },
        ],
      },
      async () => groundedContext(),
    );

    const second = await runVictorSafeAutomation(
      {
        dryRun: true,
        maxActions: 1,
        projectsDir,
        actions: [
          {
            kind: 'update-task-status',
            projectId: 'builder-console',
            phaseId: 'phase-1',
            taskId: 'task-1',
            status: 'done',
            query: 'Can Victor mark the comms task as complete?',
          },
        ],
      },
      async () => ({
        ...groundedContext(),
        missingInformation: ['No completion evidence was found in the retrieved context.'],
      }),
    );

    expect(first.runId).toBeString();
    expect(second.runId).toBeString();

    const summary = await summarizeAutomationActivity('builder-console', projectsDir, {
      limit: 20,
      since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    expect(summary.totalRuns).toBe(2);
    expect(summary.completedRuns).toBe(1);
    expect(summary.blockedRuns).toBe(1);
    expect(summary.executedActions).toBe(1);
    expect(summary.blockedActions).toBe(1);
    expect(summary.changedTaskIds).toContain('task-1');
    expect(summary.blockedReasons.some((reason) => reason.includes('evidence is incomplete'))).toBe(true);
    expect(summary.recentRuns.length).toBe(2);
  });

  it('projects build progress from path state and automation audit entries', async () => {
    await runVictorSafeAutomation(
      {
        dryRun: false,
        maxActions: 1,
        projectsDir,
        actions: [
          {
            kind: 'create-draft-task',
            projectId: 'builder-console',
            phaseId: 'phase-1',
            title: 'Implement build progress projection',
            description: 'Create a builder-facing projection layer for progress visibility.',
            acceptance: ['Projection exists'],
            query: 'What Builder Console work should be added to strengthen governed automation visibility?',
          },
        ],
      },
      async () => ({
        ...groundedContext(),
        query: 'What Builder Console work should be added to strengthen governed automation visibility?',
      }),
    );

    await runVictorSafeAutomation(
      {
        dryRun: false,
        maxActions: 1,
        projectsDir,
        actions: [
          {
            kind: 'update-task-status',
            projectId: 'builder-console',
            phaseId: 'phase-1',
            taskId: 'task-1',
            status: 'in-progress',
            query: 'What should happen next with the comms-tab prompt automation task?',
          },
        ],
      },
      async () => groundedContext(),
    );

    await runVictorSafeAutomation(
      {
        dryRun: true,
        maxActions: 1,
        projectsDir,
        actions: [
          {
            kind: 'update-task-status',
            projectId: 'builder-console',
            phaseId: 'phase-1',
            taskId: 'task-1',
            status: 'done',
            query: 'Can Victor mark the comms task as complete?',
          },
        ],
      },
      async () => ({
        ...groundedContext(),
        missingInformation: ['No completion evidence was found in the retrieved context.'],
      }),
    );

    const summary = await summarizeBuildProgress('builder-console', projectsDir, {
      limit: 10,
      since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    expect(summary.phaseCount).toBe(1);
    expect(summary.activePhaseCount).toBe(1);
    expect(summary.taskCounts.total).toBe(2);
    expect(summary.taskCounts.inProgress).toBe(1);
    expect(summary.taskCounts.pending).toBe(1);
    expect(summary.createdTaskIds.length).toBe(1);
    expect(summary.changedTaskIds).toContain('task-1');
    expect(summary.blockedTaskIds).toContain('task-1');
    expect(summary.deliveryBlockers.some((reason) => reason.includes('evidence is incomplete'))).toBe(true);
    expect(summary.recentTaskActivity.some((entry) => entry.kind === 'created')).toBe(true);
    expect(summary.recentTaskActivity.some((entry) => entry.kind === 'status-changed')).toBe(true);
    expect(summary.recentTaskActivity.some((entry) => entry.kind === 'blocked-attempt')).toBe(true);
  });
});

function groundedContext(): GroundedContextBundle {
  return {
    query: 'What should happen next with the comms-tab prompt automation task?',
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
    recommendedNextActions: ['Start implementation with governed prompt-build telemetry wiring.'],
    missingInformation: [],
  };
}
