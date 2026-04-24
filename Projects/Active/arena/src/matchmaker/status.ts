export class MatchmakerStatus {
  private lastPairAt: number | null = null;

  recordPair(ts = Date.now()): void {
    this.lastPairAt = ts;
  }

  getLastPairAt(): number | null {
    return this.lastPairAt;
  }

  reset(): void {
    this.lastPairAt = null;
  }
}

export const matchmakerStatus = new MatchmakerStatus();
