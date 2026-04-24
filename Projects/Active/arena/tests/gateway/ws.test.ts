import { describe, test, expect } from 'bun:test';
import { buildHelloFrame, buildStateFrame, buildAckFrame, buildEndFrame, parseFrame } from '../../src/gateway/ws';
import type { AgentRoundBudget } from '../../src/shared/types';

const budget: AgentRoundBudget = { freeMove: 1, freeAction: 1, apPool: 3, apCarry: 0 };

describe('WebSocket Handler', () => {
  describe('buildHelloFrame', () => {
    test('produces valid HelloFrame', () => {
      const frame = buildHelloFrame('match-1', 'A', 'seed-abc', { width: 7, height: 7 }, 5000);
      expect(frame.type).toBe('HELLO');
      expect(frame.matchId).toBe('match-1');
      expect(frame.side).toBe('A');
      expect(frame.seed).toBe('seed-abc');
      expect(frame.boardSize).toEqual({ width: 7, height: 7 });
      expect(frame.timeBudgetMs).toBe(5000);
      expect(frame.protocolVersion).toBe('2.0');
    });
  });

  describe('buildStateFrame', () => {
    test('produces valid StateFrame', () => {
      const frame = buildStateFrame(5, [], [], { a: 10, b: 8 }, Date.now() + 5000, 48, budget);
      expect(frame.type).toBe('STATE');
      expect(frame.turn).toBe(5);
      expect(frame.roundCap).toBe(48);
      expect(frame.budget).toEqual(budget);
      expect(frame.score).toEqual({ a: 10, b: 8 });
    });
  });

  describe('buildAckFrame', () => {
    test('accepted=true', () => {
      const frame = buildAckFrame(true);
      expect(frame.type).toBe('ACK');
      expect(frame.accepted).toBe(true);
    });
    test('accepted=false with reason', () => {
      const frame = buildAckFrame(false, 'invalid_plan');
      expect(frame.accepted).toBe(false);
      expect(frame.reason).toBe('invalid_plan');
    });
  });

  describe('buildEndFrame', () => {
    test('produces valid EndFrame', () => {
      const frame = buildEndFrame('A', 'elimination', { a: 25, b: 0 }, { totalActions: 42, avgDecisionMs: 80, invalidActions: 1 });
      expect(frame.type).toBe('END');
      expect(frame.winner).toBe('A');
      expect(frame.reason).toBe('elimination');
      expect(frame.finalScore).toEqual({ a: 25, b: 0 });
    });
  });

  describe('parseFrame', () => {
    test('parses READY frame', () => {
      const raw = JSON.stringify({ type: 'READY', agentId: 'agent-1', agentVersion: '1.0' });
      const frame = parseFrame(raw);
      expect(frame?.type).toBe('READY');
    });
    test('parses PLAN frame', () => {
      const raw = JSON.stringify({
        type: 'PLAN',
        plan: { bid: 0, extras: [], freeMove: { unitId: 'u1', from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: -1, s: 0 } } },
        confidence: 0.95,
      });
      const frame = parseFrame(raw);
      expect(frame?.type).toBe('PLAN');
    });
    test('returns null for unknown type', () => {
      const frame = parseFrame(JSON.stringify({ type: 'PING' }));
      expect(frame).toBeNull();
    });
    test('returns null for invalid JSON', () => {
      const frame = parseFrame('not json');
      expect(frame).toBeNull();
    });
  });
});
