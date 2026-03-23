import { describe, expect, it } from 'bun:test';

import type {
  HeartbeatGroundedQueryResolver,
  HeartbeatStartResult,
  HeartbeatState,
  HeartbeatStopResult,
  HeartbeatTickResult,
} from './heartbeat';
import { runHeartbeatLoop } from './heartbeat-loop';

const noopResolver: HeartbeatGroundedQueryResolver = async () => async () => ({
  query: '',
  chunkHits: [],
  semanticNodes: [],
  semanticEdges: [],
  cacheEntries: [],
  contradictions: [],
  recommendedNextActions: [],
  missingInformation: [],
});

describe('runHeartbeatLoop', () => {
  it('starts, ticks, and stops cleanly at the configured tick budget', async () => {
    const events: string[] = [];
    let status: HeartbeatState | null = activeState();

    const result = await runHeartbeatLoop(
      {
        projectId: 'builder-console',
        maxTicks: 2,
        sleepMsOverride: 0,
      },
      noopResolver,
      {
        startHeartbeat: async () => {
          events.push('start');
          status = activeState();
          return startedResult(status);
        },
        getHeartbeatStatus: async () => status,
        tickHeartbeat: async () => {
          events.push('tick');
          status = activeState({ tickCount: (status?.tickCount ?? 0) + 1 });
          return completedTick(status);
        },
        stopHeartbeat: async (_request, reason) => {
          events.push('stop');
          status = stoppedState(reason || 'stopped');
          return stoppedResult(status);
        },
        sleep: async () => {
          events.push('sleep');
        },
      },
    );

    expect(result.status).toBe('completed');
    expect(result.started).toBe(true);
    expect(result.ticks).toHaveLength(2);
    expect(events).toEqual(['start', 'tick', 'sleep', 'tick', 'stop']);
  });

  it('honors the stop-file kill switch before the next tick', async () => {
    let stopFileExists = false;
    let status: HeartbeatState | null = activeState();

    const result = await runHeartbeatLoop(
      {
        projectId: 'builder-console',
        sleepMsOverride: 0,
        stopFile: '/tmp/victor-heartbeat.stop',
      },
      noopResolver,
      {
        startHeartbeat: async () => startedResult(status!),
        getHeartbeatStatus: async () => status,
        tickHeartbeat: async () => {
          stopFileExists = true;
          return completedTick(status!);
        },
        stopHeartbeat: async (_request, reason) => {
          status = stoppedState(reason || 'stop file');
          return stoppedResult(status);
        },
        fileExists: () => stopFileExists,
        sleep: async () => {},
      },
    );

    expect(result.status).toBe('stopped');
    expect(result.ticks).toHaveLength(1);
    expect(result.reason).toContain('stop file');
  });

  it('returns blocked when heartbeat start preflight fails', async () => {
    const result = await runHeartbeatLoop(
      {
        projectId: 'builder-console',
      },
      noopResolver,
      {
        startHeartbeat: async () => ({
          status: 'blocked',
          preflight: {
            ok: false,
            stateFile: '/tmp/builder-console.json',
            contract: {} as never,
            checks: [],
          },
          stateFile: '/tmp/builder-console.json',
          reason: 'preflight failed',
        }),
      },
    );

    expect(result.status).toBe('blocked');
    expect(result.started).toBe(false);
    expect(result.reason).toContain('preflight failed');
  });
});

function activeState(overrides: Partial<HeartbeatState> = {}): HeartbeatState {
  return {
    projectId: 'builder-console',
    runId: 'heartbeat-test',
    actorId: 'victor-heartbeat',
    mode: 'execute',
    reasoningModel: 'Kimi K2.5',
    baselineCadenceMs: 30 * 60 * 1000,
    status: 'active',
    workClass: 'coordination-review',
    cadenceMode: 'baseline',
    cadenceMs: 30 * 60 * 1000,
    staleAfterMs: 90 * 60 * 1000,
    maxActionsPerTick: 1,
    stopOnBlock: true,
    maxConsecutiveBlocked: 3,
    maxConsecutiveFailures: 2,
    stateFile: '/tmp/builder-console.json',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTickStartedAt: null,
    lastTickCompletedAt: null,
    tickCount: 0,
    consecutiveBlocked: 0,
    consecutiveFailures: 0,
    lastTickStatus: null,
    lastTickReason: null,
    lastError: null,
    lastAutomationRunId: null,
    lastSelectedTaskId: null,
    focusWindow: {
      status: 'inactive',
      source: null,
      reason: null,
      startedAt: null,
      elevatedUntil: null,
      cooldownCyclesRemaining: 0,
    },
    ...overrides,
  };
}

function startedResult(state: HeartbeatState): HeartbeatStartResult {
  return {
    status: 'started',
    preflight: {
      ok: true,
      stateFile: state.stateFile,
      contract: {} as never,
      checks: [],
    },
    stateFile: state.stateFile,
    state,
  };
}

function stoppedState(reason: string): HeartbeatState {
  return activeState({
    status: 'stopped',
    lastTickReason: reason,
  });
}

function stoppedResult(state: HeartbeatState): HeartbeatStopResult {
  return {
    status: 'stopped',
    state,
    reason: state.lastTickReason || 'stopped',
  };
}

function completedTick(state: HeartbeatState): HeartbeatTickResult {
  return {
    status: 'completed',
    state,
    heartbeatStopped: false,
    reason: 'tick completed',
  };
}
