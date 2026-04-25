import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { buildSpectatorFrameSequence, SpectatorDeps } from "./spectator-ws.ts";
import { MatchRuntime, getActiveRuntime } from "../orchestrator/match-runner.ts";
import { openDb, initDb } from "../persistence/db.ts";
import type { Database } from "bun:sqlite";

let db: Database;

beforeEach(() => {
  db = openDb(":memory:");
  initDb(db);
});

afterEach(() => {
  for (const id of ["active-match-1", "active-match-2", "status-active-match"]) {
    getActiveRuntime(id)?.finish();
  }
  db.close();
});

describe("buildSpectatorFrameSequence", () => {
  test("uses runtime path when active runtime exists", () => {
    new MatchRuntime("active-match-1", "seed-active-1", "playerA", "playerB");
    const deps: SpectatorDeps = { db };

    const frames = buildSpectatorFrameSequence(deps, "active-match-1");

    expect(frames).not.toBeNull();
    expect(frames!.length).toBeGreaterThan(0);

    const firstFrame = JSON.parse(frames![0]);
    expect(firstFrame.type).toBe("MATCH_HELLO");
    expect(firstFrame.mode).toBe("live");
  });

  test("returns null for nonexistent matchId with no runtime", () => {
    const deps: SpectatorDeps = { db };
    const frames = buildSpectatorFrameSequence(deps, "does-not-exist");
    expect(frames).toBeNull();
  });

  test("runtime frames contain non-empty board and units", () => {
    new MatchRuntime("active-match-2", "seed-active-2", "playerC", "playerD");
    const deps: SpectatorDeps = { db };

    const frames = buildSpectatorFrameSequence(deps, "active-match-2");

    expect(frames).not.toBeNull();
    const stateFrameRaw = frames!.find((f) => JSON.parse(f).type === "MATCH_STATE");
    expect(stateFrameRaw).toBeDefined();
    const stateFrame = JSON.parse(stateFrameRaw);
    expect(stateFrame.projection.board.cells.length).toBeGreaterThan(0);
    expect(stateFrame.projection.board.units.length).toBeGreaterThan(0);
  });

  test("MATCH_HELLO and MATCH_STATE frames present in runtime path", () => {
    new MatchRuntime("active-match-3", "seed-active-3", "playerE", "playerF");
    const deps: SpectatorDeps = { db };

    const frames = buildSpectatorFrameSequence(deps, "active-match-3");

    expect(frames).not.toBeNull();
    const types = frames!.map((f) => JSON.parse(f).type);
    expect(types).toContain("MATCH_HELLO");
    expect(types).toContain("MATCH_STATE");
  });
});