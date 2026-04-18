// Matchmaker Queue — in-memory ring buffer backed by Map
// KISS: enqueue/dequeue/snapshot/clear only, no pairing logic.

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
    return Array.from(this.entries.values()).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const matchQueue = new MatchQueue();