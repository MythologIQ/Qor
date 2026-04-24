import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { MatchQueue } from '../../src/matchmaker/queue';
import { PresenceTracker } from '../../src/matchmaker/presence';
import { MatchmakerStatus } from '../../src/matchmaker/status';
import { startMatchmaker } from '../../src/matchmaker/loop';
import type { MatchPair } from '../../src/matchmaker/types';

function makeEntry(operatorId: number, elo = 1000) {
  return { operatorId, handle: `op${operatorId}`, elo, enqueuedAt: Date.now() };
}

describe('matchmaker integration smoke', () => {
  let queue: MatchQueue;
  let presence: PresenceTracker;
  let status: MatchmakerStatus;
  let fired: { pairs: MatchPair[] };

  beforeEach(() => {
    queue = new MatchQueue();
    presence = new PresenceTracker();
    status = new MatchmakerStatus();
    fired = { pairs: [] };
  });

  test('boot queue+presence+loop; enqueue two online operators; tick once; onPair invoked with correct IDs; both dequeued', async () => {
    queue.enqueue(makeEntry(10, 1000));
    queue.enqueue(makeEntry(11, 1100));
    presence.connect(10);
    presence.connect(11);

    const beforePair = status.getLastPairAt();

    const { stop } = startMatchmaker({
      queue,
      presence,
      onPair(pair) {
        status.recordPair();
        fired.pairs.push(pair);
      },
      intervalMs: 10,
    });

    await new Promise(resolve => setTimeout(resolve, 60));
    stop();

    expect(fired.pairs).toHaveLength(1);
    expect(fired.pairs[0].a.operatorId).toBe(10);
    expect(fired.pairs[0].b.operatorId).toBe(11);
    expect(queue.size()).toBe(0);
    expect(status.getLastPairAt()).not.toBe(beforePair);
  });

  test('single online operator does not trigger onPair', async () => {
    queue.enqueue(makeEntry(20, 1000));
    queue.enqueue(makeEntry(21, 1100));
    presence.connect(20);
    // op21 is offline

    const { stop } = startMatchmaker({
      queue,
      presence,
      onPair(pair) {
        fired.pairs.push(pair);
      },
      intervalMs: 10,
    });

    await new Promise(resolve => setTimeout(resolve, 60));
    stop();

    expect(fired.pairs).toHaveLength(0);
    expect(queue.size()).toBe(2);
  });

  test('three operators pair two and leave one', async () => {
    queue.enqueue(makeEntry(30, 1000));
    queue.enqueue(makeEntry(31, 1050));
    queue.enqueue(makeEntry(32, 2000)); // too far in ELO
    presence.connect(30);
    presence.connect(31);
    presence.connect(32);

    const { stop } = startMatchmaker({
      queue,
      presence,
      onPair(pair) {
        fired.pairs.push(pair);
      },
      intervalMs: 10,
    });

    await new Promise(resolve => setTimeout(resolve, 60));
    stop();

    expect(fired.pairs).toHaveLength(1);
    expect(fired.pairs[0].a.operatorId).toBe(30);
    expect(fired.pairs[0].b.operatorId).toBe(31);
    expect(queue.size()).toBe(1);
    expect(queue.snapshot()[0].operatorId).toBe(32);
  });
});
