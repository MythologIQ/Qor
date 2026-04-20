import { describe, expect, it } from "bun:test";
import { openDb, initDb } from "../../src/persistence/db.js";

describe("persistence/schema", () => {
  it("declares UNIQUE on operators.handle, operators.handle_normalized, operators.token_id", () => {
    const db = openDb(":memory:");
    initDb(db);
    const idx = allIndexes(db, "operators");
    expect(idx).toContainEqual({ name: "idx_operators_handle", unique: true });
    expect(idx).toContainEqual({ name: "idx_operators_handle_normalized", unique: true });
    expect(idx).toContainEqual({ name: "idx_operators_token_id", unique: true });
    db.close();
  });

  it("has an index on agent_versions.operator_id and agent_versions.fingerprint", () => {
    const db = openDb(":memory:");
    initDb(db);
    const idx = allIndexes(db, "agent_versions").map((i) => i.name);
    expect(idx).toContain("idx_agent_versions_operator_id");
    expect(idx).toContain("idx_agent_versions_fingerprint");
    db.close();
  });

  it("every FK references an existing parent table", () => {
    const db = openDb(":memory:");
    initDb(db);
    const tables = tableNames(db);
    for (const t of tables) {
      const fks = db.query(`PRAGMA foreign_key_list(${t})`).all() as Array<{ table: string }>;
      for (const fk of fks) expect(tables).toContain(fk.table);
    }
    db.close();
  });

  it("agent_versions.model_id is NOT NULL and rejects empty strings", () => {
    const db = openDb(":memory:");
    initDb(db);
    seedOperator(db);
    expect(() =>
      insertAgentVersion(db, { fingerprint: "fp1", modelId: null }),
    ).toThrow();
    expect(() =>
      insertAgentVersion(db, { fingerprint: "fp2", modelId: "" }),
    ).toThrow();
    db.close();
  });

  it("agent_versions.model_id rejects strings longer than 128 chars", () => {
    const db = openDb(":memory:");
    initDb(db);
    seedOperator(db);
    const tooLong = "x".repeat(129);
    expect(() =>
      insertAgentVersion(db, { fingerprint: "fp3", modelId: tooLong }),
    ).toThrow();
    db.close();
  });

  it("agent_versions.model_id accepts a 128-char string", () => {
    const db = openDb(":memory:");
    initDb(db);
    seedOperator(db);
    const atLimit = "x".repeat(128);
    expect(() =>
      insertAgentVersion(db, { fingerprint: "fp4", modelId: atLimit }),
    ).not.toThrow();
    db.close();
  });

  it("does not use WITHOUT ROWID tables (v1 simplicity)", () => {
    const db = openDb(":memory:");
    initDb(db);
    const ddl = db.query(
      "SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL",
    ).all() as Array<{ sql: string }>;
    for (const row of ddl) {
      expect(row.sql.toUpperCase()).not.toContain("WITHOUT ROWID");
    }
    db.close();
  });

  it("match_events has a composite UNIQUE(match_id, seq) index", () => {
    const db = openDb(":memory:");
    initDb(db);
    const idx = allIndexes(db, "match_events");
    expect(idx.some((i) => i.name === "idx_match_events_seq" && i.unique)).toBe(true);
    db.close();
  });
});

interface IndexRow { name: string; unique: boolean; }

function allIndexes(db: ReturnType<typeof openDb>, table: string): IndexRow[] {
  const rows = db.query(`PRAGMA index_list(${table})`).all() as Array<{ name: string; unique: number }>;
  return rows.map((r) => ({ name: r.name, unique: r.unique === 1 }));
}

function tableNames(db: ReturnType<typeof openDb>): string[] {
  const rows = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function seedOperator(db: ReturnType<typeof openDb>): void {
  db.run(
    `INSERT INTO operators (handle, handle_normalized, token_id, token_salt, token_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ["alice", "alice", "tid", new Uint8Array(16), new Uint8Array(32), Date.now()],
  );
}

function insertAgentVersion(
  db: ReturnType<typeof openDb>,
  { fingerprint, modelId }: { fingerprint: string; modelId: string | null },
): void {
  db.run(
    `INSERT INTO agent_versions (operator_id, fingerprint, model_id, created_at)
     VALUES (?, ?, ?, ?)`,
    [1, fingerprint, modelId, Date.now()],
  );
}
