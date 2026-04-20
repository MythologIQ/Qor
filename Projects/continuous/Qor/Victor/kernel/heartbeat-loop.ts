import { existsSync } from 'node:fs';

import type {
  HeartbeatGroundedQueryResolver,
  HeartbeatRequest,
  HeartbeatStartResult,
  HeartbeatState,
  HeartbeatStopResult,
  HeartbeatTickResult,
} from './heartbeat';
import {
  getHeartbeatStatus,
  startHeartbeat,
  stopHeartbeat,
  tickHeartbeat,
} from './heartbeat';

export interface HeartbeatLoopRequest extends HeartbeatRequest {
  autoStart?: boolean;
  maxTicks?: number;
  maxRuntimeMs?: number;
  sleepMsOverride?: number;
  stopFile?: string;
}

export interface HeartbeatLoopResult {
  status: 'completed' | 'blocked' | 'stopped' | 'error';
  started: boolean;
  start?: HeartbeatStartResult;
  stop?: HeartbeatStopResult;
  ticks: HeartbeatTickResult[];
  reason: string;
}

interface HeartbeatLoopDependencies {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  fileExists: (path: string) => boolean;
  startHeartbeat: typeof startHeartbeat;
  tickHeartbeat: typeof tickHeartbeat;
  getHeartbeatStatus: typeof getHeartbeatStatus;
  stopHeartbeat: typeof stopHeartbeat;
}

const defaultDependencies: HeartbeatLoopDependencies = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  fileExists: (path) => existsSync(path),
  startHeartbeat,
  tickHeartbeat,
  getHeartbeatStatus,
  stopHeartbeat,
};

export async function runHeartbeatLoop(
  request: HeartbeatLoopRequest,
  resolveGroundedQuery: HeartbeatGroundedQueryResolver,
  dependencies: Partial<HeartbeatLoopDependencies> = {},
): Promise<HeartbeatLoopResult> {
  const deps = { ...defaultDependencies, ...dependencies };
  const ticks: HeartbeatTickResult[] = [];
  const startedAt = deps.now();
  let started = false;
  let startResult: HeartbeatStartResult | undefined;

  if (request.autoStart !== false) {
    startResult = await deps.startHeartbeat(request, resolveGroundedQuery);
    if (startResult.status === 'blocked') {
      return {
        status: 'blocked',
        started: false,
        start: startResult,
        ticks,
        reason: startResult.reason || 'Heartbeat loop could not start.',
      };
    }
    started = true;
  }

  while (true) {
    if (request.stopFile?.trim() && deps.fileExists(request.stopFile)) {
      const stop = await deps.stopHeartbeat(request, `Heartbeat stop file detected at ${request.stopFile}.`);
      return {
        status: 'stopped',
        started,
        start: startResult,
        stop,
        ticks,
        reason: stop.reason,
      };
    }

    if (request.maxRuntimeMs && deps.now() - startedAt >= request.maxRuntimeMs) {
      const stop = await deps.stopHeartbeat(request, `Heartbeat loop reached max runtime ${request.maxRuntimeMs}ms.`);
      return {
        status: 'completed',
        started,
        start: startResult,
        stop,
        ticks,
        reason: stop.reason,
      };
    }

    const state = await deps.getHeartbeatStatus(request);
    if (!state || state.status !== 'active') {
      return {
        status: 'stopped',
        started,
        start: startResult,
        ticks,
        reason: state ? `Heartbeat is ${state.status}.` : 'Heartbeat state is unavailable.',
      };
    }

    const tick = await deps.tickHeartbeat(request, resolveGroundedQuery);
    ticks.push(tick);

    if (tick.status === 'error') {
      return {
        status: tick.heartbeatStopped ? 'stopped' : 'error',
        started,
        start: startResult,
        ticks,
        reason: tick.reason,
      };
    }

    if (tick.heartbeatStopped) {
      return {
        status: 'stopped',
        started,
        start: startResult,
        ticks,
        reason: tick.reason,
      };
    }

    if (request.maxTicks && ticks.length >= request.maxTicks) {
      const stop = await deps.stopHeartbeat(request, `Heartbeat loop reached configured tick budget ${request.maxTicks}.`);
      return {
        status: 'completed',
        started,
        start: startResult,
        stop,
        ticks,
        reason: stop.reason,
      };
    }

    await deps.sleep(resolveNextSleepMs(request, tick.state));
  }
}

function resolveNextSleepMs(request: HeartbeatLoopRequest, state: HeartbeatState): number {
  if (typeof request.sleepMsOverride === 'number' && request.sleepMsOverride >= 0) {
    return request.sleepMsOverride;
  }
  return state.cadenceMs;
}
