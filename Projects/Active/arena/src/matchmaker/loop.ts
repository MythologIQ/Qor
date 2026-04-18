// Matchmaker Loop — periodic pairing driver
// KISS: start/stop seam, no setInterval in tests.

import type { MatchQueue } from './queue';
import type { PresenceTracker } from './presence';
import type { MatchPair, PairingCriteria } from './types';
import { findPair } from './pair';
import { recordPair } from '../../router';

export function startMatchmaker(deps: {
  queue: MatchQueue;
  presence: PresenceTracker;
  onPair: (p: MatchPair) => void;
  intervalMs?: number;
}): { stop: () => void } {
  const intervalMs = deps.intervalMs ?? 1000;
  const criteria: PairingCriteria = { eloTolerance: 200 };

  const id = setInterval(() => {
    const pair = findPair(deps.queue, criteria);
    if (!pair) return;
    if (!deps.presence.isOnline(pair.a.operatorId)) return;
    if (!deps.presence.isOnline(pair.b.operatorId)) return;
    deps.onPair(pair);
    recordPair();
    deps.queue.dequeue(pair.a.operatorId);
    deps.queue.dequeue(pair.b.operatorId);
  }, intervalMs);

  return { stop: () => clearInterval(id) };
}