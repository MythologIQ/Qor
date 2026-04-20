import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { openDb, initDb } from "../../src/persistence/db";
import { mount } from "../../src/router";
import { seedDemoMatch, DEMO_SEED_MATCH_ID } from "../../src/persistence/seed";
import { createLimiter } from "../../src/identity/rate-limit";
import { saveMatch, appendEvents } from "../../src/persistence/match-store";
import type { MatchRecord } from "../../src/shared/types";

function makeApp(): { app: Hono; db: Database } {
  const db = openDb(":memory:");
  initDb(db);
  const app = new Hono();
  mount(app, db, { limiter: createLimiter() });
  return { app, db };
}

describe("GET /api/arena/matches/:id/stream", () => {
  let app: Hono;
  let db: Database;

  beforeEach(() => {
    const made = makeApp();
    app = made.app;
    db = made.db;
  });

  test("unknown match → 404", async () => {
    const res = await app.fetch(
      new Request("http://t/api/arena/matches/nope/stream"),
    );
    expect(res.status).toBe(404);
  });

  test("client receives initial snapshot with existing events", async () => {
    seedDemoMatch(db);
    const res = await app.fetch(
      new Request(`http://t/api/arena/matches/${DEMO_SEED_MATCH_ID}/stream`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const body = res.body!;
    const chunks: string[] = [];
    const reader = body.getReader();
    const decoder = new TextDecoder();

    // Read first chunk — should be the initial snapshot
    const first = await reader.read();
    expect(first.done).toBe(false);
    const firstText = decoder.decode(first.value);
    chunks.push(firstText);

    // Parse the snapshot event
    const snapshotLine = chunks[0].split("\n").find((l) => l.startsWith("data:"));
    expect(snapshotLine).toBeDefined();
    const snapshotData = JSON.parse(snapshotLine.replace("data: ", ""));
    expect(snapshotData.type).toBe("snapshot");
    expect(snapshotData.matchId).toBe(DEMO_SEED_MATCH_ID);
    expect(Array.isArray(snapshotData.events)).toBe(true);
    expect(snapshotData.events.length).toBe(30);

    // Cancel stream
    reader.cancel();
  });

  test("new events are appended after first poll", async () => {
    seedDemoMatch(db);

    const res = await app.fetch(
      new Request(`http://t/api/arena/matches/${DEMO_SEED_MATCH_ID}/stream`),
    );
    expect(res.status).toBe(200);

    const body = res.body!;
    const decoder = new TextDecoder();
    const reader = body.getReader();

    // Read initial snapshot
    await reader.read();

    // Wait for poll interval + a bit more (1s + buffer)
    await new Promise((r) => setTimeout(r, 1200));

    // Read next chunk — should be either still-polling or match-end (demo match has outcome=A_wins)
    const second = await reader.read();
    expect(second.done).toBe(false);
    const secondText = decoder.decode(second.value);
    const updateLine = secondText.split("\n").find((l) => l.startsWith("data:"));
    expect(updateLine).toBeDefined();
    const updateData = JSON.parse(updateLine.replace("data: ", ""));
    // Demo seed match already has outcome, so the stream sends match-end immediately
    expect(["match-end", "update"]).toContain(updateData.type);

    reader.cancel();
  });

  test("stream ends on completed match", async () => {
    seedDemoMatch(db); // outcome is "A_wins"

    const res = await app.fetch(
      new Request(`http://t/api/arena/matches/${DEMO_SEED_MATCH_ID}/stream`),
    );
    expect(res.status).toBe(200);

    const body = res.body!;
    const decoder = new TextDecoder();
    const reader = body.getReader();

    // Read first chunk (snapshot)
    const first = await reader.read();
    expect(first.done).toBe(false);
    decoder.decode(first.value);

    // Wait for polling to detect match-end
    await new Promise((r) => setTimeout(r, 1500));

    // Read the match-end event
    const second = await reader.read();
    expect(second.done).toBe(false);
    const secondText = decoder.decode(second.value);
    const matchEndLine = secondText.split("\n").find((l) => l.startsWith("data:"));
    expect(matchEndLine).toBeDefined();
    const matchEndData = JSON.parse(matchEndLine.replace("data: ", ""));
    expect(matchEndData.type).toBe("match-end");
    expect(matchEndData.outcome).toBe("A_wins");

    // Stream should be closed after match-end
    const third = await reader.read();
    expect(third.done).toBe(true);

    reader.cancel();
  });

  test("stream emits update events when new events are appended", async () => {
    // Use the seeded match which has valid operators and agents
    // Clear its outcome so it behaves as an in-progress match
    seedDemoMatch(db);

    // Set outcome to null to simulate in-progress match
    db.prepare("UPDATE matches SET outcome = NULL WHERE id = ?").run(DEMO_SEED_MATCH_ID);
    // Clear events
    db.prepare("DELETE FROM match_events WHERE match_id = ?").run(DEMO_SEED_MATCH_ID);

    const res = await app.fetch(
      new Request(`http://t/api/arena/matches/${DEMO_SEED_MATCH_ID}/stream`),
    );
    expect(res.status).toBe(200);

    const body = res.body!;
    const decoder = new TextDecoder();
    const reader = body.getReader();

    // Read initial snapshot (empty events since we deleted them)
    const first = await reader.read();
    expect(first.done).toBe(false);
    const firstText = decoder.decode(first.value);
    const firstData = JSON.parse(
      firstText.split("\n").find((l) => l.startsWith("data:"))!.replace("data: ", ""),
    );
    expect(firstData.type).toBe("snapshot");
    expect(firstData.events.length).toBe(0);

    // Append a new event while stream is open
    appendEvents(db, DEMO_SEED_MATCH_ID, [
      { seq: 1, eventType: "unit_moved", payload: '{"x":1}', ts: 2 },
    ]);

    // Wait for next poll
    await new Promise((r) => setTimeout(r, 1200));

    // Read the update
    const second = await reader.read();
    expect(second.done).toBe(false);
    const secondText = decoder.decode(second.value);
    const updateLine = secondText.split("\n").find((l) => l.startsWith("data:"));
    expect(updateLine).toBeDefined();
    const updateData = JSON.parse(updateLine.replace("data: ", ""));
    expect(updateData.type).toBe("update");
    expect(updateData.events.length).toBe(1);
    expect(updateData.events[0].seq).toBe(1);
    expect(updateData.events[0].eventType).toBe("unit_moved");

    reader.cancel();
  });
});