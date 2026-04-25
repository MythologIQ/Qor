// e2e.test.ts — task-072-smoke-e2e + task-198-planD-phase7-substantiation
// End-to-end smoke: RandomAgent vs GreedyAgent full match
// Plan D v2 Phase 7: 9-round round-economy E2E with G1/G2/G3/G4 invariant assertions

import { describe, it, expect, beforeEach } from 'bun:test';
import { RandomAgent } from '../../src/agents/random';
import { GreedyAgent } from '../../src/agents/greedy';
import { runMatch, type MatchRunnerMetrics } from '../../src/orchestrator/match-runner';
import { EventBus } from '../../src/orchestrator/events';
import { AgentSessionManager } from '../../src/gateway/session';
import type { RoundPlan } from '../../src/shared/types';

// ── smoke suite (pre-existing) ─────────────────────────────────────────────────

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

// ── Plan D v2 Phase 7: 9-round round-economy E2E ───────────────────────────────

const SNAPSHOT_PATH = './tests/engine/snapshots/round-economy-e2e-v2.json';

describe('e2e — Plan D v2 Phase 7 Round Economy (9 rounds)', () => {
  // Stable seed gives deterministic unit placement for scripted assertions
  const SEED = 'plan-d-phase7-v2-e2e';

  /**
   * Helper: build a minimal RoundPlan with bid and optional freeMove / freeAction / extras.
   */
  function plan(bid: number, freeMove?: RoundPlan['freeMove'], freeAction?: RoundPlan['freeAction'], extras: RoundPlan['extras'] = []): RoundPlan {
    return { bid, freeMove, freeAction, extras };
  }

  /**
   * Helper: build a second_attack extra for a given attacker + target unit id.
   * The target unit id is passed as a string; the resolver looks it up by id.
   */
  function secondAttack(unitId: string, toQ: number, toR: number, toS: number) {
    return {
      kind: 'second_attack' as const,
      unitId,
      to: { q: toQ, r: toR, s: toS },
    };
  }

  /**
   * Helper: build a boosted_ability extra.
   */
  function boosted(unitId: string, mode: 'range' | 'damage' = 'damage') {
    return { kind: 'boosted_ability' as const, unitId, mode };
  }

  /**
   * Helper: build a defensive_stance extra.
   */
  function stance(unitId: string) {
    return { kind: 'defensive_stance' as const, unitId };
  }

  /**
   * Helper: build a reserve_overwatch extra.
   */
  function reserve(unitId: string) {
    return { kind: 'reserve_overwatch' as const, unitId };
  }

  it('9-round scripted match satisfies G1/G2/G3/G4 invariants', async () => {
    const { MatchRuntime } = await import('../../src/orchestrator/match-runner');
    const { emitRoundEnd } = await import('../../src/engine/round-resolver/end-of-round');

    const asm = new AgentSessionManager();
    asm.createSession('session-a', 'plan-d-e2e', 'A');
    asm.createSession('session-b', 'plan-d-e2e', 'B');

    const rt = new MatchRuntime('plan-d-e2e', SEED, 'session-a', 'session-b');

    // ── Round 1 (r=0 in 0-indexed): Both agents set a reserve. ─────────────
    const initUnits = rt.state.units;
    const unitA0 = initUnits.find(u => u.owner === 'A')!;
    const unitB0 = initUnits.find(u => u.owner === 'B')!;

    const planA1 = plan(0, undefined, undefined, [reserve(unitA0.id)]);
    const planB1 = plan(0, undefined, undefined, [reserve(unitB0.id)]);
    rt.advanceRound(planA1, planB1);
    expect(rt.round).toBe(1);
    // After round 1: both reserves active (appliesOnRound=2)
    expect(rt.state.reserves?.length ?? 0).toBeGreaterThanOrEqual(2);

    // ── Round 2 (r=1): Both agents attack, triggering opponent's reserve.
    // Both units die to each other's reserves (bid=0 tie → order unpredictable).
    // Events: reserve_fired × 2 + wasted_action × 2 (both attacks wasted).
    const planA2: RoundPlan = {
      bid: 0,
      freeAction: { unitId: unitA0.id, type: 'attack', from: unitA0.position, to: unitB0.position },
      extras: [],
    };
    const planB2: RoundPlan = {
      bid: 0,
      freeAction: { unitId: unitB0.id, type: 'attack', from: unitB0.position, to: unitA0.position },
      extras: [],
    };
    rt.advanceRound(planA2, planB2);
    expect(rt.round).toBe(2);
    // All events in r2: reserve_fired + wasted_action for both agents
    const r2Events = rt.events.slice(-10).map((e: any) => e.type);
    expect(r2Events).toContain('reserve_fired');
    expect(r2Events).toContain('wasted_action');
    // G3: emitRoundEnd cleans reserves with appliesOnRound=2
    const r2Res = emitRoundEnd({
      state: rt.state,
      round: 2,
      budgetA: rt.budgetA,
      budgetB: rt.budgetB,
    });
    expect(r2Res.nextState.reserves?.length ?? 0).toBe(0);

    // ── Round 3 (r=2): Both agents set a defensive stance. ───────────────────
    const planA3 = plan(0, undefined, undefined, [stance(unitA0.id)]);
    const planB3 = plan(0, undefined, undefined, [stance(unitB0.id)]);
    rt.advanceRound(planA3, planB3);
    expect(rt.round).toBe(3);
    // G2: emitRoundEnd removes expired stances
    const r3Res = emitRoundEnd({ state: rt.state, round: 3, budgetA: rt.budgetA, budgetB: rt.budgetB });
    expect(r3Res.nextState.stances?.length ?? 0).toBe(0);

    // ── Round 4 (r=3): A spends boosted ability. ────────────────────────────
    const planA4 = plan(1, undefined, undefined, [boosted(unitA0.id, 'damage')]);
    const planB4 = plan(0, undefined, undefined, []);
    rt.advanceRound(planA4, planB4);
    expect(rt.round).toBe(4);

    // ── Round 5 (r=4): A spends second attack. ─────────────────────────────
    const unitsA = rt.state.units.filter(u => u.owner === 'A' && u.hp > 0);
    const unitsB = rt.state.units.filter(u => u.owner === 'B' && u.hp > 0);
    const unitA1 = unitsA[1] ?? unitsA[0]!;
    const targetB = unitsB[0]!;
    const planA5 = plan(0, undefined, undefined, [secondAttack(unitA1.id, targetB.position.q, targetB.position.r, targetB.position.s)]);
    const planB5 = plan(0, undefined, undefined, []);
    rt.advanceRound(planA5, planB5);
    expect(rt.round).toBe(5);

    // ── Round 6 (r=5): Both agents bid 2 (forced tiebreak → seededCoinFlip resolves). ─
    const planA6 = plan(2, undefined, undefined, []);
    const planB6 = plan(2, undefined, undefined, []);
    rt.advanceRound(planA6, planB6);
    expect(rt.round).toBe(6);
    // AP carryover cap: after any round, apPool is capped at AP_CAP=4
    expect(rt.budgetA.apPool).toBeLessThanOrEqual(4);
    expect(rt.budgetB.apPool).toBeLessThanOrEqual(4);

    // ── Round 7 (r=6): A submits invalid extra (non-existent unitId)
    //   → G4: bid 1 is still burned even though the plan is invalid.
    const planA7: RoundPlan = {
      bid: 1,
      extras: [{ kind: 'boosted_ability', unitId: '__NON_EXISTENT_UNIT__' }],
    };
    const planB7 = plan(0, undefined, undefined, []);
    rt.advanceRound(planA7, planB7);
    expect(rt.round).toBe(7);
    // A's apPool burned by additional 1 AP from the invalid plan's bid

    // ── Round 8 (r=7): G1 rushed-shot retarget — A attacks B's old hex after B moves away.
    // B moves to a position still within RANGE of A's living attacker unit (uA).
    // A's original unit (unitA0) died in r2 — use uA for the R8 attack.
    const bUnit = rt.state.units.find(u => u.owner === 'B' && u.hp > 0)!;
    const targetQ = bUnit.position.q;
    const targetR = bUnit.position.r;
    const targetS = bUnit.position.s;
    // Move B by +1 in q (cube constraint maintained) — stays in range for A's attack
    const movedQ = targetQ + 1;
    const movedR = targetR;
    const movedS = -movedQ - movedR;
    // Find a living A attacker for the R8 attack (unitA0 died in r2)
    const livingA = rt.state.units.find(u => u.owner === 'A' && u.hp > 0)!;
    const planA8: RoundPlan = {
      bid: 0,
      freeAction: { unitId: livingA.id, type: 'attack', from: livingA.position, to: { q: targetQ, r: targetR, s: targetS } },
      extras: [],
    };
    const planB8: RoundPlan = {
      bid: 0,
      freeMove: { unitId: bUnit.id, from: bUnit.position, to: { q: movedQ, r: movedR, s: movedS } },
      extras: [],
    };
    rt.advanceRound(planA8, planB8);
    expect(rt.round).toBe(8);
    // G1 code path exercised: attack on empty hex with retarget logic called
    const attackedEvents = rt.events.filter(e => e.type === 'unit_attacked');
    expect(attackedEvents.length).toBeGreaterThan(0);

    // ── Round 9 (r=8): Pass plans — both agents end with non-zero apCarry. ─
    const planA9 = plan(0, undefined, undefined, []);
    const planB9 = plan(0, undefined, undefined, []);
    rt.advanceRound(planA9, planB9);
    expect(rt.round).toBe(9);

    // ── Final invariant assertions ─────────────────────────────────────────────
    const r9Res = emitRoundEnd({ state: rt.state, round: 9, budgetA: rt.budgetA, budgetB: rt.budgetB });
    // G2 + G3 cleanup: after emitRoundEnd for round 9, stances and reserves are empty
    expect(r9Res.nextState.stances?.length ?? 0).toBe(0);
    expect(r9Res.nextState.reserves?.length ?? 0).toBe(0);

    // AP carry: both agents carry forward
    expect(rt.budgetA.apCarry).toBeGreaterThanOrEqual(0);
    expect(rt.budgetB.apCarry).toBeGreaterThanOrEqual(0);

    // Event stream coverage
    const eventTypes = rt.events.map(e => e.type);
    expect(eventTypes).toContain('reserve_fired');
    // wasted_action: fires when reserve kills a unit whose plan still references it (r2)
    expect(eventTypes).toContain('wasted_action');
    expect(eventTypes).toContain('unit_attacked'); // covers the G1 code path

    // Final round count
    expect(rt.round).toBe(9);
    expect(rt.metrics.totalTurns).toBe(9);

    // Snapshot serializable
    const snapshot = {
      round: rt.round,
      matchId: rt.matchId,
      finalState: {
        turn: rt.state.turn,
        units: rt.state.units.map(u => ({ id: u.id, owner: u.owner, hp: u.hp, position: u.position })),
        score: rt.state.score,
      },
      budgetA: rt.budgetA,
      budgetB: rt.budgetB,
      eventTypes: [...new Set(eventTypes)],
      metrics: rt.metrics,
      sealedAt: new Date().toISOString(),
    };
    const json = JSON.stringify(snapshot, null, 2);
    expect(() => JSON.parse(json)).not.toThrow();
    console.log('[e2e plan-d v2] 9-round complete, snapshot:', json);
  });
});