import { afterEach, describe, expect, test } from "bun:test";
import { FRAME_TYPES, connectSpectator } from "../../src/public/ws-client.js";

const originalWebSocket = globalThis.WebSocket;

type ListenerPayload = { data: string } | Event;
type Listener = (payload: ListenerPayload) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  listeners = new Map<string, Listener[]>();
  closed = false;

  constructor(url: string | URL) {
    this.url = String(url);
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: Listener) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  emit(type: string, payload: ListenerPayload) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(payload);
    }
  }

  close() {
    this.closed = true;
  }
}

describe("ws-client", () => {
  afterEach(() => {
    MockWebSocket.instances = [];
    if (originalWebSocket) {
      globalThis.WebSocket = originalWebSocket;
      return;
    }
    Reflect.deleteProperty(globalThis, "WebSocket");
  });

  test("connects to canonical spectator websocket path", () => {
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const connection = connectSpectator("match alpha", {});
    expect(MockWebSocket.instances[0]?.url).toBe("/api/arena/matches/match%20alpha/ws");
    connection.disconnect();
  });

  test("dispatches all MATCH_* frames to handlers", () => {
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const calls: string[] = [];
    connectSpectator("match-1", {
      onHello: (frame) => calls.push(String((frame as { type: string }).type)),
      onState: (frame) => calls.push(String((frame as { type: string }).type)),
      onEvent: (frame) => calls.push(String((frame as { type: string }).type)),
      onEnd: (frame) => calls.push(String((frame as { type: string }).type)),
    });
    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    if (!ws) throw new Error("expected websocket instance");
    ws.emit("message", { data: JSON.stringify({ type: FRAME_TYPES.HELLO, projection: {} }) });
    ws.emit("message", { data: JSON.stringify({ type: FRAME_TYPES.STATE, projection: {} }) });
    ws.emit("message", { data: JSON.stringify({ type: FRAME_TYPES.EVENT, event: {}, projection: {} }) });
    ws.emit("message", { data: JSON.stringify({ type: FRAME_TYPES.END, outcome: {}, projection: {} }) });
    expect(calls).toEqual([
      FRAME_TYPES.HELLO,
      FRAME_TYPES.STATE,
      FRAME_TYPES.EVENT,
      FRAME_TYPES.END,
    ]);
    expect(ws.closed).toBe(true);
  });
});
