// Matchmaker Queue — in-memory ring buffer backed by Map
// KISS: enqueue/dequeue/snapshot only, no pairing logic.

import type { QueueEntry } from './types';

export class MatchQueue {
  private entries = new Map<number, QueueEntry>();

  enqueue(entry: QueueEntry): void {
    this.entries.set(entry.operatorId, entry);
  }

  dequeue(operatorId: number): boolean {
    return this.entries.delete(operatorId);
  }

  snapshot(): QueueEntry[] {
    return Array.from(this.entries.values());
  }

  size(): number {
    return this.entries.size;
  }
}