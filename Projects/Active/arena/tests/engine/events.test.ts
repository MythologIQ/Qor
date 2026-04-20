import { describe, it, expect, beforeEach } from 'bun:test';
import { EventBus } from '../../src/orchestrator/events';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('subscribe + publish delivers', () => {
    it('delivers published event to subscriber', () => {
      const received: unknown[] = [];
      bus.subscribe('match-1', (event) => received.push(event));
      bus.publish('match-1', { type: 'turn', turn: 1 });
      expect(received).toEqual([{ type: 'turn', turn: 1 }]);
    });

    it('delivers multiple events to subscriber', () => {
      const received: unknown[] = [];
      bus.subscribe('match-1', (event) => received.push(event));
      bus.publish('match-1', { type: 'turn', turn: 1 });
      bus.publish('match-1', { type: 'turn', turn: 2 });
      bus.publish('match-1', { type: 'turn', turn: 3 });
      expect(received).toEqual([
        { type: 'turn', turn: 1 },
        { type: 'turn', turn: 2 },
        { type: 'turn', turn: 3 },
      ]);
    });

    it('multiple subscribers each receive published events', () => {
      const received1: unknown[] = [];
      const received2: unknown[] = [];
      bus.subscribe('match-1', (event) => received1.push(event));
      bus.subscribe('match-1', (event) => received2.push(event));
      bus.publish('match-1', { type: 'action', data: 'x' });
      expect(received1).toEqual([{ type: 'action', data: 'x' }]);
      expect(received2).toEqual([{ type: 'action', data: 'x' }]);
    });
  });

  describe('unsubscribe stops delivery', () => {
    it('unsubscribe returns true for valid subscription id', () => {
      const subId = bus.subscribe('match-1', () => {});
      expect(bus.unsubscribe(subId)).toBe(true);
    });

    it('unsubscribe returns false for invalid subscription id', () => {
      expect(bus.unsubscribe('invalid-id')).toBe(false);
    });

    it('after unsubscribe, published events are not delivered', () => {
      const received: unknown[] = [];
      const subId = bus.subscribe('match-1', (event) => received.push(event));
      bus.publish('match-1', { type: 'turn', turn: 1 });
      expect(received.length).toBe(1);
      bus.unsubscribe(subId);
      bus.publish('match-1', { type: 'turn', turn: 2 });
      expect(received).toEqual([{ type: 'turn', turn: 1 }]);
    });

    it('unsubscribe does not affect other subscribers', () => {
      const received1: unknown[] = [];
      const received2: unknown[] = [];
      const subId1 = bus.subscribe('match-1', (event) => received1.push(event));
      bus.subscribe('match-1', (event) => received2.push(event));
      bus.publish('match-1', { type: 'turn', turn: 1 });
      expect(received1.length).toBe(1);
      expect(received2.length).toBe(1);
      bus.unsubscribe(subId1);
      bus.publish('match-1', { type: 'turn', turn: 2 });
      expect(received1).toEqual([{ type: 'turn', turn: 1 }]);
      expect(received2).toEqual([
        { type: 'turn', turn: 1 },
        { type: 'turn', turn: 2 },
      ]);
    });
  });

  describe('events scoped to matchId', () => {
    it('events published to one matchId are not delivered to another', () => {
      const received1: unknown[] = [];
      const received2: unknown[] = [];
      bus.subscribe('match-1', (event) => received1.push(event));
      bus.subscribe('match-2', (event) => received2.push(event));
      bus.publish('match-1', { type: 'turn', turn: 1 });
      bus.publish('match-2', { type: 'turn', turn: 1 });
      expect(received1).toEqual([{ type: 'turn', turn: 1 }]);
      expect(received2).toEqual([{ type: 'turn', turn: 1 }]);
    });

    it('events published to match-1 are not delivered to match-2 subscriber', () => {
      const received: unknown[] = [];
      bus.subscribe('match-2', (event) => received.push(event));
      bus.publish('match-1', { type: 'action', data: 'secret' });
      expect(received).toEqual([]);
    });

    it('unsubscribe from one matchId does not affect another', () => {
      const received: unknown[] = [];
      const subId = bus.subscribe('match-1', () => {});
      bus.subscribe('match-2', (event) => received.push(event));
      bus.unsubscribe(subId);
      bus.publish('match-2', { type: 'turn', turn: 1 });
      expect(received).toEqual([{ type: 'turn', turn: 1 }]);
    });

    it('getSubscriberCount returns correct count per matchId', () => {
      bus.subscribe('match-1', () => {});
      bus.subscribe('match-1', () => {});
      bus.subscribe('match-2', () => {});
      expect(bus.getSubscriberCount('match-1')).toBe(2);
      expect(bus.getSubscriberCount('match-2')).toBe(1);
      expect(bus.getSubscriberCount('match-3')).toBe(0);
    });

    it('after unsubscribe, subscriber count decreases for correct matchId', () => {
      const subId1 = bus.subscribe('match-1', () => {});
      bus.subscribe('match-1', () => {});
      expect(bus.getSubscriberCount('match-1')).toBe(2);
      bus.unsubscribe(subId1);
      expect(bus.getSubscriberCount('match-1')).toBe(1);
    });
  });
});
