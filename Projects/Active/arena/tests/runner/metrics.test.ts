import { describe, it, expect, beforeEach } from 'bun:test';
import { RunnerMetrics } from '../../src/runner/metrics';

describe('RunnerMetrics', () => {
  let metrics: RunnerMetrics;

  beforeEach(() => {
    metrics = new RunnerMetrics();
  });

  it('counters start at 0', () => {
    const snap = metrics.snapshot();
    expect(snap.matchesRun).toBe(0);
    expect(snap.matchesTimedOut).toBe(0);
    expect(snap.matchesForfeit).toBe(0);
  });

  it('each inc increments the correct counter', () => {
    metrics.incRun();
    expect(metrics.snapshot().matchesRun).toBe(1);
    metrics.incRun();
    expect(metrics.snapshot().matchesRun).toBe(2);

    metrics.incTimedOut();
    expect(metrics.snapshot().matchesTimedOut).toBe(1);

    metrics.incForfeit();
    expect(metrics.snapshot().matchesForfeit).toBe(1);
  });

  it('snapshot returns totals for all counters', () => {
    metrics.incRun();
    metrics.incRun();
    metrics.incRun();
    metrics.incTimedOut();
    metrics.incTimedOut();
    metrics.incForfeit();

    const snap = metrics.snapshot();
    expect(snap.matchesRun).toBe(3);
    expect(snap.matchesTimedOut).toBe(2);
    expect(snap.matchesForfeit).toBe(1);
  });
});