import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getLeaderboard } from "../../src/rank/leaderboard";

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE operators (
      id INTEGER PRIMARY KEY,
      handle TEXT NOT NULL,
      elo INTEGER NOT NULL DEFAULT 1500
    );
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY,
      operator_a_id INTEGER NOT NULL,
      operator_b_id INTEGER NOT NULL
    );
  `);
  return db;
}

describe("getLeaderboard", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns operators in descending elo order", () => {
    db.exec(`INSERT INTO operators (handle, elo) VALUES ('alice', 1600)`);
    db.exec(`INSERT INTO operators (handle, elo) VALUES ('bob', 1500)`);
    db.exec(`INSERT INTO operators (handle, elo) VALUES ('carol', 1400)`);
    db.exec(`INSERT INTO matches (operator_a_id, operator_b_id) VALUES (1, 2)`);
    db.exec(`INSERT INTO matches (operator_a_id, operator_b_id) VALUES (2, 3)`);

    const result = getLeaderboard(db, 10);

    expect(result).toHaveLength(3);
    expect(result[0].handle).toBe("alice");
    expect(result[1].handle).toBe("bob");
    expect(result[2].handle).toBe("carol");
    expect(result[0].elo).toBe(1600);
    expect(result[1].elo).toBe(1500);
    expect(result[2].elo).toBe(1400);
  });

  it("respects the limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      db.exec(`INSERT INTO operators (handle, elo) VALUES ('op${i}', ${1600 - i * 50})`);
    }
    for (let i = 1; i <= 5; i++) {
      for (let j = i + 1; j <= 5; j++) {
        db.exec(`INSERT INTO matches (operator_a_id, operator_b_id) VALUES (${i}, ${j})`);
      }
    }

    const result = getLeaderboard(db, 3);

    expect(result).toHaveLength(3);
    expect(result[0].handle).toBe("op0");
    expect(result[2].handle).toBe("op2");
  });

  it("returns operators with match counts", () => {
    db.exec(`INSERT INTO operators (handle, elo) VALUES ('solo', 1500)`);
    db.exec(`INSERT INTO operators (handle, elo) VALUES ('active', 1500)`);
    db.exec(`INSERT INTO matches (operator_a_id, operator_b_id) VALUES (1, 2)`);
    db.exec(`INSERT INTO matches (operator_a_id, operator_b_id) VALUES (1, 2)`);

    const result = getLeaderboard(db);

    expect(result).toHaveLength(2);
    const active = result.find((e) => e.handle === "active");
    const solo = result.find((e) => e.handle === "solo");
    expect(active?.matchesPlayed).toBe(2);
    expect(solo?.matchesPlayed).toBe(2);
  });

  it("returns empty array when no operators", () => {
    const result = getLeaderboard(db);
    expect(result).toHaveLength(0);
  });

  it("operators appear in leaderboard when they have played matches", () => {
    db.exec(`INSERT INTO operators (handle, elo) VALUES ('idle', 1550)`);
    db.exec(`INSERT INTO operators (handle, elo) VALUES ('active', 1500)`);
    db.exec(`INSERT INTO matches (operator_a_id, operator_b_id) VALUES (2, 1)`);

    const result = getLeaderboard(db);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const active = result.find((e) => e.handle === "active");
    expect(active).toBeDefined();
    expect(active?.elo).toBe(1500);
  });
});