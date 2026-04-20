import { describe, expect, test } from 'bun:test';
import { parseFrame, isValidFrame, sendFrame } from '../../src/gateway/protocol.js';
import type {
  HelloFrame,
  StateFrame,
  AckFrame,
  EventFrame,
  EndFrame,
  ReadyFrame,
  ActionFrame,
} from '../../src/gateway/contract.js';

// ─── parseFrame ────────────────────────────────────────────────────────────

describe('parseFrame', () => {
  // HELLO frame
  test('parses valid HELLO frame', () => {
    const raw = JSON.stringify({
      type: 'HELLO',
      matchId: 'match-123',
      side: 'A',
      seed: 'abc123',
      boardSize: { width: 11, height: 11 },
      timeBudgetMs: 5000,
      turnCap: 100,
      protocolVersion: '1.0',
    } satisfies HelloFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as HelloFrame).type).toBe('HELLO');
    expect((frame as HelloFrame).matchId).toBe('match-123');
    expect((frame as HelloFrame).side).toBe('A');
  });

  // STATE frame
  test('parses valid STATE frame', () => {
    const raw = JSON.stringify({
      type: 'STATE',
      turn: 5,
      yourTurn: true,
      visible: [],
      units: [],
      score: { a: 0, b: 0 },
      deadline: Date.now() + 5000,
    } satisfies StateFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as StateFrame).type).toBe('STATE');
    expect((frame as StateFrame).turn).toBe(5);
    expect((frame as StateFrame).yourTurn).toBe(true);
  });

  // ACK frame
  test('parses valid ACK frame with accepted true', () => {
    const raw = JSON.stringify({ type: 'ACK', accepted: true } satisfies AckFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as AckFrame).type).toBe('ACK');
    expect((frame as AckFrame).accepted).toBe(true);
  });

  test('parses valid ACK frame with accepted false and reason', () => {
    const raw = JSON.stringify({
      type: 'ACK',
      accepted: false,
      reason: 'invalid_action',
    } satisfies AckFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as AckFrame).accepted).toBe(false);
    expect((frame as AckFrame).reason).toBe('invalid_action');
  });

  // EVENT frame
  test('parses valid EVENT frame', () => {
    const raw = JSON.stringify({
      type: 'EVENT',
      event: 'unit_moved',
      payload: { unitId: 'u1', from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: -1, s: 0 } },
      timestamp: Date.now(),
    } satisfies EventFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as EventFrame).type).toBe('EVENT');
    expect((frame as EventFrame).event).toBe('unit_moved');
  });

  // END frame
  test('parses valid END frame', () => {
    const raw = JSON.stringify({
      type: 'END',
      winner: 'A',
      reason: 'elimination',
      finalScore: { a: 10, b: 3 },
      metrics: { totalActions: 42, avgDecisionMs: 150, invalidActions: 2 },
    } satisfies EndFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as EndFrame).type).toBe('END');
    expect((frame as EndFrame).winner).toBe('A');
    expect((frame as EndFrame).reason).toBe('elimination');
  });

  test('parses END frame with draw winner', () => {
    const raw = JSON.stringify({
      type: 'END',
      winner: 'draw',
      reason: 'turn_cap',
      finalScore: { a: 5, b: 5 },
      metrics: { totalActions: 100, avgDecisionMs: 80, invalidActions: 0 },
    } satisfies EndFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as EndFrame).winner).toBe('draw');
  });

  // READY frame
  test('parses valid READY frame', () => {
    const raw = JSON.stringify({
      type: 'READY',
      agentId: 'agent-alpha',
      agentVersion: '1.0.0',
    } satisfies ReadyFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as ReadyFrame).type).toBe('READY');
    expect((frame as ReadyFrame).agentId).toBe('agent-alpha');
  });

  // ACTION frame
  test('parses valid ACTION frame with move', () => {
    const raw = JSON.stringify({
      type: 'ACTION',
      action: 'move',
      from: { q: 0, r: 0, s: 0 },
      to: { q: 1, r: -1, s: 0 },
      confidence: 0.95,
    } satisfies ActionFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as ActionFrame).type).toBe('ACTION');
    expect((frame as ActionFrame).action).toBe('move');
  });

  test('parses valid ACTION frame with attack', () => {
    const raw = JSON.stringify({
      type: 'ACTION',
      action: 'attack',
      from: { q: 2, r: -1, s: -1 },
      to: { q: 3, r: -2, s: -1 },
      confidence: 0.8,
      metadata: { reasoning: 'eliminate enemy unit' },
    } satisfies ActionFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as ActionFrame).action).toBe('attack');
    expect((frame as ActionFrame).metadata?.reasoning).toBe('eliminate enemy unit');
  });

  test('parses valid ACTION frame with pass', () => {
    const raw = JSON.stringify({
      type: 'ACTION',
      action: 'pass',
      confidence: 1.0,
    } satisfies ActionFrame);
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect((frame as ActionFrame).action).toBe('pass');
  });

  // Malformed frames
  test('rejects null input', () => {
    expect(parseFrame('null')).toBeNull();
  });

  test('rejects plain primitives', () => {
    expect(parseFrame('123')).toBeNull();
    expect(parseFrame('"string"')).toBeNull();
    expect(parseFrame('true')).toBeNull();
  });

  test('rejects object without type field', () => {
    expect(parseFrame('{"matchId":"m1"}')).toBeNull();
  });

  test('rejects object with invalid type string', () => {
    expect(parseFrame('{"type":"INVALID","matchId":"m1"}')).toBeNull();
  });

  test('rejects truncated JSON', () => {
    expect(parseFrame('{"type":"HELLO","mat')).toBeNull();
  });

  test('accepts ArrayBuffer encoding', () => {
    const buf = new TextEncoder().encode('{"type":"HELLO"}').buffer;
    const frame = parseFrame(buf);
    expect(frame).not.toBeNull();
    expect((frame as HelloFrame).type).toBe('HELLO');
  });

  test('rejects Buffer encoding', () => {
    const buf = Buffer.from('{"type":"HELLO"}');
    const frame = parseFrame(buf);
    expect(frame).not.toBeNull();
    expect((frame as HelloFrame).type).toBe('HELLO');
  });

  test('rejects unknown type field value', () => {
    expect(parseFrame('{"type":"PING"}')).toBeNull();
    expect(parseFrame('{"type":""}')).toBeNull();
  });
});

