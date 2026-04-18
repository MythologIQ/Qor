import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { startMatchmaker } from '../../src/matchmaker/loop';
import { MatchQueue } from '../../src/matchmaker/queue';
import { PresenceTracker } from '../../src/matchmaker/presence';
import type { QueueEntry } from '../../src/matchmaker/types';

function makeEntry(operatorId: number, elo = 1000): QueueEntry {
  return { operatorId, handle: `op${operatorId}`, elo, enqueuedAt: Date.now() };
}

describe('startMatchmaker', () => {
  let queue: MatchQueue;
  let presence: PresenceTracker;
  let fired: { pair: unknown; count: number };

  beforeEach(() => {
    queue = new MatchQueue();
    presence = new PresenceTracker();
    fired = { pair: null, count: 0 };
  });

  it('onPair fires once and both operators dequeued when two online operators are enqueued', async () => {
    queue.enqueue(makeEntry(1));
    queue.enqueue(makeEntry(2));
    presence.connect(1);
    presence.connect(2);

    const { stop } = startMatchmaker({
      queue,
      presence,
      onPair(pair) {
        fired.count++;
        fired.pair = pair;
      },
      intervalMs: 10,
    });

    await new Promise(resolve => setTimeout(resolve, 60));
    stop();

    expect(fired.count).toBe(1);
    expect((fired.pair as any).a.operatorId).toBe(1);
    expect((fired.pair as any).b.operatorId).toBe(2);
    expect(queue.size()).toBe(0);
  });

  it('offline operator is skipped', async () => {
    queue.enqueue(makeEntry(1));
    queue.enqueue(makeEntry(2));
    presence.connect(1);
    // op2 is offline

    const { stop } = startMatchmaker({
      queue,
      presence,
      onPair() {
        fired.count++;
      },
      intervalMs: 10,
    });

    await new Promise(resolve => setTimeout(resolve, 60));
    stop();

    expect(fired.count).toBe(0);
    expect(queue.size()).toBe(2);
  });

  it('stop() cancels the interval', async () => {
    queue.enqueue(makeEntry(1));
    queue.enqueue(makeEntry(2));
    presence.connect(1);
    presence.connect(2);

    const { stop } = startMatchmaker({
      queue,
      presence,
      onPair() {
        fired.count++;
      },
      intervalMs: 10,
    });

    await new Promise(resolve => setTimeout(resolve, 30));
    stop();

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fired.count).toBe(1);
  });
});