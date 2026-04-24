// HexaWars WebSocket Frame Protocol (Plan D v2)

import type {
  HelloFrame,
  ReadyFrame,
  PlanFrame,
  StateFrame,
  AckFrame,
  EventFrame,
  EndFrame,
} from './contract.js';

// ─── Union Types ────────────────────────────────────────────────────────────

export type ServerFrame = HelloFrame | StateFrame | AckFrame | EventFrame | EndFrame;
export type ClientFrame = ReadyFrame | PlanFrame;
export type WsFrame = ServerFrame | ClientFrame;

// ─── sendFrame ─────────────────────────────────────────────────────────────

export function sendFrame(ws: WebSocket, frame: WsFrame): void {
  ws.send(JSON.stringify(frame));
}

// ─── parseFrame ───────────────────────────────────────────────────────────

export function parseFrame(data: string | Buffer | ArrayBuffer): WsFrame | null {
  try {
    const raw =
      typeof data === 'string'
        ? data
        : data instanceof ArrayBuffer
          ? new TextDecoder().decode(data)
          : Buffer.from(data).toString();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.type || typeof parsed.type !== 'string') return null;

    switch (parsed.type) {
      case 'HELLO':
      case 'STATE':
      case 'ACK':
      case 'EVENT':
      case 'END':
      case 'READY':
      case 'PLAN':
        return parsed as WsFrame;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ─── isValidFrame ────────────────────────────────────────────────────────

function hasOwnProperty(obj: unknown, key: string): boolean {
  return obj !== null && typeof obj === 'object' && key in obj;
}

function validateHelloFrame(frame: HelloFrame): boolean {
  return (
    typeof frame.type === 'string' &&
    frame.type === 'HELLO' &&
    typeof frame.matchId === 'string' &&
    (frame.side === 'A' || frame.side === 'B') &&
    typeof frame.seed === 'string' &&
    typeof frame.boardSize === 'object' &&
    typeof frame.boardSize.width === 'number' &&
    typeof frame.boardSize.height === 'number' &&
    typeof frame.timeBudgetMs === 'number' &&
    typeof frame.protocolVersion === 'string'
  );
}

function validateStateFrame(frame: StateFrame): boolean {
  return (
    typeof frame.type === 'string' &&
    frame.type === 'STATE' &&
    typeof frame.turn === 'number' &&
    typeof frame.roundCap === 'number' &&
    Array.isArray(frame.visible) &&
    Array.isArray(frame.units) &&
    typeof frame.score === 'object' &&
    typeof frame.score.a === 'number' &&
    typeof frame.score.b === 'number' &&
    typeof frame.deadline === 'number' &&
    typeof frame.budget === 'object' &&
    typeof frame.budget.apPool === 'number' &&
    typeof frame.budget.apCarry === 'number' &&
    typeof frame.budget.freeMove === 'number' &&
    typeof frame.budget.freeAction === 'number'
  );
}

function validateAckFrame(frame: AckFrame): boolean {
  return (
    typeof frame.type === 'string' &&
    frame.type === 'ACK' &&
    typeof frame.accepted === 'boolean'
  );
}

function validateEventFrame(frame: EventFrame): boolean {
  return (
    typeof frame.type === 'string' &&
    frame.type === 'EVENT' &&
    typeof frame.event === 'string' &&
    typeof frame.payload === 'object' &&
    typeof frame.timestamp === 'number'
  );
}

function validateEndFrame(frame: EndFrame): boolean {
  return (
    typeof frame.type === 'string' &&
    frame.type === 'END' &&
    (frame.winner === 'A' || frame.winner === 'B' || frame.winner === 'draw' || frame.winner === null) &&
    typeof frame.reason === 'string' &&
    typeof frame.metrics === 'object' &&
    typeof frame.metrics.totalActions === 'number' &&
    typeof frame.metrics.avgDecisionMs === 'number' &&
    typeof frame.metrics.invalidActions === 'number'
  );
}

function validateReadyFrame(frame: ReadyFrame): boolean {
  return (
    typeof frame.type === 'string' &&
    frame.type === 'READY' &&
    typeof frame.agentId === 'string' &&
    typeof frame.agentVersion === 'string'
  );
}

function validatePlanFrame(frame: PlanFrame): boolean {
  if (typeof frame.type !== 'string' || frame.type !== 'PLAN') return false;
  if (typeof frame.confidence !== 'number') return false;
  const plan = frame.plan;
  if (!plan || typeof plan !== 'object') return false;
  if (typeof plan.bid !== 'number') return false;
  if (!Array.isArray(plan.extras)) return false;
  return true;
}

export function isValidFrame(frame: unknown): frame is WsFrame {
  if (!frame || typeof frame !== 'object') return false;
  if (!hasOwnProperty(frame, 'type')) return false;

  const f = frame as Record<string, unknown>;

  switch (f.type) {
    case 'HELLO': return validateHelloFrame(frame as HelloFrame);
    case 'STATE': return validateStateFrame(frame as StateFrame);
    case 'ACK': return validateAckFrame(frame as AckFrame);
    case 'EVENT': return validateEventFrame(frame as EventFrame);
    case 'END': return validateEndFrame(frame as EndFrame);
    case 'READY': return validateReadyFrame(frame as ReadyFrame);
    case 'PLAN': return validatePlanFrame(frame as PlanFrame);
    default: return false;
  }
}
