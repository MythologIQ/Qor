import { describe, test, expect, beforeEach } from 'bun:test';
import { handleWs, configureWsAuth, wsOperatorLimiter } from '../../src/gateway/ws';
import { openDb, initDb } from '../../src/persistence/db';
import { createOperator } from '../../src/identity/operator';
import type { Database } from 'bun:sqlite';

const MATCH_ID = 'match-ratelimit-001';
const SESSION_ID_BASE = 'session-ratelimit-001';

function mockServer(): any {
  return {};
}

function buildReq(token: string, sessionId?: string): Request {
  const params = new URLSearchParams();
  params.set('token', token);
  params.set('matchId', MATCH_ID);
  params.set('sessionId', sessionId ?? SESSION_ID_BASE);
  params.set('side', 'A');
  const url = `http://localhost:3000/ws?${params.toString()}`;
  const headers = new Headers({
    Upgrade: 'websocket',
    'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
  });
  return new Request(url, { method: 'GET', headers });
}

describe('WS Rate Limit — handleWs', () => {
  let db: Database;
  let operatorA: ReturnType<typeof createOperator>;
  let operatorB: ReturnType<typeof createOperator>;

  beforeEach(() => {
    db = openDb(':memory:');
    initDb(db);
    configureWsAuth(db);
    operatorA = createOperator(db, 'RatelimitAgentA');
    operatorB = createOperator(db, 'RatelimitAgentB');
    wsOperatorLimiter.resetAll();
  });

  test('5 connections pass for the same operator', async () => {
    for (let i = 0; i < 5; i++) {
      const req = buildReq(operatorA.token, `${SESSION_ID_BASE}-same-op-${i}`);
      const res = await handleWs(req, mockServer());
      expect(res.status).toBe(101);
    }
  });

  test('6th connection closes with 429 for the same operator', async () => {
    // Warm up: 5 successful connections
    for (let i = 0; i < 5; i++) {
      const req = buildReq(operatorA.token, `${SESSION_ID_BASE}-same-op-${i}`);
      await handleWs(req, mockServer());
    }
    // 6th should be rate-limited
    const req = buildReq(operatorA.token, `${SESSION_ID_BASE}-same-op-6th`);
    const res = await handleWs(req, mockServer());
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).toBeTruthy();
    const retrySec = parseInt(retryAfter!, 10);
    expect(retrySec).toBeGreaterThan(0);
    expect(retrySec).toBeLessThanOrEqual(60);
  });

  test('different operator has independent rate limit bucket', async () => {
    // Exhaust operator A's limit
    for (let i = 0; i < 5; i++) {
      const req = buildReq(operatorA.token, `${SESSION_ID_BASE}-opA-${i}`);
      await handleWs(req, mockServer());
    }
    // operator A's 6th should be blocked
    const blockedRes = await handleWs(
      buildReq(operatorA.token, `${SESSION_ID_BASE}-opA-blocked`),
      mockServer(),
    );
    expect(blockedRes.status).toBe(429);

    // operator B should still be able to connect (independent bucket)
    const reqB = buildReq(operatorB.token, `${SESSION_ID_BASE}-opB-fresh`);
    const resB = await handleWs(reqB, mockServer());
    expect(resB.status).toBe(101);
  });
});
