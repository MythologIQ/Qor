import { describe, it, expect, beforeEach } from "bun:test";
import { EventBus, eventBus } from "../../src/orchestrator/events";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("subscribe returns a subscription id", () => {
    const id = bus.subscribe("match-1", () => {});
    expect(typeof id).toBe("string");
    expect(id.startsWith("sub-")).toBe(true);
  });

  it("multiple subscribers all receive events", () => {
    const received: unknown[] = [];
    bus.subscribe("match-1", (e) => received.push(e));
    bus.subscribe("match-1", (e) => received.push(e));
    bus.publish("match-1", "hello");
    expect(received).toEqual(["hello", "hello"]);
  });

  it("unsubscribe stops delivery", () => {
    const received: unknown[] = [];
    const id = bus.subscribe("match-1", (e) => received.push(e));
    bus.publish("match-1", "first");
    bus.unsubscribe(id);
    bus.publish("match-1", "second");
    expect(received).toEqual(["first"]);
  });

  it("getSubscriberCount returns correct count", () => {
    bus.subscribe("match-1", () => {});
    bus.subscribe("match-1", () => {});
    expect(bus.getSubscriberCount("match-1")).toBe(2);
    expect(bus.getSubscriberCount("match-2")).toBe(0);
  });

  it("publish only delivers to matching matchId", () => {
    const received: unknown[] = [];
    bus.subscribe("match-1", (e) => received.push(e));
    bus.subscribe("match-2", (e) => received.push(e));
    bus.publish("match-1", "only-1");
    expect(received).toEqual(["only-1"]);
  });

  it("unsubscribe returns true for valid id", () => {
    const id = bus.subscribe("match-1", () => {});
    expect(bus.unsubscribe(id)).toBe(true);
    expect(bus.unsubscribe("invalid")).toBe(false);
  });
});
