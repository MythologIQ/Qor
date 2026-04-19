import { describe, expect, it, afterAll } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, initDb, DEFAULT_DB_PATH } from "../../src/persistence/db.js";

describe("persistence/db", () => {
  it("openDb(':memory:') returns a usable handle", () => {
    const db = openDb(":memory:");
    const row = db.query("SELECT 1 AS one").get() as { one: number };
    expect(row.one).toBe(1);
    db.close();
  });

  it("initDb is idempotent — two invocations leave schema identical", () => {
    const db = openDb(":memory:");
    initDb(db);
    const first = listTables(db);
    initDb(db);
    const second = listTables(db);
    expect(second).toEqual(first);
    expect(first).toContain("operators");
    expect(first).toContain("agent_versions");
    expect(first).toContain("matches");
    expect(first).toContain("match_events");
    db.close();
  });

  it("initDb creates all four tables with the expected columns", () => {
    const db = openDb(":memory:");
    initDb(db);
    const opCols = columnNames(db, "operators");
    expect(opCols).toEqual([
      "id", "handle", "handle_normalized",
      "token_id", "token_salt", "token_hash", "created_at", "elo",
    ]);
    const avCols = columnNames(db, "agent_versions");
    expect(avCols).toContain("model_id");
    expect(avCols).toContain("fingerprint");
    db.close();
  });

  it("foreign_keys PRAGMA is ON", () => {
    const db = openDb(":memory:");
    const row = db.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
    db.close();
  });

  it("file-backed db enables WAL journal_mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "arena-db-test-"));
    const path = join(dir, "state.db");
    try {
      const db = openDb(path);
      const row = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
      expect(row.journal_mode.toLowerCase()).toBe("wal");
      db.close();
      expect(existsSync(path)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("DEFAULT_DB_PATH is '.arena/state.db'", () => {
    expect(DEFAULT_DB_PATH).toBe(".arena/state.db");
  });
});

function listTables(db: ReturnType<typeof openDb>): string[] {
  const rows = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  ).all() as Array<{ name: string }>;
  return rows.map((r) => r.name).filter((n) => !n.startsWith("sqlite_"));
}

function columnNames(db: ReturnType<typeof openDb>, table: string): string[] {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

afterAll(() => {
  // no-op: per-test cleanup is inline.
});
