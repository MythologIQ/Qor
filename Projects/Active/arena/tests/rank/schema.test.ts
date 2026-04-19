import { describe, expect, it } from "bun:test";
import { openDb, initDb } from "../../src/persistence/db.js";

describe("rank/schema — elo column", () => {
  it("fresh DB has elo column with default 1500 on operators", () => {
    const db = openDb(":memory:");
    initDb(db);
    const cols = columnNames(db, "operators");
    expect(cols).toContain("elo");
    db.close();
  });

  it("elo column is INTEGER NOT NULL on fresh init", () => {
    const db = openDb(":memory:");
    initDb(db);
    const info = pragmaTableInfo(db, "operators");
    const eloCol = info.find((c) => c.name === "elo")!;
    expect(eloCol.notnull).toBe(1);
    expect(eloCol.type.toUpperCase()).toBe("INTEGER");
    db.close();
  });

  it("elo column default is 1500 when inserting without a value", () => {
    const db = openDb(":memory:");
    initDb(db);
    db.run(
      `INSERT INTO operators (handle, handle_normalized, token_id, token_salt, token_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["alice", "alice", "tid", new Uint8Array(16), new Uint8Array(32), Date.now()],
    );
    const row = db.query("SELECT elo FROM operators WHERE handle = 'alice'").get() as { elo: number };
    expect(row.elo).toBe(1500);
    db.close();
  });

  it("migration path: adding elo to existing DB without data loss", () => {
    // Simulate an existing DB that already has the operators table
    // but is missing the elo column (pre-migration state)
    const db = openDb(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS operators (
        id                INTEGER PRIMARY KEY,
        handle            TEXT    NOT NULL UNIQUE,
        handle_normalized TEXT    NOT NULL UNIQUE,
        token_id          TEXT    NOT NULL UNIQUE,
        token_salt        BLOB    NOT NULL,
        token_hash        BLOB    NOT NULL,
        created_at        INTEGER NOT NULL
      );
    `);
    // Insert existing operator data
    db.run(
      `INSERT INTO operators (handle, handle_normalized, token_id, token_salt, token_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["bob", "bob", "tid2", new Uint8Array(16), new Uint8Array(32), 1700000000000],
    );
    // Run the full schema init (migration)
    initDb(db);
    // Data should still be present
    const row = db.query("SELECT handle, elo FROM operators WHERE handle = 'bob'").get() as { handle: string; elo: number };
    expect(row.handle).toBe("bob");
    expect(row.elo).toBe(1500); // migration fills the default
    db.close();
  });

  it("existing operators retain their elo on re-init (idempotent migration)", () => {
    const db = openDb(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS operators (
        id                INTEGER PRIMARY KEY,
        handle            TEXT    NOT NULL UNIQUE,
        handle_normalized TEXT    NOT NULL UNIQUE,
        token_id          TEXT    NOT NULL UNIQUE,
        token_salt        BLOB    NOT NULL,
        token_hash        BLOB    NOT NULL,
        created_at        INTEGER NOT NULL,
        elo               INTEGER NOT NULL DEFAULT 1600
      );
    `);
    db.run(
      `INSERT INTO operators (handle, handle_normalized, token_id, token_salt, token_hash, created_at, elo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["carol", "carol", "tid3", new Uint8Array(16), new Uint8Array(32), 1700000000000, 1650],
    );
    // Re-run init (idempotent — should not overwrite existing elo values)
    initDb(db);
    const row = db.query("SELECT elo FROM operators WHERE handle = 'carol'").get() as { elo: number };
    expect(row.elo).toBe(1650); // existing value preserved
    db.close();
  });
});

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

function pragmaTableInfo(db: ReturnType<typeof openDb>, table: string): ColumnInfo[] {
  return db.query(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

function columnNames(db: ReturnType<typeof openDb>, table: string): string[] {
  return pragmaTableInfo(db, table).map((c) => c.name);
}
