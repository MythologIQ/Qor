// Matchmaker Metrics — counters for queue activity
// KISS: pairsFormed + enqueueCount, snapshot only, no persistence.

export class MatchmakerMetrics {
  pairsFormed = 0;
  enqueueCount = 0;

  incPair(): void {
    this.pairsFormed++;
  }

  incEnqueue(): void {
    this.enqueueCount++;
  }

  snapshot(): { pairsFormed: number; enqueueCount: number } {
    return { pairsFormed: this.pairsFormed, enqueueCount: this.enqueueCount };
  }
}

export const matchmakerMetrics = new MatchmakerMetrics();
