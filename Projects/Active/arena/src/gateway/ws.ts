// HexaWars WebSocket Handler (Plan D v2)

import type { Server as HTTPServer } from 'node:http';
import { agentSessionManager } from './session.js';
import { presenceTracker } from '../matchmaker/presence.js';
import type { HelloFrame, ReadyFrame, PlanFrame, StateFrame, AckFrame, EventFrame, EndFrame } from './contract.js';
import { PROTOCOL_VERSION } from './contract.js';
import type { HexCell, Unit, AgentRoundBudget } from '../shared/types.js';
import { getOperatorByToken } from '../identity/operator.js';
import { createLimiter, type RateLimiter } from '../identity/rate-limit.js';
import type { Database } from 'bun:sqlite';

// Bun.serve WebSocket payload types
interface WSData {
  sessionId: string;
  matchId: string;
  side: 'A' | 'B';
  operatorId: number;
}

type WSPayload = string | Buffer | ArrayBuffer | Uint8Array;

// Authenticated handler factory — must be called once at server boot with the db instance
let _authDb: Database | null = null;

// Per-operator WS connection rate limiter: 5 connections per rolling minute
const wsOperatorLimiter: RateLimiter = createLimiter({ max: 5, windowMs: 60_000 });

// Export for test reset
export { wsOperatorLimiter };

export function configureWsAuth(db: Database): void {
  _authDb = db;
}

export function buildHelloFrame(matchId: string, side: 'A' | 'B', seed: string, boardSize: { width: number; height: number }, timeBudgetMs: number): HelloFrame {
  return {
    type: 'HELLO',
    matchId,
    side,
    seed,
    boardSize,
    timeBudgetMs,
    protocolVersion: PROTOCOL_VERSION,
  };
}

export function handleWs(req: Request, server: HTTPServer): Response {
  // Authenticate via bearer token query param: ?token=<id>.<secret>
  if (!_authDb) {
    return new Response('WS auth not configured', { status: 500 });
  }
  const url = new URL(req.url);
  const rawToken = url.searchParams.get('token');
  if (!rawToken) {
    return new Response('Missing token', { status: 401 });
  }
  const operator = getOperatorByToken(_authDb, rawToken);
  if (!operator) {
    return new Response('Invalid token', { status: 401 });
  }

  // Per-operator WS connection rate limit: 5 per rolling minute
  const rateCheck = wsOperatorLimiter.check(String(operator.id));
  if (!rateCheck.ok) {
    return new Response('Connection rate limit exceeded', {
      status: 429,
      headers: { 'Retry-After': String(rateCheck.retryAfterSec) },
    });
  }

  // Extract sessionId and matchId from URL search params
  const sessionId = url.searchParams.get('sessionId') ?? crypto.randomUUID();
  const matchId = url.searchParams.get('matchId') ?? 'default-match';
  const side = (url.searchParams.get('side') as 'A' | 'B') ?? 'A';

  // Create agent session
  agentSessionManager.createSession(sessionId, matchId, side);

  // Wire presence: operator is authenticated and WS connection is established
  presenceTracker.connect(operator.id);

  // Build the WebSocket upgrade response using Bun's upgrade API
  if (!req.headers.get('upgrade')?.toLowerCase().includes('websocket')) {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const upgraded = (server as unknown as {
    [key: symbol]: ((req: Request, opts: { data: WSData }) => unknown) | undefined;
  })[Symbol.for('upgrade')]?.(req, {
    data: { sessionId, matchId, side, operatorId: operator.id } as WSData,
  });

  if (!upgraded) {
    // Fallback: construct upgrade manually via Response with upgrade headers
    const headers = new Headers({
      Upgrade: 'websocket',
      Connection: 'Upgrade',
      'Sec-WebSocket-Key': req.headers.get('sec-websocket-key') ?? '',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Protocol': 'hexawars-v2',
    });

    return new Response(null, { status: 101, headers });
  }

  return new Response(null, { status: 101 });
}

// Register WebSocket handlers on a Bun.serve instance
export function registerWsHandlers(
  bunServer: {
    upgrade?: (req: Request, opts: { data: WSData; headers?: Headers }) => unknown;
    websocket?: {
      open?: (ws: WebSocket, req: Request) => void;
      close?: (ws: WebSocket, code: number, reason: string) => void;
      message?: (ws: WebSocket, data: string | Buffer) => void;
    };
  },
  opts: {
    boardSize?: { width: number; height: number };
    timeBudgetMs?: number;
    seed?: string;
  } = {}
): void {
  const { boardSize = { width: 7, height: 7 }, timeBudgetMs = 5000, seed = crypto.randomUUID() } = opts;

  // Wire presence disconnect into Bun.serve's websocket close handler
  if (bunServer.websocket) {
    const origClose = bunServer.websocket.close;
    bunServer.websocket.close = (ws: WebSocket, code: number, reason: string) => {
      const data = (ws as any).data as WSData | undefined;
      if (data?.operatorId) {
        presenceTracker.disconnect(Number(data.operatorId));
      }
      origClose?.call(bunServer.websocket, ws, code, reason);
    };
  }
}

// Send a frame over a WebSocket
export function sendFrame<T extends object>(ws: WebSocket, frame: T): void {
  ws.send(JSON.stringify(frame));
}

// Parse an incoming frame — dispatches to typed unions
export function parseFrame(raw: WSPayload): ReadyFrame | PlanFrame | null {
  try {
    const parsed = JSON.parse(raw.toString());
    if (parsed.type === 'READY') return parsed as ReadyFrame;
    if (parsed.type === 'PLAN') return parsed as PlanFrame;
    return null;
  } catch {
    return null;
  }
}

// Build a STATE frame
export function buildStateFrame(
  turn: number,
  visible: HexCell[],
  units: Unit[],
  score: { a: number; b: number },
  deadline: number,
  roundCap: number,
  budget: AgentRoundBudget,
): StateFrame {
  return { type: 'STATE', turn, visible, units, score, deadline, roundCap, budget };
}

// Build an ACK frame
export function buildAckFrame(accepted: boolean, reason?: string): AckFrame {
  return { type: 'ACK', accepted, reason: reason as AckFrame['reason'] };
}

// Build an END frame
export function buildEndFrame(winner: 'A' | 'B' | 'draw' | null, reason: string, finalScore: { a: number; b: number }, metrics: { totalActions: number; avgDecisionMs: number; invalidActions: number }): EndFrame {
  return { type: 'END', winner, reason: reason as EndFrame['reason'], finalScore, metrics };
}
