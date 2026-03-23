import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { createProjectStore } from '../../runtime/planning';
import { startHeartbeat, tickHeartbeat, type HeartbeatContract, type HeartbeatRequest } from './heartbeat';
import type { GroundedContextBundle } from './memory/types';
import {
  summarizeExecuteBudgetPolicy,
  summarizeFallbackRevocation,
  summarizePromotionGate,
  summarizeSoakEvidence,
} from './promotion-gate';

describe('promotion gate artifacts', () => {
  let projectsDir: string;
  let stateDir: string;

  beforeEach(async () => {
    projectsDir = await mkdtemp(join(tmpdir(), 'victor-promotion-projects-'));
    stateDir = await mkdtemp(join(tmpdir(), 'victor-promotion-state-'));

    const builderStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    await builderStore.create({
      name: 'Builder Console',
      description: 'Promotion gate fixture',
      createdBy: 'tester',
    });
    const builderReveal = await builderStore.getViewStore('reveal');
    await builderReveal.write({
      clusters: [
        {
          clusterId: 'cluster-1',
          projectId: 'builder-console',
          label: 'Governed Automation',
          thoughtIds: [],
          notes: 'Grounded automation cluster',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'formed',
        },
      ],
    });
    const builderConstellation = await builderStore.getViewStore('constellation');
    await builderConstellation.write({
      constellationId: 'const-1',
      projectId: 'builder-console',
      nodes: [{ nodeId: 'node-1', clusterId: 'cluster-1', position: { x: 0, y: 0 } }],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'mapped',
    });
    const builderPath = await builderStore.getViewStore('path');
    await builderPath.write({
      phases: [
        {
          phaseId: 'phase-1',
          projectId: 'builder-console',
          ordinal: 1,
          name: 'Governed Automation',
          objective: 'Advance governed automation safely.',
          sourceClusterIds: ['cluster-1'],
          tasks: [
            {
              taskId: 'task-1',
              phaseId: 'phase-1',
              title: 'Run unattended 30m dry-run heartbeat soak',
              description: 'Run the bounded unattended soak at 30m cadence.',
              acceptance: ['Heartbeat starts cleanly and emits audit-backed evidence without writes.'],
              status: 'pending',
            },
          ],
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const victorStore = createProjectStore('victor-resident', projectsDir, { enableLedger: true });
    await victorStore.create({
      name: 'Victor',
      description: 'Victor promotion fixture',
      createdBy: 'tester',
    });
    const victorReveal = await victorStore.getViewStore('reveal');
    await victorReveal.write({
      clusters: [
        {
          clusterId: 'cluster-victor',
          projectId: 'victor-resident',
          label: 'Victor Promotion',
          thoughtIds: [],
          notes: 'Victor promotion cluster',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'formed',
        },
      ],
    });
    const victorConstellation = await victorStore.getViewStore('constellation');
    await victorConstellation.write({
      constellationId: 'const-victor',
      projectId: 'victor-resident',
      nodes: [{ nodeId: 'node-victor', clusterId: 'cluster-victor', position: { x: 0, y: 0 } }],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'mapped',
    });
    const victorPath = await victorStore.getViewStore('path');
    await victorPath.write({
      phases: [
        {
          phaseId: 'phase-victor-promotion',
          projectId: 'victor-resident',
          ordinal: 1,
          name: 'Unattended Execute Promotion Review',
          objective: 'Define the execute-mode bar before unattended writes are allowed.',
          sourceClusterIds: ['cluster-victor'],
          tasks: [
            {
              taskId: 'task-promotion-criteria',
              phaseId: 'phase-victor-promotion',
              title: 'Define Victor unattended execute-mode promotion criteria',
              description: 'Define the criteria.',
              acceptance: ['Criteria are explicit and governed.'],
              status: 'in-progress',
            },
            {
              taskId: 'task-fallback',
              phaseId: 'phase-victor-promotion',
              title: 'Record unattended execute fallback and revocation triggers',
              description: 'Record fallback and revocation triggers.',
              acceptance: ['Fallback and revocation are explicit.'],
              status: 'pending',
            },
            {
              taskId: 'task-dependencies',
              phaseId: 'phase-victor-promotion',
              title: 'Record Builder dependencies that gate Victor autonomy promotion',
              description: 'Document Builder dependency gates.',
              acceptance: ['Dependencies are explicit and governable.'],
              status: 'done',
            },
          ],
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  afterEach(async () => {
    await rm(projectsDir, { recursive: true, force: true });
    await rm(stateDir, { recursive: true, force: true });
  });

  it('scores a single clean dry-run heartbeat tick as Yellow rather than Green', async () => {
    const request = baseRequest(projectsDir, stateDir);
    const started = await startHeartbeat(request, groundedQueryResolver);
    expect(started.status).toBe('started');

    const tick = await tickHeartbeat(request, groundedQueryResolver);
    expect(tick.status).toBe('completed');

    const summary = await summarizeSoakEvidence({
      projectId: 'builder-console',
      projectsDir,
      stateDir,
    });

    expect(summary.internalState).toBe('conditionally-ready');
    expect(summary.uiLabel).toBe('Yellow');
    expect(summary.metrics.completedTicks).toBe(1);
    expect(summary.checks.find((check) => check.id === 'bounded-ticks')?.status).toBe('partial');
    expect(summary.checks.find((check) => check.id === 'no-execute-writes')?.status).toBe('met');
  });

  it('scores repeated clean dry-run ticks as Green when the soak evidence is strong enough', async () => {
    const request = baseRequest(projectsDir, stateDir);
    const started = await startHeartbeat(request, cadenceOnlyGroundedQueryResolver);
    expect(started.status).toBe('started');

    await tickHeartbeat(request, cadenceOnlyGroundedQueryResolver);
    await tickHeartbeat(request, cadenceOnlyGroundedQueryResolver);

    const summary = await summarizeSoakEvidence({
      projectId: 'builder-console',
      projectsDir,
      stateDir,
    });

    expect(summary.internalState).toBe('ready');
    expect(summary.uiLabel).toBe('Green');
    expect(summary.metrics.completedTicks).toBe(2);
    expect(summary.metrics.executeWrites).toBe(0);
    expect(summary.metrics.governanceDenials).toBe(0);
  });

  it('counts cadence-only completed ticks toward soak evidence when no governed task is eligible', async () => {
    const builderStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    const builderPath = await builderStore.getViewStore('path');
    const existing = await builderPath.read<{ phases?: Array<Record<string, unknown>> }>();
    const phases = (existing?.phases ?? []).map((phase) => ({
      ...phase,
      tasks: Array.isArray(phase.tasks)
        ? phase.tasks.map((task) => ({ ...task, status: 'done' }))
        : [],
    }));
    await builderPath.write({ phases });

    const request = baseRequest(projectsDir, stateDir);
    const started = await startHeartbeat(request, groundedQueryResolver);
    expect(started.status).toBe('started');

    await tickHeartbeat(request, groundedQueryResolver);
    await tickHeartbeat(request, groundedQueryResolver);

    const summary = await summarizeSoakEvidence({
      projectId: 'builder-console',
      projectsDir,
      stateDir,
    });

    expect(summary.internalState).toBe('ready');
    expect(summary.uiLabel).toBe('Green');
    expect(summary.metrics.completedTicks).toBe(2);
    expect(summary.metrics.incompleteAuditTicks).toBe(0);
    expect(summary.checks.find((check) => check.id === 'selection-stability')?.status).toBe('met');
  });

  it('renders the promotion gate as Yellow while criteria are in progress and fallback is still pending', async () => {
    const request = baseRequest(projectsDir, stateDir);
    const started = await startHeartbeat(request, groundedQueryResolver);
    expect(started.status).toBe('started');

    await tickHeartbeat(request, groundedQueryResolver);
    await tickHeartbeat(request, groundedQueryResolver);

    const summary = await summarizePromotionGate({
      projectId: 'builder-console',
      victorProjectId: 'victor-resident',
      projectsDir,
      stateDir,
    });

    expect(summary.internalState).toBe('conditionally-ready');
    expect(summary.uiLabel).toBe('Yellow');
    expect(summary.criteria.find((criterion) => criterion.id === 'promotion-criteria')?.status).toBe('partial');
    expect(summary.criteria.find((criterion) => criterion.id === 'fallback-revocation')?.status).toBe('unmet');
    expect(summary.criteria.find((criterion) => criterion.id === 'builder-dependencies')?.status).toBe('met');
  });

  it('renders the execute budget as Green when the heartbeat remains tightly bounded', async () => {
    const request = baseRequest(projectsDir, stateDir);
    const started = await startHeartbeat(request, groundedQueryResolver);
    expect(started.status).toBe('started');

    const summary = await summarizeExecuteBudgetPolicy({
      projectId: 'builder-console',
      stateDir,
    });

    expect(summary.internalState).toBe('ready');
    expect(summary.uiLabel).toBe('Green');
    expect(summary.heartbeat.reasoningModel).toBe('Kimi K2.5');
    expect(summary.heartbeat.maxActionsPerTick).toBe(1);
    expect(summary.checks.find((check) => check.id === 'action-budget')?.status).toBe('met');
  });

  it('renders the execute budget as Red when the heartbeat budget drifts beyond safe unattended bounds', async () => {
    const request = {
      ...baseRequest(projectsDir, stateDir),
      maxActionsPerTick: 3,
      maxConsecutiveBlocked: 5,
      maxConsecutiveFailures: 4,
    };
    const started = await startHeartbeat(request, groundedQueryResolver);
    expect(started.status).toBe('started');

    const summary = await summarizeExecuteBudgetPolicy({
      projectId: 'builder-console',
      stateDir,
    });

    expect(summary.internalState).toBe('not-ready');
    expect(summary.uiLabel).toBe('Red');
    expect(summary.checks.find((check) => check.id === 'action-budget')?.status).toBe('unmet');
    expect(summary.checks.find((check) => check.id === 'blocked-threshold')?.status).toBe('unmet');
    expect(summary.checks.find((check) => check.id === 'failure-threshold')?.status).toBe('unmet');
  });

  it('renders fallback and revocation as Red until the governing task is complete', async () => {
    const request = baseRequest(projectsDir, stateDir);
    const started = await startHeartbeat(request, groundedQueryResolver);
    expect(started.status).toBe('started');

    const summary = await summarizeFallbackRevocation({
      projectId: 'builder-console',
      victorProjectId: 'victor-resident',
      projectsDir,
      stateDir,
    });

    expect(summary.internalState).toBe('not-ready');
    expect(summary.uiLabel).toBe('Red');
    expect(summary.fallbackTask.status).toBe('unmet');
    expect(summary.checks.find((check) => check.id === 'blocked-counter-headroom')?.status).toBe('met');
  });
});

function baseRequest(projectsDir: string, stateDir: string): HeartbeatRequest {
  return {
    projectId: 'builder-console',
    projectsDir,
    stateDir,
    dryRun: true,
    cadenceMs: 30 * 60 * 1000,
    reasoningModel: 'Kimi K2.5',
    maxActionsPerTick: 1,
    maxConsecutiveBlocked: 2,
    maxConsecutiveFailures: 2,
    reflectionDir: stateDir,
  };
}

async function groundedQueryResolver(_contract: HeartbeatContract) {
  return async (_projectId: string, query: string): Promise<GroundedContextBundle> => ({
    query,
    chunkHits: [
      {
        score: 9,
        chunk: {
          id: 'chunk-1',
          documentId: 'doc-1',
          index: 0,
          fingerprint: 'chunk-1',
          text: 'Decision: governed heartbeat dry-run evidence must remain audit-backed.',
          tokenEstimate: 12,
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 60 },
        },
      },
    ],
    semanticNodes: [
      {
        id: 'decision-1',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-1',
        nodeType: 'Decision',
        label: 'Governed heartbeat dry-run evidence must remain audit-backed.',
        summary: 'Governed heartbeat dry-run evidence must remain audit-backed.',
        fingerprint: 'decision-1',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 60 },
        attributes: {},
        state: 'active',
      },
      {
        id: 'task-1',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-1',
        nodeType: 'Task',
        label: 'Run unattended 30m dry-run heartbeat soak',
        summary: 'Run unattended 30m dry-run heartbeat soak',
        fingerprint: 'task-1',
        span: { startLine: 2, endLine: 2, startOffset: 61, endOffset: 120 },
        attributes: { taskId: 'task-1', status: 'pending' },
        state: 'active',
      },
    ],
    semanticEdges: [],
    cacheEntries: [],
    contradictions: [],
    missingInformation: [],
    recommendedNextActions: ['Continue the bounded dry-run soak to build stronger evidence.'],
  });
}

async function cadenceOnlyGroundedQueryResolver(_contract: HeartbeatContract) {
  return async (_projectId: string, query: string): Promise<GroundedContextBundle> => ({
    query,
    chunkHits: [
      {
        score: 9,
        chunk: {
          id: 'chunk-1',
          documentId: 'doc-1',
          index: 0,
          fingerprint: 'chunk-1',
          text: 'Decision: valid dry-run observation may continue even when no governed task is currently eligible.',
          tokenEstimate: 14,
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 92 },
        },
      },
    ],
    semanticNodes: [
      {
        id: 'decision-1',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-1',
        nodeType: 'Decision',
        label: 'Valid dry-run observation may continue when no governed task is eligible.',
        summary: 'Valid dry-run observation may continue when no governed task is eligible.',
        fingerprint: 'decision-1',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 92 },
        attributes: {},
        state: 'active',
      },
    ],
    semanticEdges: [],
    cacheEntries: [],
    contradictions: [],
    missingInformation: [],
    recommendedNextActions: ['Continue observing cadence without forcing a task selection.'],
  });
}
