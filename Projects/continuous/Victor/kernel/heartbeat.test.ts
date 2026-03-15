import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { createProjectStore } from '../../Zo-Qore/runtime/planning';
import {
  getHeartbeatStatus,
  runHeartbeatPreflight,
  startHeartbeat,
  stopHeartbeat,
  tickHeartbeat,
  type HeartbeatContract,
  type HeartbeatRequest,
} from './heartbeat';
import type { GroundedContextBundle } from './memory/types';

describe('heartbeat foundation', () => {
  let projectsDir: string;
  let stateDir: string;

  beforeEach(async () => {
    projectsDir = await mkdtemp(join(tmpdir(), 'victor-heartbeat-projects-'));
    stateDir = await mkdtemp(join(tmpdir(), 'victor-heartbeat-state-'));

    const projectStore = createProjectStore('builder-console', projectsDir, { enableLedger: true });
    await projectStore.create({
      name: 'Builder Console',
      description: 'Heartbeat fixture',
      createdBy: 'tester',
    });
    const voidStore = await projectStore.getVoidStore();
    await voidStore.addThought({
      thoughtId: 'thought-1',
      projectId: 'builder-console',
      content: 'Heartbeat reflection anchor.',
      source: 'text',
      capturedAt: new Date().toISOString(),
      capturedBy: 'tester',
      tags: ['heartbeat'],
      status: 'raw',
    }, 'tester');

    const revealStore = await projectStore.getViewStore('reveal');
    await revealStore.write({
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
          name: 'Governed Automation',
          objective: 'Advance governed automation safely.',
          sourceClusterIds: ['cluster-1'],
          tasks: [
            {
              taskId: 'task-1',
              phaseId: 'phase-1',
              title: 'Automate comms-tab prompt construction',
              description: 'Make the prompt pipeline governed and visible.',
              acceptance: ['Prompt build remains governed.'],
              status: 'pending',
            },
            {
              taskId: 'task-active',
              phaseId: 'phase-1',
              title: 'Build backend prompt-construction pipeline',
              description: 'Active governed execution thread.',
              acceptance: ['Pipeline remains governed.'],
              status: 'in-progress',
            },
            {
              taskId: 'task-2',
              phaseId: 'phase-1',
              title: 'Update decorative spacing',
              description: 'Cosmetic only.',
              acceptance: ['Looks better.'],
              status: 'pending',
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

  it('passes heartbeat preflight against governed automation fixtures', async () => {
    const result = await runHeartbeatPreflight(request(projectsDir, stateDir), groundedQueryResolver);

    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
    expect(result.checks.find((check) => check.name === 'grounded-query')?.detail).toContain('semantic nodes');
    expect(result.contract.reasoningModel).toBe('Kimi K2.5');
    expect(result.contract.baselineCadenceMs).toBe(30 * 60 * 1000);
  });

  it('acquires a single heartbeat lease and blocks a second start', async () => {
    const first = await startHeartbeat(request(projectsDir, stateDir), groundedQueryResolver);
    const second = await startHeartbeat(request(projectsDir, stateDir), groundedQueryResolver);

    expect(first.status).toBe('started');
    expect(first.state?.status).toBe('active');
    expect(second.status).toBe('blocked');
    expect(second.reason).toContain('already active');
  });

  it('runs a dry-run heartbeat tick and updates state', async () => {
    const started = await startHeartbeat(request(projectsDir, stateDir), groundedQueryResolver);
    expect(started.status).toBe('started');

    const tick = await tickHeartbeat(request(projectsDir, stateDir), groundedQueryResolver);
    const status = await getHeartbeatStatus(request(projectsDir, stateDir));

    expect(tick.status).toBe('completed');
    expect(tick.automation?.mode).toBe('dry-run');
    expect(tick.state.tickCount).toBe(1);
    expect(tick.state.lastSelectedTaskId).toBe('task-1');
    expect(status?.status).toBe('active');
    expect(status?.lastTickStatus).toBe('completed');
  });

  it('self-starts a narrow-execution focus window at elevated cadence', async () => {
    const started = await startHeartbeat(
      request(projectsDir, stateDir, {
        workClass: 'narrow-execution',
        focusWindowMode: 'auto',
      }),
      groundedQueryResolver,
    );

    expect(started.status).toBe('started');
    expect(started.state?.cadenceMode).toBe('elevated');
    expect(started.state?.cadenceMs).toBe(15 * 60 * 1000);
    expect(started.state?.focusWindow.status).toBe('active');
    expect(started.state?.focusWindow.source).toBe('self-started');
  });

  it('allows a supervised manual 5m cadence override when explicitly authorized', async () => {
    const started = await startHeartbeat(
      request(projectsDir, stateDir, {
        dryRun: false,
        workClass: 'narrow-execution',
        focusWindowMode: 'manual',
        supervisedCadenceOverrideMs: 5 * 60 * 1000,
        supervisedCadenceOverrideReason: 'Temporary supervised 5m heartbeat test.',
      }),
      groundedQueryResolver,
    );

    expect(started.status).toBe('started');
    expect(started.state?.cadenceMode).toBe('elevated');
    expect(started.state?.cadenceMs).toBe(5 * 60 * 1000);
  });

  it('rejects a supervised cadence override without explicit reason', async () => {
    await expect(() =>
      startHeartbeat(
        request(projectsDir, stateDir, {
          dryRun: false,
          workClass: 'narrow-execution',
          focusWindowMode: 'manual',
          supervisedCadenceOverrideMs: 5 * 60 * 1000,
        }),
        groundedQueryResolver,
      ),
    ).toThrow('requires an explicit reason');
  });

  it('passes preflight for reflective heartbeat work when governed tasks are already in progress', async () => {
    const statePath = join(projectsDir, 'builder-console', 'path', 'phases.json');
    const raw = JSON.parse(await readFile(statePath, 'utf8'));
    raw.phases[0].tasks = raw.phases[0].tasks.map((task: Record<string, unknown>) => ({
      ...task,
      status: task.taskId === 'task-1' ? 'in-progress' : 'done',
    }));
    await writeFile(statePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');

    const result = await runHeartbeatPreflight(
      request(projectsDir, stateDir, {
        workClass: 'narrow-execution',
        focusWindowMode: 'auto',
      }),
      groundedQueryResolver,
    );

    expect(result.ok).toBe(true);
    expect(result.checks.find((check) => check.name === 'governance')?.detail).toContain('reflective heartbeat review');
  });

  it('forces cooldown after four hours of elevated execution and switches to reflective dry-run ticks', async () => {
    const started = await startHeartbeat(
      request(projectsDir, stateDir, {
        dryRun: false,
        workClass: 'narrow-execution',
        focusWindowMode: 'manual',
      }),
      groundedQueryResolver,
    );
    expect(started.status).toBe('started');

    const statePath = join(stateDir, 'builder-console.json');
    const raw = JSON.parse(await readFile(statePath, 'utf8'));
    raw.focusWindow.status = 'active';
    raw.focusWindow.elevatedUntil = new Date(Date.now() - 60_000).toISOString();
    raw.cadenceMode = 'elevated';
    await writeFile(statePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');

    const tick = await tickHeartbeat(
      request(projectsDir, stateDir, {
        dryRun: false,
        workClass: 'narrow-execution',
        focusWindowMode: 'manual',
      }),
      groundedQueryResolver,
    );

    expect(tick.status).toBe('completed');
    expect(tick.automation?.mode).toBe('dry-run');
    expect(tick.state.cadenceMode).toBe('cooldown');
    expect(tick.state.cadenceMs).toBe(30 * 60 * 1000);
    expect(tick.state.focusWindow.status).toBe('cooldown');
    expect(tick.state.focusWindow.cooldownCyclesRemaining).toBe(1);
    expect(tick.reflectiveNote?.status).toBe('updated');
    expect(tick.reflectiveNote?.clusterId).toBe('cluster-1');

    const revealPath = join(projectsDir, 'builder-console', 'reveal', 'clusters.json');
    const reveal = JSON.parse(await readFile(revealPath, 'utf8'));
    expect(reveal.clusters[0].notes).toContain('Victor Cooldown Reflection');
    expect(reveal.clusters[0].notes).toContain('Automate comms-tab prompt construction');
  });

  it('stops the heartbeat cleanly', async () => {
    const started = await startHeartbeat(request(projectsDir, stateDir), groundedQueryResolver);
    expect(started.status).toBe('started');

    const stopped = await stopHeartbeat(request(projectsDir, stateDir), 'Operator requested stop.');

    expect(stopped.status).toBe('stopped');
    expect(stopped.state?.status).toBe('stopped');
    expect(stopped.reason).toContain('Operator requested stop');
  });
});

function request(
  projectsDir: string,
  stateDir: string,
  overrides: Partial<HeartbeatRequest> = {},
) {
  return {
    ...baseRequest(projectsDir, stateDir),
    ...overrides,
  };
}

function baseRequest(projectsDir: string, stateDir: string) {
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
  };
}

async function groundedQueryResolver(_contract: HeartbeatContract) {
  return async (_projectId: string, query: string): Promise<GroundedContextBundle> => groundedContext(query);
}

function groundedContext(query: string): GroundedContextBundle {
  return {
    query,
    chunkHits: [
      {
        score: 7,
        chunk: {
          id: 'chunk-1',
          documentId: 'doc-1',
          index: 0,
          fingerprint: 'chunk-1',
          text: 'Decision: Builder Console governance is binding on Victor during governed automation.',
          tokenEstimate: 14,
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
        label: 'Builder Console governance is binding on Victor.',
        summary: 'Builder Console governance is binding on Victor.',
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
