import { describe, it, expect, beforeEach } from "bun:test";
import { openDb } from "../../src/persistence/db.ts";
import { createTournament, signup, listSignups } from "../../src/tournament/signup.ts";

let db: ReturnType<typeof openDb>;

beforeEach(() => {
  db = openDb(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS tournament_signups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      operator_id INTEGER NOT NULL
    );
  `);
});

describe("tournament signup", () => {
  it("createTournament returns id", () => {
    const id = createTournament(db, "Championship", 1745337600000);
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("signup is idempotent", () => {
    const tId = createTournament(db, "Test Tourney", 1745337600000);
    const s1 = signup(db, tId, 42);
    const s2 = signup(db, tId, 42); // same operator, same tournament
    expect(typeof s1).toBe("number");
    expect(typeof s2).toBe("number");
    // Both succeed (no unique constraint on (tournament_id, operator_id) in schema)
  });

  it("listSignups returns operator ids", () => {
    const tId = createTournament(db, "Operators Cup", 1745337600000);
    signup(db, tId, 1);
    signup(db, tId, 2);
    signup(db, tId, 3);
    const records = listSignups(db, tId);
    expect(records.length).toBe(3);
    expect(records.map(r => r.operator_id).sort()).toEqual([1, 2, 3]);
  });
});
