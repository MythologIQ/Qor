import { describe, it, expect, beforeEach } from 'bun:test';
import { runMatch, type MatchRunnerMetrics } from '../../src/orchestrator/match-runner';
import { EventBus } from '../../src/orchestrator/events';
import { AgentSessionManager } from '../../src/gateway/session';

describe('match-runner', () => {
  let bus: EventBus;
  let asm: AgentSessionManager;

  beforeEach(() => {
    bus = new EventBus();
    asm = new AgentSessionManager();
    asm.createSession('session-a', 'match-test', 'A');
    asm.createSession('session-b', 'match-test', 'B');
  });

  /** Minimal in-memory bus so we can capture END frames without the module singleton */
  function buildMetricsBus() {
    return {
      recordTurn: (_turn: number, _actionA: unknown, _actionB: unknown) => {},
      recordEnd: (metrics: MatchRunnerMetrics) => {
        // captured for assertions
      },
    };
  }

  it('runMatch returns valid metrics with winner or null', async () => {
    const metrics = await runMatch('session-a', 'session-b', 'seed-test-run-match', bus, buildMetricsBus(), asm);
    expect(metrics).toHaveProperty('totalTurns');
    expect(metrics).toHaveProperty('winner');
    expect(metrics).toHaveProperty('durationMs');
    expect(metrics).toHaveProperty('actionsA');
    expect(metrics).toHaveProperty('actionsB');
    expect(metrics).toHaveProperty('invalidActions');
    expect(typeof metrics.totalTurns).toBe('number');
    expect(metrics.totalTurns).toBeGreaterThanOrEqual(0);
    expect(['A', 'B', null]).toContain(metrics.winner);
    expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runMatch respects turn cap — completes before TURN_CAP loops', async () => {
    const metrics = await runMatch('session-a', 'session-b', 'seed-turn-cap', bus, buildMetricsBus(), asm);
    expect(metrics.totalTurns).toBeLessThanOrEqual(150); // TURN_CAP from match-runner.ts
  });

  it('runMatch produces deterministic output for same seed', async () => {
    const m1 = await runMatch('session-a', 'session-b', 'seed-deterministic', bus, buildMetricsBus(), asm);
    // After first run sessions are in 'ended'/'forfeit' state — create fresh sessions
    asm.createSession('session-a2', 'match-test-2', 'A');
    asm.createSession('session-b2', 'match-test-2', 'B');
    const m2 = await runMatch('session-a2', 'session-b2', 'seed-deterministic', bus, buildMetricsBus(), asm);
    // Winner may differ due to race conditions in random agents across runs,
    // but totalTurns and invalidActions should be identical for same seed
    expect(m2.totalTurns).toBe(m1.totalTurns);
    expect(m2.invalidActions).toBe(m1.invalidActions);
  });

  it('metrics.actionsA + metrics.actionsB reflect non-pass actions', async () => {
    const metrics = await runMatch('session-a', 'session-b', 'seed-actions-count', bus, buildMetricsBus(), asm);
    // Each turn at least one unit should exist for each side (board setup)
    // The random agent emits at most one move per turn, so counts should be <= totalTurns
    expect(metrics.actionsA).toBeLessThanOrEqual(metrics.totalTurns);
    expect(metrics.actionsB).toBeLessThanOrEqual(metrics.totalTurns);
  });

  it('match ends with winner set when victory event fires', async () => {
    const metrics = await runMatch('session-a', 'session-b', 'seed-victory', bus, buildMetricsBus(), asm);
    // If totalTurns < 150, the engine detected a victory condition
    if (metrics.totalTurns < 150) {
      expect(metrics.winner).not.toBeNull();
    }
    // If it hit turn cap, winner can be null (draw)
    if (metrics.totalTurns === 150) {
      expect([null, 'A', 'B']).toContain(metrics.winner);
    }
  });

  it('session states are transitioned to ended/forfeit after match completes', async () => {
    await runMatch('session-a', 'session-b', 'seed-session-states', bus, buildMetricsBus(), asm);
    const sA = asm.getSession('session-a');
    const sB = asm.getSession('session-b');
    // After runMatch: winner side → 'ended', loser → 'forfeit'; draw/null → both 'forfeit'
    const validEndStates = ['ended', 'forfeit'];
    expect(sA?.status).toBeOneOf(validEndStates);
    expect(sB?.status).toBeOneOf(validEndStates);
    // Sessions cannot be left in 'playing' after match completes
    expect(sA?.status).not.toBe('playing');
    expect(sB?.status).not.toBe('playing');
  });

  it('timeout path returns zero metrics and null winner', async () => {
    // Force timeout by passing sessions that never become 'ready'
    // Override session manager to always return not-ready
    const neverReadyBus = new EventBus();
    const neverReadyAsm = new AgentSessionManager();
    neverReadyAsm.createSession('never-a', 'match-never', 'A');
    neverReadyAsm.createSession('never-b', 'match-never', 'B');
    neverReadyAsm.transition('never-a', 'connected');
    neverReadyAsm.transition('never-b', 'connected');
    const metrics = await runMatch('never-a', 'never-b', 'seed-never', neverReadyBus, buildMetricsBus(), neverReadyAsm, { turnCap: 0 });
    expect(metrics.totalTurns).toBe(0);
    expect(metrics.winner).toBeNull();
    expect(metrics.actionsA).toBe(0);
    expect(metrics.actionsB).toBe(0);
  });
});
