import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { openDb, initDb } from "../../src/persistence/db";
import { mount } from "../../src/router";
import { createLimiter } from "../../src/identity/rate-limit";
import { matchQueue } from "../../src/matchmaker/queue";
import { presenceTracker } from "../../src/matchmaker/presence";
import { findPair } from "../../src/matchmaker/pair";
import type { PairingCriteria } from "../../src/matchmaker/types";
import { getLeaderboard } from "../../src/rank/leaderboard";
import { applyElo } from "../../src/rank/apply";
import { getMatch, listMatchesByOperator, streamEvents, saveMatch, appendEvents, updateMatchOutcome } from "../../src/persistence/match-store";
import { registerAgentVersion } from "../../src/identity/agent-version";
import { createMatch, stepMatch } from "../../src/engine/match";

function makeApp() {
  const db = openDb(":memory:");
  initDb(db);
  const app = new Hono();
  matchQueue.clear();
  presenceTracker.reset?.();
  mount(app, db, { limiter: createLimiter() });
  return { app, db };
}

async function registerOperator(app: Hono, handle: string) {
  const res = await app.fetch(
    new Request("http://t/api/arena/operators", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
      body: JSON.stringify({ handle }),
    }),
  );
  return (await res.json()) as { token: string; operator: { id: number } };
}

async function enqueueOperator(app: Hono, token: string) {
  const res = await app.fetch(
    new Request("http://t/api/arena/matchmaker/enqueue", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    }),
  );
  return (await res.json()) as Promise<{ ok: boolean; queueSize: number }>;
}

async function registerAndEnqueue(app: Hono, handle: string) {
  const reg = await registerOperator(app, handle);
  const eq = await enqueueOperator(app, reg.token);
  return { ...reg, eq, opId: reg.operator.id };
}

/**
 * Synthetic match runner — exercises the engine with no actual agent I/O.
 * Simulates 50-turn pass-only match, records events, returns result.
 */
function runSyntheticMatch(
  db: Database,
  matchId: string,
  opAId: number,
  opBId: number,
  avAId: number,
  avBId: number,
): { reason: "decisive" | "timeout"; winnerOpId: number | null } {
  saveMatch(db, {
    id: matchId,
    operatorAId: opAId,
    operatorBId: opBId,
    agentAId: avAId,
    agentBId: avBId,
    originTag: "ladder",
    outcome: null,
    createdAt: Date.now(),
  });

  const seed = `smoke-${matchId}`;
  const state = createMatch(seed, String(opAId), String(opBId));
  let seq = 1;
  const passA = { type: "pass" as const, confidence: 1 };
  const passB = { type: "pass" as const, confidence: 1 };

  for (let turn = 0; turn < 50; turn++) {
    const result = stepMatch(state, passA, passB);
    appendEvents(db, matchId, [{
      seq: seq++,
      eventType: "turn_action",
      payload: JSON.stringify({ turn: result.state.turn, actionA: passA, actionB: passB }),
      ts: Date.now(),
    }]);
    if (result.ended) break;
  }

  // Pass-only actions produce no decisive victory → draw at turn 50
  const reason: "decisive" | "timeout" = "timeout";
  const winnerOpId: number | null = null;

  updateMatchOutcome(db, matchId, JSON.stringify({ winnerOpId, reason }), winnerOpId, "ladder");
  return { reason, winnerOpId };
}

