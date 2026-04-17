// HexaWars Arena — Persistence: SQLite open + schema init
// Plan A v2, Phase 1. Driver: bun:sqlite (Bun first-party).
//
// Contract:
//   openDb(path?)  -> Database   — opens (or creates) SQLite file; WAL for disk, default for ":memory:".
//   initDb(db)     -> void       — applies schema.sql inside a transaction; idempotent.
//
// No singletons. Caller (server.ts) owns the single process-wide instance
// and passes it into mount(app, db) via closure.

import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_DB_PATH = ".arena/state.db";

export function openDb(path: string = DEFAULT_DB_PATH): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  return db;
}

export function initDb(db: Database): void {
  const sql = loadSchemaSql();
  db.transaction(() => {
    db.exec(sql);
  })();
}

function loadSchemaSql(): string {
  const schemaPath = join(import.meta.dir, "schema.sql");
  return readFileSync(schemaPath, "utf8");
}
