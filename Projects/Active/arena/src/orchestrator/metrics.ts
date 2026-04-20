// HexaWars Match Metrics Collector
// task-051-metrics-impl | phase E

export interface MatchMetrics {
  totalActions: number;
  avgDecisionMs: number;
  invalidActions: number;
  turnsPlayed: number;
  durationMs: number;
}

interface TurnRecord {
  actionMs: number;
  valid: boolean;
}

export class Metrics {
  private turns: TurnRecord[] = [];
  private invalidCount = 0;
  private startMs = 0;
  private endMs = 0;

  recordAction(side: 'A' | 'B', ms: number, valid: boolean): void {
    if (this.startMs === 0) this.startMs = Date.now();
    if (!valid) this.invalidCount++;
    this.turns.push({ actionMs: ms, valid });
  }

  recordTurn(): void {
    this.endMs = Date.now();
  }

  finalize(): MatchMetrics {
    const validTurns = this.turns.filter(t => t.valid);
    const totalActions = validTurns.length + this.invalidCount;
    const totalMs = validTurns.reduce((sum, t) => sum + t.actionMs, 0);
    return {
      totalActions,
      avgDecisionMs: validTurns.length > 0 ? Math.round(totalMs / validTurns.length) : 0,
      invalidActions: this.invalidCount,
      turnsPlayed: validTurns.length,
      durationMs: this.endMs > 0 && this.startMs > 0 ? this.endMs - this.startMs : 0,
    };
  }
}