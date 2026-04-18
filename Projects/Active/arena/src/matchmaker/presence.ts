// Presence Tracker
// Tracks which operators have active WS connections.

export class PresenceTracker {
  private online = new Set<number>();

  connect(operatorId: number): void {
    this.online.add(operatorId);
  }

  disconnect(operatorId: number): void {
    this.online.delete(operatorId);
  }

  isOnline(operatorId: number): boolean {
    return this.online.has(operatorId);
  }

  online(): number[] {
    return Array.from(this.online);
  }

  size(): number {
    return this.online.size;
  }
}

export const presenceTracker = new PresenceTracker();