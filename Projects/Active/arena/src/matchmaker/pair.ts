// Matchmaker Pairing — ELO tolerance band
// KISS: pure findPair, no queue mutation.

import type { MatchQueue } from './queue';
import type { PairingCriteria, MatchPair } from './types';

export function findPair(
  q: MatchQueue,
  criteria: PairingCriteria,
): MatchPair | null {
  const snapshot = q.snapshot();
  for (let i = 0; i < snapshot.length - 1; i++) {
    for (let j = i + 1; j < snapshot.length; j++) {
      if (Math.abs(snapshot[i].elo - snapshot[j].elo) <= criteria.eloTolerance) {
        return { a: snapshot[i], b: snapshot[j], createdAt: Date.now() };
      }
    }
  }
  return null;
}
