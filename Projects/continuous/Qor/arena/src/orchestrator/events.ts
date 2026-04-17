export type EventHandler = (event: unknown) => void;

interface Subscription {
  id: string;
  matchId: string;
  handler: EventHandler;
}

export class EventBus {
  private subscribers = new Map<string, Subscription>();
  private subscriberCount = new Map<string, number>();
  private nextId = 1;

  subscribe(matchId: string, handler: EventHandler): string {
    const id = `sub-${this.nextId++}`;
    this.subscribers.set(id, { id, matchId, handler });
    const count = (this.subscriberCount.get(matchId) ?? 0) + 1;
    this.subscriberCount.set(matchId, count);
    return id;
  }

  publish(matchId: string, event: unknown): void {
    for (const sub of this.subscribers.values()) {
      if (sub.matchId === matchId) {
        sub.handler(event);
      }
    }
  }

  unsubscribe(id: string): boolean {
    const sub = this.subscribers.get(id);
    if (!sub) return false;
    this.subscribers.delete(id);
    const count = (this.subscriberCount.get(sub.matchId) ?? 1) - 1;
    if (count <= 0) {
      this.subscriberCount.delete(sub.matchId);
    } else {
      this.subscriberCount.set(sub.matchId, count);
    }
    return true;
  }

  getSubscriberCount(matchId: string): number {
    return this.subscriberCount.get(matchId) ?? 0;
  }
}

export const eventBus = new EventBus();