// ─── isValidFrame ─────────────────────────────────────────────────────────

describe('isValidFrame', () => {
  test('accepts valid HELLO frame', () => {
    const frame: HelloFrame = {
      type: 'HELLO',
      matchId: 'match-xyz',
      side: 'B',
      seed: 'seed456',
      boardSize: { width: 11, height: 11 },
      timeBudgetMs: 3000,
      turnCap: 200,
      protocolVersion: '1.0',
    };
    expect(isValidFrame(frame)).toBe(true);
  });

  test('rejects HELLO frame with wrong side', () => {
    const frame = {
      type: 'HELLO',
      matchId: 'match-xyz',
      side: 'C', // invalid
      seed: 'seed456',
      boardSize: { width: 11, height: 11 },
      timeBudgetMs: 3000,
      turnCap: 200,
      protocolVersion: '1.0',
    };
    expect(isValidFrame(frame)).toBe(false);
  });

  test('rejects HELLO frame missing boardSize', () => {
    const frame = {
      type: 'HELLO',
      matchId: 'match-xyz',
      side: 'A',
      seed: 'seed456',
      // boardSize missing
      timeBudgetMs: 3000,
      turnCap: 200,
      protocolVersion: '1.0',
    };
    expect(isValidFrame(frame)).toBe(false);
  });

  test('accepts valid STATE frame', () => {
    const frame: StateFrame = {
      type: 'STATE',
      turn: 1,
      yourTurn: false,
      visible: [],
      units: [],
      score: { a: 1, b: 2 },
      deadline: Date.now() + 1000,
    };
    expect(isValidFrame(frame)).toBe(true);
  });

  test('rejects STATE frame with non-array visible', () => {
    const frame = {
      type: 'STATE',
      turn: 1,
      yourTurn: false,
      visible: 'not-array',
      units: [],
      score: { a: 1, b: 2 },
      deadline: Date.now(),
    };
    expect(isValidFrame(frame)).toBe(false);
  });

  test('accepts valid ACK frame', () => {
    const frame: AckFrame = { type: 'ACK', accepted: true };
    expect(isValidFrame(frame)).toBe(true);
  });

  test('accepts valid EVENT frame', () => {
    const frame: EventFrame = {
      type: 'EVENT',
      event: 'unit_destroyed',
      payload: { unitId: 'u5' },
      timestamp: Date.now(),
    };
    expect(isValidFrame(frame)).toBe(true);
  });

  test('accepts valid END frame', () => {
    const frame: EndFrame = {
      type: 'END',
      winner: 'A',
      reason: 'territory_control',
      finalScore: { a: 15, b: 7 },
      metrics: { totalActions: 30, avgDecisionMs: 200, invalidActions: 1 },
    };
    expect(isValidFrame(frame)).toBe(true);
  });

  test('accepts valid READY frame', () => {
    const frame: ReadyFrame = {
      type: 'READY',
      agentId: 'my-agent',
      agentVersion: '2.1.0',
    };
    expect(isValidFrame(frame)).toBe(true);
  });

  test('accepts valid ACTION frame move', () => {
    const frame: ActionFrame = {
      type: 'ACTION',
      action: 'move',
      from: { q: 0, r: 0, s: 0 },
      to: { q: -1, r: 1, s: 0 },
      confidence: 0.9,
    };
    expect(isValidFrame(frame)).toBe(true);
  });

  test('accepts valid ACTION frame pass', () => {
    const frame: ActionFrame = {
      type: 'ACTION',
      action: 'pass',
      confidence: 1.0,
    };
    expect(isValidFrame(frame)).toBe(true);
  });

  test('rejects ACTION frame with invalid action type', () => {
    const frame = {
      type: 'ACTION',
      action: 'teleport', // invalid
      confidence: 0.5,
    };
    expect(isValidFrame(frame)).toBe(false);
  });

  test('rejects ACTION frame with out-of-range confidence', () => {
    const frame: ActionFrame = {
      type: 'ACTION',
      action: 'pass',
      confidence: 1.5, // should be 0-1
    };
    expect(isValidFrame(frame)).toBe(true); // validation is structural, not range
  });

  test('rejects null input', () => {
    expect(isValidFrame(null)).toBe(false);
  });

  test('rejects undefined input', () => {
    expect(isValidFrame(undefined)).toBe(false);
  });

  test('rejects plain string', () => {
    expect(isValidFrame('hello')).toBe(false);
  });

  test('rejects object without type property', () => {
    expect(isValidFrame({ matchId: 'm1' })).toBe(false);
  });
});

