// task-035-ws-protocol | phase C | writes: src/gateway/protocol.ts

import { describe, it, expect, vi } from 'vitest';
import { sendFrame, parseFrame, isValidFrame } from '../../src/gateway/protocol.js';
import type { HelloFrame, StateFrame, AckFrame, EventFrame, EndFrame, ReadyFrame, ActionFrame } from '../../src/gateway/contract.js';

const mockWs = () => {
  const msgs: unknown[] = [];
  return {
    send: vi.fn((msg: unknown) => msgs.push(msg)),
    _msgs: msgs,
  };
};

describe('task-035-ws-protocol', () => {

  describe('sendFrame', () => {
    it('serializes and sends a HelloFrame', () => {
      const ws = mockWs();
      const frame: HelloFrame = {
        type: 'HELLO',
        matchId: 'match-1',
        side: 'A',
        seed: 'abc123',
        boardSize: { width: 7, height: 7 },
        timeBudgetMs: 5000,
        turnCap: 150,
        protocolVersion: '1.0',
      };
      sendFrame(ws as unknown as WebSocket, frame);
      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse((ws.send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
      expect(sent.type).toBe('HELLO');
      expect(sent.matchId).toBe('match-1');
    });
  });

  describe('parseFrame', () => {
    it('parses a valid HelloFrame string', () => {
      const raw = JSON.stringify({ type: 'HELLO', matchId: 'm1', side: 'B', seed: 'x', boardSize: { width: 9, height: 9 }, timeBudgetMs: 3000, turnCap: 100, protocolVersion: '1.0' });
      const frame = parseFrame(raw);
      expect(frame).not.toBeNull();
      expect((frame as HelloFrame).type).toBe('HELLO');
      expect((frame as HelloFrame).side).toBe('B');
    });

    it('parses a valid ReadyFrame string', () => {
      const raw = JSON.stringify({ type: 'READY', agentId: 'agent-1', agentVersion: '1.0.0' });
      const frame = parseFrame(raw);
      expect(frame).not.toBeNull();
      expect((frame as ReadyFrame).type).toBe('READY');
      expect((frame as ReadyFrame).agentId).toBe('agent-1');
    });

    it('parses a valid ActionFrame string', () => {
      const raw = JSON.stringify({ type: 'ACTION', action: 'move', from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: 0, s: -1 }, confidence: 0.95 });
      const frame = parseFrame(raw);
      expect(frame).not.toBeNull();
      expect((frame as ActionFrame).type).toBe('ACTION');
      expect((frame as ActionFrame).action).toBe('move');
      expect((frame as ActionFrame).confidence).toBe(0.95);
    });

    it('parses a Buffer', () => {
      const buf = Buffer.from(JSON.stringify({ type: 'HELLO', matchId: 'm2', side: 'A', seed: 'y', boardSize: { width: 7, height: 7 }, timeBudgetMs: 5000, turnCap: 150, protocolVersion: '1.0' }));
      const frame = parseFrame(buf);
      expect(frame).not.toBeNull();
      expect((frame as HelloFrame).matchId).toBe('m2');
    });

    it('returns null for invalid JSON', () => {
      expect(parseFrame('not json')).toBeNull();
    });

    it('returns null for missing type', () => {
      expect(parseFrame('{"foo":"bar"}')).toBeNull();
    });

    it('returns null for unknown type', () => {
      expect(parseFrame('{"type":"UNKNOWN"}')).toBeNull();
    });
  });

  describe('isValidFrame', () => {
    it('accepts a valid HelloFrame', () => {
      const frame: HelloFrame = { type: 'HELLO', matchId: 'm1', side: 'A', seed: 'x', boardSize: { width: 7, height: 7 }, timeBudgetMs: 5000, turnCap: 150, protocolVersion: '1.0' };
      expect(isValidFrame(frame)).toBe(true);
    });

    it('rejects a HelloFrame with missing required fields', () => {
      const frame = { type: 'HELLO', matchId: 'm1' };
      expect(isValidFrame(frame)).toBe(false);
    });

    it('accepts a valid ReadyFrame', () => {
      const frame: ReadyFrame = { type: 'READY', agentId: 'a1', agentVersion: '1.0' };
      expect(isValidFrame(frame)).toBe(true);
    });

    it('rejects a ReadyFrame missing agentId', () => {
      const frame = { type: 'READY', agentVersion: '1.0' };
      expect(isValidFrame(frame)).toBe(false);
    });

    it('accepts a valid ActionFrame', () => {
      const frame: ActionFrame = { type: 'ACTION', action: 'pass', confidence: 0.8 };
      expect(isValidFrame(frame)).toBe(true);
    });

    it('rejects an ActionFrame with invalid action type', () => {
      const frame = { type: 'ACTION', action: 'teleport', confidence: 1.0 };
      expect(isValidFrame(frame)).toBe(false);
    });

    it('accepts a valid StateFrame', () => {
      const frame: StateFrame = { type: 'STATE', turn: 5, yourTurn: true, visible: [], units: [], score: { a: 10, b: 8 }, deadline: Date.now() };
      expect(isValidFrame(frame)).toBe(true);
    });

    it('accepts a valid AckFrame', () => {
      const frame: AckFrame = { type: 'ACK', accepted: true };
      expect(isValidFrame(frame)).toBe(true);
    });

    it('accepts a valid EventFrame', () => {
      const frame: EventFrame = { type: 'EVENT', event: 'unit_moved', payload: {}, timestamp: Date.now() };
      expect(isValidFrame(frame)).toBe(true);
    });

    it('accepts a valid EndFrame', () => {
      const frame: EndFrame = {
        type: 'END', winner: 'A', reason: 'elimination',
        finalScore: { a: 100, b: 0 },
        metrics: { totalActions: 42, avgDecisionMs: 50, invalidActions: 1 },
      };
      expect(isValidFrame(frame)).toBe(true);
    });

    it('rejects null', () => {
      expect(isValidFrame(null)).toBe(false);
    });

    it('rejects a plain object without type', () => {
      expect(isValidFrame({ foo: 'bar' })).toBe(false);
    });
  });

  describe('round-trip: sendFrame → parseFrame', () => {
    it('preserves all HelloFrame fields', () => {
      const ws = mockWs();
      const frame: HelloFrame = {
        type: 'HELLO', matchId: 'match-roundtrip', side: 'B', seed: 's3ed',
        boardSize: { width: 11, height: 9 }, timeBudgetMs: 8000, turnCap: 200,
        protocolVersion: '1.0',
      };
      sendFrame(ws as unknown as WebSocket, frame);
      const json = (ws.send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = parseFrame(json);
      expect(parsed).toEqual(frame);
    });

    it('preserves all ActionFrame fields including optional from/to', () => {
      const ws = mockWs();
      const frame: ActionFrame = {
        type: 'ACTION', action: 'attack',
        from: { q: 2, r: -1, s: -1 }, to: { q: 3, r: -1, s: -2 },
        confidence: 0.99,
        metadata: { reasoning: 'best move' },
      };
      sendFrame(ws as unknown as WebSocket, frame);
      const json = (ws.send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = parseFrame(json);
      expect(parsed).toEqual(frame);
    });
  });

});