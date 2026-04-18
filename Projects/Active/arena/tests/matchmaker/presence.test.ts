import { describe, test, expect, beforeEach } from 'bun:test';
import { PresenceTracker } from '../../src/matchmaker/presence.ts';

describe('PresenceTracker', () => {
  let tracker: PresenceTracker;

  beforeEach(() => {
    tracker = new PresenceTracker();
  });

  test('connect flips isOnline to true', () => {
    expect(tracker.isOnline(1)).toBe(false);
    tracker.connect(1);
    expect(tracker.isOnline(1)).toBe(true);
  });

  test('disconnect flips isOnline to false', () => {
    tracker.connect(1);
    expect(tracker.isOnline(1)).toBe(true);
    tracker.disconnect(1);
    expect(tracker.isOnline(1)).toBe(false);
  });

  test('online() returns sorted unique list', () => {
    tracker.connect(3);
    tracker.connect(1);
    tracker.connect(2);
    expect(tracker.onlineOperators()).toEqual([1, 2, 3]);
  });

  test('online() deduplicates', () => {
    tracker.connect(1);
    tracker.connect(1);
    expect(tracker.onlineOperators()).toEqual([1]);
  });

  test('disconnect of unknown is noop', () => {
    expect(() => tracker.disconnect(999)).not.toThrow();
    expect(tracker.onlineOperators()).toEqual([]);
  });
});