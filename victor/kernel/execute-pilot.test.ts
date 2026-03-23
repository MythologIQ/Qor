import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { HeartbeatContract } from './heartbeat';
import type { GroundedContextBundle } from './memory/types';
import {
  createPilotConfig,
  initializePilot,
  runExecutePilot,
  loadPilotState,
  loadPacket,
  listPilotRuns,
  setKillSwitch,
  checkBounds,
  formatPilotResult,
  type PilotConfig,
  type PilotMode,
  type PilotGroundedQueryResolver,
} from './execute-pilot';

// Mock grounded query resolver for testing
const createMockGroundedQueryResolver = (): PilotGroundedQueryResolver => {
  return async (_contract: HeartbeatContract) => {
    return async (_projectId: string, _query: string): Promise<GroundedContextBundle> => {
      return {
        query: _query,
        chunkHits: [],
        semanticNodes: [],
        semanticEdges: [],
        cacheEntries: [],
        contradictions: [],
        recommendedNextActions: [],
        missingInformation: [],
      };
    };
  };
};

describe('execute-pilot', () => {
  let tempDir: string;
  let mockResolver: PilotGroundedQueryResolver;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'victor-pilot-test-'));
    mockResolver = createMockGroundedQueryResolver();
  });

  afterEach(async () => {
    if (tempDir && existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('createPilotConfig', () => {
    it('creates default config with required fields', () => {
      const config = createPilotConfig({
        projectId: 'test-project',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
      });

      expect(config.projectId).toBe('test-project');
      expect(config.mode).toBe('dry-run');
      expect(config.actorId).toBe('victor-execute-pilot');
      expect(config.cadenceMs).toBe(30 * 60 * 1000); // 30 minutes
      expect(config.reasoningModel).toBe('Kimi K2.5');
      expect(config.bounds.maxRuntimeMs).toBe(30 * 60 * 1000);
      expect(config.bounds.maxTicks).toBe(6);
      expect(config.bounds.maxActionsPerTick).toBe(1);
      expect(config.bounds.maxConsecutiveBlocked).toBe(2);
      expect(config.bounds.maxConsecutiveFailures).toBe(2);
    });

    it('allows overriding defaults', () => {
      const config = createPilotConfig({
        projectId: 'custom-project',
        mode: 'execute' as PilotMode,
        stateDir: tempDir,
        actorId: 'custom-actor',
        cadenceMs: 15 * 60 * 1000,
        bounds: {
          maxRuntimeMs: 60 * 60 * 1000,
          maxTicks: 10,
          maxActionsPerTick: 2,
          maxConsecutiveBlocked: 3,
          maxConsecutiveFailures: 3,
        },
      });

      expect(config.projectId).toBe('custom-project');
      expect(config.mode).toBe('execute');
      expect(config.actorId).toBe('custom-actor');
      expect(config.cadenceMs).toBe(15 * 60 * 1000);
      expect(config.bounds.maxRuntimeMs).toBe(60 * 60 * 1000);
      expect(config.bounds.maxTicks).toBe(10);
      expect(config.bounds.maxActionsPerTick).toBe(2);
    });

    it('uses environment variable for stateDir if provided', () => {
      const originalEnv = process.env.VICTOR_EXECUTE_PILOT_STATE_DIR;
      process.env.VICTOR_EXECUTE_PILOT_STATE_DIR = tempDir;

      const config = createPilotConfig({
        projectId: 'env-test',
        mode: 'dry-run' as PilotMode,
      });

      expect(config.stateDir).toBe(tempDir);

      process.env.VICTOR_EXECUTE_PILOT_STATE_DIR = originalEnv;
    });
  });

  describe('initializePilot', () => {
    it('creates initial pilot state', async () => {
      const config = createPilotConfig({
        projectId: 'init-test',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
      });

      const state = await initializePilot(config);

      expect(state.runId).toMatch(/^pilot_\d+_[a-z0-9]+$/);
      expect(state.config).toEqual(config);
      expect(state.status).toBe('initialized');
      expect(state.tickCount).toBe(0);
      expect(state.ticks).toEqual([]);
      expect(state.packet.version).toBe('1.0.0');
      expect(state.packet.config).toEqual(config);
      expect(state.packet.status).toBe('initialized');
      expect(state.packet.totalTicks).toBe(0);
      expect(state.packet.totalActionsExecuted).toBe(0);
      expect(state.packet.totalActionsBlocked).toBe(0);
      expect(state.packet.ticks).toEqual([]);
    });

    it('writes state file to disk', async () => {
      const config = createPilotConfig({
        projectId: 'file-test',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
      });

      const state = await initializePilot(config);
      const loadedState = await loadPilotState(tempDir, state.runId);

      expect(loadedState).not.toBeNull();
      expect(loadedState?.runId).toBe(state.runId);
      expect(loadedState?.status).toBe('initialized');
    });

    it('writes packet file to disk', async () => {
      const config = createPilotConfig({
        projectId: 'packet-test',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
      });

      const state = await initializePilot(config);
      const loadedPacket = await loadPacket(tempDir, state.runId);

      expect(loadedPacket).not.toBeNull();
      expect(loadedPacket?.version).toBe('1.0.0');
      expect(loadedPacket?.config.projectId).toBe('packet-test');
    });
  });

  describe('setKillSwitch', () => {
    it('creates kill switch file', async () => {
      await setKillSwitch(tempDir);

      const killSwitchPath = join(tempDir, 'KILL');
      expect(existsSync(killSwitchPath)).toBe(true);

      const content = await readFile(killSwitchPath, 'utf8');
      expect(content).toBe('KILL');
    });
  });

  describe('checkBounds', () => {
    it('returns shouldStop=false when within bounds', async () => {
      const config = createPilotConfig({
        projectId: 'bounds-test',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
        bounds: {
          maxRuntimeMs: 60 * 60 * 1000, // 1 hour
          maxTicks: 10,
          maxActionsPerTick: 1,
          maxConsecutiveBlocked: 2,
          maxConsecutiveFailures: 2,
        },
      });

      const state = await initializePilot(config);

      const check = checkBounds(state);
      expect(check.shouldStop).toBe(false);
      expect(check.reason).toBeNull();
    });

    it('detects kill switch', async () => {
      const config = createPilotConfig({
        projectId: 'kill-test',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
      });

      const state = await initializePilot(config);
      await setKillSwitch(tempDir);

      const check = checkBounds(state);
      expect(check.shouldStop).toBe(true);
      expect(check.reason).toBe('Kill switch activated');
    });

    it('detects tick limit exceeded', async () => {
      const config = createPilotConfig({
        projectId: 'tick-limit-test',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
        bounds: {
          maxRuntimeMs: 60 * 60 * 1000,
          maxTicks: 2,
          maxActionsPerTick: 1,
          maxConsecutiveBlocked: 2,
          maxConsecutiveFailures: 2,
        },
      });

      const state = await initializePilot(config);
      state.tickCount = 2; // At limit

      const check = checkBounds(state);
      expect(check.shouldStop).toBe(true);
      expect(check.reason).toBe('Maximum tick count reached');
    });

    it('detects runtime limit exceeded', async () => {
      const config = createPilotConfig({
        projectId: 'runtime-test',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
        bounds: {
          maxRuntimeMs: 1, // 1ms - will definitely be exceeded
          maxTicks: 100,
          maxActionsPerTick: 1,
          maxConsecutiveBlocked: 2,
          maxConsecutiveFailures: 2,
        },
      });

      const state = await initializePilot(config);
      // Wait a bit to ensure we're over the 1ms limit
      await new Promise(resolve => setTimeout(resolve, 10));

      const check = checkBounds(state);
      expect(check.shouldStop).toBe(true);
      expect(check.reason).toBe('Maximum runtime exceeded');
    });
  });

  describe('loadPilotState', () => {
    it('returns null for non-existent state', async () => {
      const state = await loadPilotState(tempDir, 'non-existent');
      expect(state).toBeNull();
    });

    it('loads existing state', async () => {
      const config = createPilotConfig({
        projectId: 'load-test',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
      });

      const state = await initializePilot(config);
      const loaded = await loadPilotState(tempDir, state.runId);

      expect(loaded).not.toBeNull();
      expect(loaded?.runId).toBe(state.runId);
      expect(loaded?.config.projectId).toBe('load-test');
    });
  });

  describe('loadPacket', () => {
    it('returns null for non-existent packet', async () => {
      const packet = await loadPacket(tempDir, 'non-existent');
      expect(packet).toBeNull();
    });

    it('loads existing packet', async () => {
      const config = createPilotConfig({
        projectId: 'packet-load-test',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
      });

      const state = await initializePilot(config);
      const loaded = await loadPacket(tempDir, state.runId);

      expect(loaded).not.toBeNull();
      expect(loaded?.version).toBe('1.0.0');
      expect(loaded?.config.projectId).toBe('packet-load-test');
    });
  });

  describe('listPilotRuns', () => {
    it('returns empty array when no runs exist', async () => {
      const runs = await listPilotRuns(tempDir);
      expect(runs).toEqual([]);
    });

    it('lists all pilot runs sorted by start time', async () => {
      const config1 = createPilotConfig({
        projectId: 'list-test-1',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
      });

      const config2 = createPilotConfig({
        projectId: 'list-test-2',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
      });

      const state1 = await initializePilot(config1);
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
      const state2 = await initializePilot(config2);

      const runs = await listPilotRuns(tempDir);

      expect(runs).toHaveLength(2);
      // Should be sorted newest first
      expect(runs[0].runId).toBe(state2.runId);
      expect(runs[1].runId).toBe(state1.runId);
    });
  });

  describe('formatPilotResult', () => {
    it('formats pilot result as readable string', () => {
      const result = {
        status: 'completed' as const,
        packet: {
          version: '1.0.0',
          config: {
            projectId: 'format-test',
            mode: 'dry-run' as PilotMode,
            stateDir: tempDir,
            actorId: 'test-actor',
            cadenceMs: 30 * 60 * 1000,
            reasoningModel: 'Kimi K2.5',
            bounds: {
              maxRuntimeMs: 30 * 60 * 1000,
              maxTicks: 6,
              maxActionsPerTick: 1,
              maxConsecutiveBlocked: 2,
              maxConsecutiveFailures: 2,
            },
          },
          status: 'completed' as const,
          startedAt: '2026-03-18T09:00:00.000Z',
          completedAt: '2026-03-18T09:30:00.000Z',
          terminationReason: 'Maximum tick count reached',
          totalTicks: 6,
          totalActionsExecuted: 3,
          totalActionsBlocked: 0,
          ticks: [
            {
              tickNumber: 1,
              startedAt: '2026-03-18T09:00:00.000Z',
              completedAt: '2026-03-18T09:05:00.000Z',
              status: 'completed' as const,
              automationRunId: 'run_1',
              selectedTaskId: 'task_1',
              selectedTaskTitle: 'Test Task',
              actionsExecuted: 1,
              actionsBlocked: 0,
              reason: 'Task completed',
              heartbeatStopped: false,
            },
          ],
          finalState: {
            consecutiveBlocked: 0,
            consecutiveFailures: 0,
            lastTickStatus: 'completed',
            lastError: null,
          },
        },
        stateFile: '/tmp/test-pilot/pilot_123.json',
      };

      const formatted = formatPilotResult(result);

      expect(formatted).toContain('Execute Pilot Result: COMPLETED');
      expect(formatted).toContain('pilot_123');
      expect(formatted).toContain('Ticks: 6');
      expect(formatted).toContain('Actions Executed: 3');
      expect(formatted).toContain('Tick 1: completed');
    });
  });

  describe('runExecutePilot', () => {
    it('runs pilot and returns result', async () => {
      // This test runs the actual pilot - it may be slow and require valid project state
      // For unit testing, we'll use a short runtime to keep tests fast
      const config = createPilotConfig({
        projectId: 'victor-resident',
        mode: 'dry-run' as PilotMode,
        stateDir: tempDir,
        cadenceMs: 100, // 100ms for fast testing
        bounds: {
          maxRuntimeMs: 1000, // 1 second max
          maxTicks: 2, // Just 2 ticks
          maxActionsPerTick: 1,
          maxConsecutiveBlocked: 2,
          maxConsecutiveFailures: 2,
        },
      });

      const result = await runExecutePilot(config, mockResolver);

      // Should complete or timeout within the bounds
      expect(['completed', 'timeout', 'blocked', 'failed']).toContain(
        result.status,
      );
      expect(result.packet).toBeDefined();
      expect(result.packet.version).toBe('1.0.0');
      expect(result.packet.config.projectId).toBe('victor-resident');
      expect(result.packet.startedAt).toBeDefined();
      expect(result.stateFile).toContain('pilot_');

      // Verify state file was written
      const state = await loadPilotState(tempDir, result.stateFile.split('/').pop()?.replace('.json', '') || '');
      expect(state).not.toBeNull();
    }, 30000); // 30 second timeout for integration test
  });
});
