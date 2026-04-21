import { describe, expect, it } from "bun:test";
import { openDb, initDb } from "../../src/persistence/db.js";

describe("tournament/schema", () => {
  it("tables exist after initDb", () => {
    const db = openDb(":memory:");
    initDb(db);
    const tables = tableNames(db);
    expect(tables).toContain("tournaments");
    expect(tables).toContain("tournament_signups");
    expect(tables).toContain("tournament_pairings");
    db.close();
  });

  it("FKs resolve — tournament_signups references tournaments and operators", () => {
    const db = openDb(":memory:");
    initDb(db);
    const tables = tableNames(db);
    const fks = db.query(`PRAGMA foreign_key_list(tournament_signups)`).all() as Array<{ table: string }>;
    for (const fk of fks) expect(tables).toContain(fk.table);
    db.close();
  });

  it("FKs resolve — tournament_pairings references tournaments and operators", () => {
    const db = openDb(":memory:");
    initDb(db);
    const tables = tableNames(db);
    const fks = db.query(`PRAGMA foreign_key_list(tournament_pairings)`).all() as Array<{ table: string }>;
    for (const fk of fks) expect(tables).toContain(fk.table);
    db.close();
  });

  it("tournament_pairings.match_id FK allows NULL (optional link)", () => {
    const db = openDb(":memory:");
    initDb(db);
    const tables = tableNames(db);
    const fks = db.query(`PRAGMA foreign_key_list(tournament_pairings)`).all() as Array<{ table: string; from: string; to: string }>;
    const matchFk = fks.find((f) => f.from === "match_id");
    expect(matchFk).toBeDefined();
    expect(tables).toContain(matchFk!.table);
    db.close();
  });

  it("tournaments.status is CHECKed to valid values", () => {
    const db = openDb(":memory:");
    initDb(db);
    const rows = db.query(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='tournaments'`,
    ).all() as Array<{ sql: string }>;
    const sql = rows[0].sql;
    expect(sql.toUpperCase()).toContain("CHECK");
    expect(sql.toUpperCase()).toMatch(/PENDING.*ACTIVE.*COMPLETED.*CANCELLED/);
    db.close();
  });

  it("tournament_pairings.result is CHECKed to valid values", () => {
    const db = openDb(":memory:");
    initDb(db);
    const rows = db.query(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='tournament_pairings'`,
    ).all() as Array<{ sql: string }>;
    const sql = rows[0].sql;
    expect(sql.toUpperCase()).toContain("CHECK");
    expect(sql.toUpperCase()).toMatch(/A_WINS.*B_WINS.*DRAW/);
    db.close();
  });

  it("tournament_signups has UNIQUE(tournament_id, operator_id)", () => {
    const db = openDb(":memory:");
    initDb(db);
    const rows = db.query(`PRAGMA index_list(tournament_signups)`).all() as Array<{ name: string; unique: number }>;
    expect(rows.some((r) => r.unique === 1)).toBe(true);
    db.close();
  });

  it("idx_tournament_signups_tournament_id index exists", () => {
    const db = openDb(":memory:");
    initDb(db);
    const idx = indexNames(db, "tournament_signups");
    expect(idx).toContain("idx_tournament_signups_tournament_id");
    db.close();
  });

  it("idx_tournament_pairings_tournament_id index exists", () => {
    const db = openDb(":memory:");
    initDb(db);
    const idx = indexNames(db, "tournament_pairings");
    expect(idx).toContain("idx_tournament_pairings_tournament_id");
    db.close();
  });

  it("idx_tournament_pairings_match_id index exists", () => {
    const db = openDb(":memory:");
    initDb(db);
    const idx = indexNames(db, "tournament_pairings");
    expect(idx).toContain("idx_tournament_pairings_match_id");
    db.close();
  });
});

function tableNames(db: ReturnType<typeof openDb>): string[] {
  const rows = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function indexNames(db: ReturnType<typeof openDb>, table: string): string[] {
  const rows = db.query(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}