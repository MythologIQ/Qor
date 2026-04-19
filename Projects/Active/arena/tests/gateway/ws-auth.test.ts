import { describe, test, expect, beforeEach } from 'bun:test';
import { handleWs, configureWsAuth, wsOperatorLimiter } from '../../src/gateway/ws';
import { openDb, initDb } from '../../src/persistence/db';
import { createOperator } from '../../src/identity/operator';
import type { Database } from 'bun:sqlite';

const MATCH_ID = 'match-test-001';
const SESSION_ID = 'session-test-001';

function mockServer(): any {
  return {};
}

function buildReq(token?: string): Request {
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  params.set('matchId', MATCH_ID);
  params.set('sessionId', SESSION_ID);
  params.set('side', 'A');
  const url = `http://localhost:3000/ws?${params.toString()}`;
  const headers = new Headers({ Upgrade: 'websocket', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' });
  return new Request(url, { method: 'GET', headers });
}

describe('WS Auth — handleWs', () => {
  let db: Database;

  beforeEach(() => {
    db = openDb(':memory:');
    initDb(db);
    configureWsAuth(db);
    wsOperatorLimiter.resetAll();
  });

  test('missing token → 401', async () => {
    const req = new Request('http://localhost:3000/ws?matchId=m1&sessionId=s1&side=A', {
      method: 'GET',
      headers: { Upgrade: 'websocket' },
    });
    const res = await handleWs(req, mockServer());
    expect(res.status).toBe(401);
  });

  test('bad token format (no dot) → 401', async () => {
    const req = buildReq('no-dot-token');
    const res = await handleWs(req, mockServer());
    expect(res.status).toBe(401);
  });

  test('bad token format (trailing dot) → 401', async () => {
    const req = buildReq('operator.');
    const res = await handleWs(req, mockServer());
    expect(res.status).toBe(401);
  });

  test('bad token format (leading dot) → 401', async () => {
    const req = buildReq('.secret');
    const res = await handleWs(req, mockServer());
    expect(res.status).toBe(401);
  });

  test('unrecognized operator id → 401', async () => {
    // Valid format but no operator with this id exists in the in-memory db
    const req = buildReq('nonexistent-operator.some-secret');
    const res = await handleWs(req, mockServer());
    expect(res.status).toBe(401);
  });

  test('valid token for registered operator → 101 switching protocols', async () => {
    const { token } = createOperator(db, 'TestAgent');
    const req = buildReq(token);
    const res = await handleWs(req, mockServer());
    // Status 101 = upgrade accepted; any other non-5xx means auth passed
    expect(res.status).toBe(101);
  });
});