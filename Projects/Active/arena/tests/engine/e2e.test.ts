// e2e.test.ts — task-072-smoke-e2e
// End-to-end smoke: RandomAgent vs GreedyAgent full match

import { describe, it, expect, beforeEach } from 'bun:test';
import { RandomAgent } from '../../src/agents/random';
import { GreedyAgent } from '../../src/agents/greedy';
import { runMatch, type MatchRunnerMetrics } from '../../src/orchestrator/match-runner';
import { EventBus } from '../../src/orchestrator/events';
import { AgentSessionManager } from '../../src/gateway/session';
import type { RoundPlan } from '../../src/shared/types';

describe('e2e — RandomAgent vs GreedyAgent', () => {
  let bus: EventBus;
  let asm: AgentSessionManager;

  beforeEach(() => {
    bus = new EventBus();
    asm = new AgentSessionManager();
    asm.createSession('session-a', 'e2e-smoke', 'A');
    asm.createSession('session-b', 'e2e-smoke', 'B');
  });

  function buildMetricsBus() {
    return {
      recordRound: (_round: number, _planA: RoundPlan, _planB: RoundPlan) => {},
      recordEnd: (_metrics: MatchRunnerMetrics) => {},
    };
  }

  it('full match completes within 60s with sane metrics', async () => {
    const start = Date.now();

    const metrics = await runMatch(
      'session-a',
      'session-b',
      'e2e-seed-smoke',
      bus,
      buildMetricsBus(),
      asm,
    );

    const elapsed = Date.now() - start;

    // Must complete within 60 seconds
    expect(elapsed).toBeLessThan(60_000);

    // Match must have progressed at least 1 turn
    expect(metrics.totalTurns).toBeGreaterThan(0);

    // Winner must be A, B, or null (draw) — no undefined
    expect(['A', 'B', null]).toContain(metrics.winner);

    // Duration and counts must be non-negative
    expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.actionsA).toBeGreaterThanOrEqual(0);
    expect(metrics.actionsB).toBeGreaterThanOrEqual(0);
    expect(metrics.invalidActions).toBeGreaterThanOrEqual(0);

    // Actions cannot exceed turns
    expect(metrics.actionsA).toBeLessThanOrEqual(metrics.totalTurns);
    expect(metrics.actionsB).toBeLessThanOrEqual(metrics.totalTurns);

    // Winner may be null if the match hits round cap with no decisive outcome.
    expect([null, 'A', 'B']).toContain(metrics.winner);

    // Match hash: log for traceability
    const matchHash = `${metrics.winner ?? 'draw'}-${metrics.totalTurns}t-${metrics.durationMs}ms`;
    console.log(`[e2e] match hash: ${matchHash}`);
  });

  it('deterministic seed produces consistent totalTurns across runs', async () => {
    // Fresh sessions for repeatability
    asm.createSession('session-a2', 'e2e-det', 'A');
    asm.createSession('session-b2', 'e2e-det', 'B');

    const m1 = await runMatch('session-a', 'session-b', 'e2e-det-seed', bus, buildMetricsBus(), asm);

    asm.createSession('session-a3', 'e2e-det-2', 'A');
    asm.createSession('session-b3', 'e2e-det-2', 'B');

    const m2 = await runMatch('session-a3', 'session-b3', 'e2e-det-seed', bus, buildMetricsBus(), asm);

    // Same seed + same session state → same total turns
    expect(m2.totalTurns).toBe(m1.totalTurns);
    // Invalid actions should also be deterministic
    expect(m2.invalidActions).toBe(m1.invalidActions);
  });
});
