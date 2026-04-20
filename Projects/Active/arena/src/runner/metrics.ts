export class RunnerMetrics {
  private matchesRun = 0;
  private matchesTimedOut = 0;
  private matchesForfeit = 0;

  incRun() { this.matchesRun++; }
  incTimedOut() { this.matchesTimedOut++; }
  incForfeit() { this.matchesForfeit++; }

  snapshot() {
    return {
      matchesRun: this.matchesRun,
      matchesTimedOut: this.matchesTimedOut,
      matchesForfeit: this.matchesForfeit,
    };
  }
}

export const runnerMetrics = new RunnerMetrics();