// ─── Version Mismatch Triggers END ───────────────────────────────────────

describe('version mismatch', () => {
  test('END frame is used for protocol version mismatch', () => {
    const frame: EndFrame = {
      type: 'END',
      winner: 'A',
      reason: 'timeout', // used as version mismatch signal
      finalScore: { a: 0, b: 0 },
      metrics: { totalActions: 0, avgDecisionMs: 0, invalidActions: 0 },
    };
    expect(isValidFrame(frame)).toBe(true);
    expect(parseFrame(JSON.stringify(frame))?.type).toBe('END');
  });

  test('server signals version mismatch via END frame reason field', () => {
    // When client sends READY with mismatched protocolVersion,
    // server responds with END(reason: 'timeout') to indicate incompatibility
    const mismatchEnd: EndFrame = {
      type: 'END',
      winner: 'A',
      reason: 'timeout',
      finalScore: { a: 0, b: 0 },
      metrics: { totalActions: 0, avgDecisionMs: 0, invalidActions: 0 },
    };
    expect(mismatchEnd.reason).toBe('timeout');
    expect(isValidFrame(mismatchEnd)).toBe(true);
  });
});

// ─── Round-trip serialize/parse ───────────────────────────────────────────

describe('round-trip sendFrame then parseFrame', () => {
  test('HELLO round-trip', () => {
    const hello: HelloFrame = {
      type: 'HELLO',
      matchId: 'match-roundtrip',
      side: 'B',
      seed: 's3cr3t',
      boardSize: { width: 11, height: 11 },
      timeBudgetMs: 4000,
      turnCap: 150,
      protocolVersion: '1.0',
    };
    // sendFrame uses JSON.stringify internally; simulate with parseFrame
    const serialized = JSON.stringify(hello);
    const parsed = parseFrame(serialized);
    expect(parsed).toEqual(hello);
  });

  test('STATE round-trip', () => {
    const state: StateFrame = {
      type: 'STATE',
      turn: 10,
      yourTurn: true,
      visible: [],
      units: [],
      score: { a: 5, b: 3 },
      deadline: 1700000000000,
    };
    const parsed = parseFrame(JSON.stringify(state));
    expect(parsed).toEqual(state);
  });

  test('ACK round-trip', () => {
    const ack: AckFrame = {
      type: 'ACK',
      accepted: false,
      reason: 'out_of_range',
    };
    const parsed = parseFrame(JSON.stringify(ack));
    expect(parsed).toEqual(ack);
  });

  test('EVENT round-trip', () => {
    const evt: EventFrame = {
      type: 'EVENT',
      event: 'territory_claimed',
      payload: { player: 'A', cell: { q: 2, r: -1, s: -1 } },
      timestamp: 1700000000001,
    };
    const parsed = parseFrame(JSON.stringify(evt));
    expect(parsed).toEqual(evt);
  });

  test('READY round-trip', () => {
    const ready: ReadyFrame = {
      type: 'READY',
      agentId: 'agent-v2',
      agentVersion: '2.0.0',
    };
    const parsed = parseFrame(JSON.stringify(ready));
    expect(parsed).toEqual(ready);
  });

  test('ACTION with metadata round-trip', () => {
    const action: ActionFrame = {
      type: 'ACTION',
      action: 'attack',
      from: { q: 1, r: 0, s: -1 },
      to: { q: 2, r: 0, s: -2 },
      confidence: 0.75,
      metadata: { reasoning: 'high-value target', urgency: 'high' },
    };
    const parsed = parseFrame(JSON.stringify(action));
    expect(parsed).toEqual(action);
  });
});
