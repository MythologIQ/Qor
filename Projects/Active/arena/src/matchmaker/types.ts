// Matchmaker Types
// KISS: interfaces only, no logic.

export interface QueueEntry {
  operatorId: number;
  handle: string;
  elo: number;
  enqueuedAt: number;
}

export interface PairingCriteria {
  eloTolerance: number;
}

export interface MatchPair {
  a: QueueEntry;
  b: QueueEntry;
  createdAt: number;
}
