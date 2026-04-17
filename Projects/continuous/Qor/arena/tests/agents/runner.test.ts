/**
 * Builder Tick 46 | task-046-agent-runner
 * Tests for Agent Runner — runAgent WebSocket lifecycle
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { runAgent } from '../../src/agents/runner';
import { BaseAgent } from '../../src/agents/base';
import type { AgentAction, MatchState } from '../../src/shared/types';

// ── Mock WebSocket ────────────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState = 1; // OPEN
  private listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  sentFrames: string[] = [];

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
    // Defer 'open' so addEventListener is called first in runAgent
    queueMicrotask(() => this.emit('open', {}));
  }

  addEventListener(event: string, fn: (...args: unknown[]) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event: string, fn: (...args: unknown[]) => void) {
    this.listeners[event] = (this.listeners[event] || []).filter(h => h !== fn);
  }

  send(data: string) {
    this.sentFrames.push(data);
  }

  close() {
    this.readyState = 3;
    this.emit('close', {});
  }

  emit(event: string, data: unknown) {
    const handlers = this.listeners[event] || [];
    handlers.forEach(h => h(data));
  }

  serverSend(frame: object) {
    // parseFrame expects event.data to be a string/Buffer/ArrayBuffer
    this.emit('message', { data: JSON.stringify(frame) });
  }

  serverError(err: Error) {
    this.emit('error', err);
  }
}

// ── Test Agent ────────────────────────────────────────────────────────────────

class TestAgent extends BaseAgent {
  decisions: MatchState[] = [];
  helloArgs?: [string, 'A' | 'B', string];
  ackResults: { accepted: boolean; reason?: string }[] = [];
  endArgs?: ['A' | 'B' | 'draw', string];

  decide(state: MatchState): AgentAction {
    this.decisions.push(state);
    return { type: 'pass', confidence: 1.0 };
  }

  onHello(matchId: string, side: 'A' | 'B', seed: string) {
    this.helloArgs = [matchId, side, seed];
  }

  onAck(accepted: boolean, reason?: string) {
    this.ackResults.push({ accepted, reason });
  }

  onEnd(winner: 'A' | 'B' | 'draw', reason: string) {
    this.endArgs = [winner, reason];
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function helloFrame(overrides: Partial<object> = {}) {
  return {
    type: 'HELLO',
    matchId: 'match-1',
    side: 'A',
    seed: 'seed-abc',
    boardSize: { width: 9, height: 9 },
    timeBudgetMs: 5000,
    turnCap: 50,
    protocolVersion: '1.0',
    ...overrides,
  };
}

function stateFrame(overrides: Partial<object> = {}) {
  return {
    type: 'STATE',
    turn: 1,
    yourTurn: true,
    visible: [],
    units: [],
    score: { a: 0, b: 0 },
    deadline: Date.now() + 5000,
    ...overrides,
  };
}

function endFrame(overrides: Partial<object> = {}) {
  return {
    type: 'END',
    winner: 'A' as const,
    reason: 'elimination' as const,
    finalScore: { a: 10, b: 0 },
    metrics: { totalActions: 5, avgDecisionMs: 12, invalidActions: 0 },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runAgent', () => {
  let origWs: typeof globalThis.WebSocket;

  beforeEach(() => {
    origWs = globalThis.WebSocket;
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as never;
  });

  afterEach(() => {
    globalThis.WebSocket = origWs;
  });

  it('sends READY after receiving HELLO and calls agent.onHello', async () => {
    const agent = new TestAgent('test-agent', '1.0');
    const p = runAgent(agent, 'ws://localhost:8080/game');

    await new Promise(resolve => setTimeout(resolve, 0));

    const ws = MockWebSocket.instances[0];
    ws.serverSend(helloFrame({ matchId: 'match-42', side: 'B', seed: 'xyz' }));
    ws.serverSend(endFrame());

    await p;

    const frames = ws.sentFrames.map(f => JSON.parse(f));
    const readyFrame = frames.find(f => f.type === 'READY');
    expect(readyFrame).toBeTruthy();
    expect(readyFrame.agentId).toBe('test-agent');
    expect(readyFrame.agentVersion).toBe('1.0');
    expect(agent.helloArgs).toEqual(['match-42', 'B', 'xyz']);
  });

  it('calls agent.decide on STATE and sends ACTION', async () => {
    const agent = new TestAgent('test-agent', '1.0');
    const p = runAgent(agent, 'ws://localhost:8080/game');

    await new Promise(resolve => setTimeout(resolve, 0));

    const ws = MockWebSocket.instances[0];
    ws.serverSend(helloFrame());
    ws.serverSend(stateFrame({ turn: 5, yourTurn: true }));
    ws.serverSend(endFrame());

    await p;

    const frames = ws.sentFrames.map(f => JSON.parse(f));
    const actionFrame = frames.find(f => f.type === 'ACTION');
    expect(actionFrame).toBeTruthy();
    expect(actionFrame.action).toBe('pass');
    expect(agent.decisions).toHaveLength(1);
    expect(agent.decisions[0].turn).toBe(5);
  });

  it('relays ACK to agent.onAck', async () => {
    const agent = new TestAgent('test-agent', '1.0');
    const p = runAgent(agent, 'ws://localhost:8080/game');

    const ws = MockWebSocket.instances[0];
    ws.serverSend(helloFrame());
    ws.serverSend(stateFrame());
    ws.serverSend({ type: 'ACK', accepted: true, reason: 'invalid_action' });
    ws.serverSend(endFrame());

    await p;

    expect(agent.ackResults).toHaveLength(1);
    expect(agent.ackResults[0]).toEqual({ accepted: true, reason: 'invalid_action' });
  });

  it('calls agent.onEnd on END frame and resolves', async () => {
    const agent = new TestAgent('test-agent', '1.0');
    let resolved = false;
    const p = runAgent(agent, 'ws://localhost:8080/game').then(() => { resolved = true; });

    const ws = MockWebSocket.instances[0];
    ws.serverSend(helloFrame());
    ws.serverSend(stateFrame());
    ws.serverSend(endFrame({ winner: 'B', reason: 'turn_cap', finalScore: { a: 0, b: 15 } }));

    await p;
    expect(resolved).toBe(true);
    expect(agent.endArgs).toEqual(['B', 'turn_cap']);
  });

  it('rejects when WebSocket errors', async () => {
    const agent = new TestAgent('test-agent', '1.0');
    const p = runAgent(agent, 'ws://localhost:8080/game');

    const ws = MockWebSocket.instances[0];
    ws.serverSend(helloFrame());
    ws.serverError(new Error('ECONNRESET'));

    await expect(p).rejects.toThrow(/ECONNRESET/);
  });

  it('rejects when WS closes before HELLO', async () => {
    const agent = new TestAgent('test-agent', '1.0');
    const p = runAgent(agent, 'ws://localhost:8080/game');

    const ws = MockWebSocket.instances[0];
    ws.close();

    await expect(p).rejects.toThrow(/WebSocket closed before HELLO/);
  });

  it('passes non-HELLO/STATE/ACK/EVENT/END frames through without crashing', async () => {
    const agent = new TestAgent('test-agent', '1.0');
    const p = runAgent(agent, 'ws://localhost:8080/game');

    const ws = MockWebSocket.instances[0];
    ws.serverSend(helloFrame());
    ws.serverSend(stateFrame());
    // unknown frame type — should be silently ignored
    ws.serverSend({ type: 'PING', foo: 'bar' });
    ws.serverSend(endFrame());

    await p;
    expect(agent.endArgs).toBeTruthy();
  });
});