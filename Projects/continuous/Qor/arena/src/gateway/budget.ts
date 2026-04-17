// HexaWars Budget Tracker
// task-039-budget-impl | phase C

const TOTAL_MS_LIMIT = 120000;
const INVALID_LIMIT = 10;
const UNANSWERED_LIMIT = 3;

export class BudgetTracker {
  totalMs: number = 0;
  invalidCount: number = 0;
  unansweredTurns: number = 0;

  record(ms: number): void {
    this.totalMs += ms;
  }

  recordInvalid(): void {
    this.invalidCount++;
  }

  recordUnanswered(): void {
    this.unansweredTurns++;
  }

  isExceeded(): { exceeded: boolean; reason?: string } {
    if (this.totalMs > TOTAL_MS_LIMIT) {
      return { exceeded: true, reason: `totalMs ${this.totalMs} exceeds limit ${TOTAL_MS_LIMIT}` };
    }
    if (this.invalidCount > INVALID_LIMIT) {
      return { exceeded: true, reason: `invalidCount ${this.invalidCount} exceeds limit ${INVALID_LIMIT}` };
    }
    if (this.unansweredTurns > UNANSWERED_LIMIT) {
      return { exceeded: true, reason: `unansweredTurns ${this.unansweredTurns} exceeds limit ${UNANSWERED_LIMIT}` };
    }
    return { exceeded: false };
  }
}
