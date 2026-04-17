import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTimeout, TimeoutError, enforceActionDeadline } from '../../src/gateway/timeout.js';
import { AgentSessionManager } from '../../src/gateway/session.js';

describe('Timeout', () => {
  describe('withTimeout', () => {
    it('resolves when promise completes before timeout', async () => {
      const value = await withTimeout(Promise.resolve(42), 1000);
      expect(value).toBe(42);
    });

    it('returns TimeoutError when promise does not resolve within deadline', async () => {
      const neverResolves = new Promise<never>(() => {});
      const result = await withTimeout(neverResolves, 50);
      expect(result).toBeInstanceOf(TimeoutError);
      expect((result as TimeoutError).ms).toBe(50);
    });

    it('resolves with value when resolution is faster than timeout', async () => {
      const fast = new Promise<string>((resolve) => setTimeout(() => resolve('fast'), 5));
      const result = await withTimeout(fast, 100);
      expect(result).toBe('fast');
    });

    it('returns TimeoutError for deliberately slow promise', async () => {
      const slow = new Promise<string>((resolve) => setTimeout(() => resolve('slow'), 200));
      const result = await withTimeout(slow, 50);
      expect(result).toBeInstanceOf(TimeoutError);
    });
  });

  describe('enforceActionDeadline', () => {
    let manager: AgentSessionManager;
    let forfeitSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      forfeitSpy = vi.fn();
      manager = {
        forfeit: forfeitSpy,
      } as unknown as AgentSessionManager;
    });

    it('returns true when current time is before deadline', () => {
      const futureDeadline = Date.now() + 5000;
      const result = enforceActionDeadline(manager, 'session-1', futureDeadline);
      expect(result).toBe(true);
      expect(forfeitSpy).not.toHaveBeenCalled();
    });

    it('returns false and forfeits session when deadline is missed', () => {
      const pastDeadline = Date.now() - 100;
      const result = enforceActionDeadline(manager, 'session-1', pastDeadline);
      expect(result).toBe(false);
      expect(forfeitSpy).toHaveBeenCalledOnce();
      expect(forfeitSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('Deadline exceeded'));
    });

    it('forfeits with correct session id and deadline message', () => {
      const pastDeadline = Date.now() - 50;
      enforceActionDeadline(manager, 'session-abc', pastDeadline);
      expect(forfeitSpy).toHaveBeenCalledWith('session-abc', expect.stringContaining('Deadline exceeded'));
    });

    it('returns true when deadline equals current time (edge case)', () => {
      const now = Date.now();
      const result = enforceActionDeadline(manager, 'session-1', now);
      expect(result).toBe(true);
      expect(forfeitSpy).not.toHaveBeenCalled();
    });
  });
});