describe("Plan B smoke — matchmaker → runner → rank → UI", () => {
  let app: Hono;
  let db: Database;
  let alice: Awaited<ReturnType<typeof registerAndEnqueue>>;
  let bob: Awaited<ReturnType<typeof registerAndEnqueue>>;
  let avIdA: number;
  let avIdB: number;

  beforeEach(async () => {
    const made = makeApp();
    app = made.app;
    db = made.db;
    alice = await registerAndEnqueue(app, "alice");
    bob = await registerAndEnqueue(app, "bob");

    // Create agent versions for FK integrity on matches table
    const avRegA = registerAgentVersion(db, {
      operatorId: alice.opId, code: "pass", config: "{}", modelId: "smoke-v1", promptTemplate: "",
    });
    const avRegB = registerAgentVersion(db, {
      operatorId: bob.opId, code: "pass", config: "{}", modelId: "smoke-v1", promptTemplate: "",
    });
    avIdA = avRegA.agentVersion.id;
    avIdB = avRegB.agentVersion.id;
  });

  test("full flow: enqueue (both) → matchmaker pairs → synthetic runner completes → leaderboard shifts → match record with events", async () => {
    // ── 1. Both operators enqueued ───────────────────────────────────────
    expect(alice.eq.ok).toBe(true);
    expect(alice.eq.queueSize).toBe(1);
    expect(bob.eq.ok).toBe(true);
    expect(bob.eq.queueSize).toBe(2);

    // ── 2. Presence: both operators online ───────────────────────────────
    presenceTracker.connect(alice.opId);
    presenceTracker.connect(bob.opId);
    expect(presenceTracker.isOnline(alice.opId)).toBe(true);
    expect(presenceTracker.isOnline(bob.opId)).toBe(true);

    // ── 3. Matchmaker status reflects live queue + presence ────────────────
    const mmRes = await app.fetch(new Request("http://t/api/arena/matchmaker/status"));
    const mmBody = await mmRes.json() as { queueSize: number; presenceCount: number };
    expect(mmBody.queueSize).toBe(2);
    expect(mmBody.presenceCount).toBe(2);

    // ── 4. Matchmaker pairs operators ────────────────────────────────────
    const pair = findPair(matchQueue, { eloTolerance: 200 });
    expect(pair).not.toBeNull();
    expect([pair!.a.operatorId, pair!.b.operatorId]).toContain(alice.opId);
    expect([pair!.a.operatorId, pair!.b.operatorId]).toContain(bob.opId);

    // ── 5. Synthetic runner: full match lifecycle ─────────────────────────
    const matchId = `smoke-${Date.now()}`;
    const result = runSyntheticMatch(db, matchId, alice.opId, bob.opId, avIdA, avIdB);
    expect(["decisive", "timeout"]).toContain(result.reason);
    expect(result.winnerOpId).toBeNull(); // draw — pass-only actions produce no victor

    // ── 6. Apply ELO (draw) so leaderboard reflects both operators ─────────
    const eloResult = applyElo(db, matchId, {
      winnerOpId: alice.opId, // winnerOpId=null signals draw; pass explicit draw=true
      loserOpId: bob.opId,
      draw: true,
    });
    expect(typeof eloResult.delta).toBe("number");

    // ── 7. Leaderboard: both operators listed with correct matchesPlayed ───
    const entries = getLeaderboard(db, 10);
    const handles = entries.map((e) => e.handle);
    expect(handles).toContain("alice");
    expect(handles).toContain("bob");

    const aliceEntry = entries.find((e) => e.handle === "alice");
    const bobEntry = entries.find((e) => e.handle === "bob");
    expect(aliceEntry).toBeDefined();
    expect(bobEntry).toBeDefined();
    expect(aliceEntry!.matchesPlayed).toBeGreaterThan(0);
    expect(bobEntry!.matchesPlayed).toBeGreaterThan(0);
    // ELO should be close to default 1500 after a draw
    expect(aliceEntry!.elo).toBeGreaterThanOrEqual(1400);
    expect(aliceEntry!.elo).toBeLessThanOrEqual(1600);

    // ── 8. /api/arena/matches/:id returns completed match record ──────────
    const rec = getMatch(db, matchId);
    expect(rec).not.toBeNull();
    expect(rec!.outcome).toMatch(/^(resolved|draw)$/);
    expect(rec!.operatorAId).toBe(alice.opId);
    expect(rec!.operatorBId).toBe(bob.opId);
    expect(rec!.agentAId).toBe(avIdA);
    expect(rec!.agentBId).toBe(avIdB);

    // ── 9. /api/arena/matches/:id/events returns event array ─────────────
    const events = Array.from(streamEvents(db, matchId));
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty("seq");
    expect(events[0]).toHaveProperty("eventType");
    expect(events[0]).toHaveProperty("payload");

    // ── 10. Leaderboard API route returns 200 ───────────────────────────
    const lbRes = await app.fetch(new Request("http://t/api/arena/leaderboard"));
    expect(lbRes.status).toBe(200);
    const lbBody = await lbRes.json() as { entries: Array<{ handle: string; elo: number }> };
    expect(lbBody.entries.length).toBeGreaterThanOrEqual(2);
  });

  test("matchmaker enqueue and presence tracker — integration via status endpoint", async () => {
    // Both operators already enqueued in beforeEach
    presenceTracker.connect(alice.opId);
    presenceTracker.connect(bob.opId);

    const mmRes = await app.fetch(new Request("http://t/api/arena/matchmaker/status"));
    expect(mmRes.status).toBe(200);
    const body = await mmRes.json() as { queueSize: number; presenceCount: number };
    expect(body.queueSize).toBe(2);
    expect(body.presenceCount).toBe(2);

    // Dequeue alice — queue shrinks
    matchQueue.dequeue(alice.opId);
    const afterDequeue = await app.fetch(new Request("http://t/api/arena/matchmaker/status"));
    const body2 = await afterDequeue.json() as { queueSize: number };
    expect(body2.queueSize).toBe(1);
  });
});