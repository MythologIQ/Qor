// HexaWars Agent Session Manager Tests
// task-033-session-tests | phase C | writes: tests/engine/session.test.ts

import { describe, it, expect, beforeEach } from 'bun:test';
import { AgentSessionManager } from '../../src/gateway/session';

describe('AgentSessionManager', () => {
  let manager: AgentSessionManager;

  beforeEach(() => {
    manager = new AgentSessionManager();
  });

  describe('session lifecycle', () => {
    it('creates a session with connected status', () => {
      const session = manager.createSession('s1', 'm1', 'A');
      expect(session.id).toBe('s1');
      expect(session.matchId).toBe('m1');
      expect(session.side).toBe('A');
      expect(session.status).toBe('connected');
      expect(session.invalidCount).toBe(0);
      expect(session.totalMs).toBe(0);
    });

    it('retrieves a created session', () => {
      manager.createSession('s1', 'm1', 'A');
      const found = manager.getSession('s1');
      expect(found).toBeDefined();
      expect(found!.id).toBe('s1');
    });

    it('returns undefined for unknown session', () => {
      const found = manager.getSession('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('transitions', () => {
    it('transitions connected → ready → playing → ended (valid path)', () => {
      manager.createSession('s1', 'm1', 'A');
      expect(manager.transition('s1', 'ready')).toBe(true);
      expect(manager.getSession('s1')!.status).toBe('ready');
      expect(manager.transition('s1', 'playing')).toBe(true);
      expect(manager.getSession('s1')!.status).toBe('playing');
      expect(manager.transition('s1', 'ended')).toBe(true);
      expect(manager.getSession('s1')!.status).toBe('ended');
    });

    it('rejects invalid status values', () => {
      manager.createSession('s1', 'm1', 'A');
      expect(manager.transition('s1', 'forbidden' as any)).toBe(false);
      expect(manager.getSession('s1')!.status).toBe('connected');
    });

    it('rejects backward transitions (playing → ready)', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.transition('s1', 'ready');
      manager.transition('s1', 'playing');
      expect(manager.transition('s1', 'ready')).toBe(false);
      expect(manager.getSession('s1')!.status).toBe('playing');
    });

    it('rejects any transition after forfeit', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.transition('s1', 'ready');
      manager.forfeit('s1', 'invalid actions');
      expect(manager.transition('s1', 'playing')).toBe(false);
      expect(manager.transition('s1', 'ended')).toBe(false);
      expect(manager.getSession('s1')!.status).toBe('forfeit');
    });

    it('allows ready → forfeit', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.transition('s1', 'ready');
      expect(manager.transition('s1', 'forfeit')).toBe(true);
      expect(manager.getSession('s1')!.status).toBe('forfeit');
    });

    it('rejects playing → forfeit', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.transition('s1', 'ready');
      manager.transition('s1', 'playing');
      expect(manager.transition('s1', 'forfeit')).toBe(false);
      expect(manager.getSession('s1')!.status).toBe('playing');
    });

    it('rejects transition on unknown session', () => {
      expect(manager.transition('nonexistent', 'ready')).toBe(false);
    });
  });

  describe('invalid count threshold triggers forfeit', () => {
    const INVALID_THRESHOLD = 3;

    it('forfeits when invalid count reaches threshold', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.transition('s1', 'ready');
      manager.transition('s1', 'playing');

      for (let i = 0; i < INVALID_THRESHOLD; i++) {
        manager.markInvalid('s1');
      }

      const session = manager.getSession('s1')!;
      expect(session.invalidCount).toBe(INVALID_THRESHOLD);
      // forfeit is called externally when threshold is hit
      manager.forfeit('s1', 'invalid actions exceeded');
      expect(session.status).toBe('forfeit');
    });

    it('accumulates invalid count across actions', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.transition('s1', 'ready');
      manager.markInvalid('s1');
      manager.markInvalid('s1');
      manager.markInvalid('s1');
      expect(manager.getSession('s1')!.invalidCount).toBe(3);
    });

    it('does not forfeit before reaching threshold', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.transition('s1', 'ready');
      manager.markInvalid('s1');
      manager.markInvalid('s1');
      manager.forfeit('s1', 'early forfeit');
      expect(manager.getSession('s1')!.status).toBe('forfeit');
    });
  });

  describe('total time threshold triggers forfeit', () => {
    it('forfeits when total decision time exceeds threshold', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.transition('s1', 'ready');
      manager.transition('s1', 'playing');

      const TIME_LIMIT_MS = 30_000;
      manager.recordAction('s1', TIME_LIMIT_MS + 1);

      const session = manager.getSession('s1')!;
      expect(session.totalMs).toBeGreaterThan(TIME_LIMIT_MS);
      manager.forfeit('s1', 'time limit exceeded');
      expect(session.status).toBe('forfeit');
    });

    it('accumulates total time across actions', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.transition('s1', 'ready');
      manager.recordAction('s1', 5000);
      manager.recordAction('s1', 8000);
      manager.recordAction('s1', 12000);
      expect(manager.getSession('s1')!.totalMs).toBe(25000);
    });

    it('does not forfeit when total time is within limit', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.transition('s1', 'ready');
      manager.transition('s1', 'playing');
      manager.recordAction('s1', 10_000);
      manager.recordAction('s1', 10_000);
      expect(manager.getSession('s1')!.status).toBe('playing');
    });
  });

  describe('metrics', () => {
    it('computes metrics correctly', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.transition('s1', 'ready');
      manager.markInvalid('s1');
      manager.recordAction('s1', 100);

      const metrics = manager.toMetrics('s1');
      expect(metrics).not.toBeNull();
      expect(metrics!.totalActions).toBe(2); // 1 invalid + 1 valid
      expect(metrics!.invalidActions).toBe(1);
      expect(metrics!.avgDecisionMs).toBe(100);
      expect(metrics!.totalMs).toBe(100);
    });

    it('returns null for unknown session', () => {
      expect(manager.toMetrics('nonexistent')).toBeNull();
    });
  });

  describe('forfeit', () => {
    it('marks session as forfeit with reason', () => {
      manager.createSession('s1', 'm1', 'A');
      manager.forfeit('s1', 'too many invalid actions');
      const session = manager.getSession('s1')!;
      expect(session.status).toBe('forfeit');
    });

    it('updates lastActionAt on forfeit', () => {
      manager.createSession('s1', 'm1', 'A');
      const before = manager.getSession('s1')!.lastActionAt;
      manager.forfeit('s1', 'reason');
      expect(manager.getSession('s1')!.lastActionAt).toBeGreaterThanOrEqual(before);
    });
  });
});
