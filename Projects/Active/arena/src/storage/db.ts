import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.ARENA_DB ?? ".data/arena.db";

let db: Database;

export function getDb(): Database {
  if (!db) {
    const dir = dirname(DB_PATH);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH, { create: true });
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA foreign_keys=ON");
  }
  return db;
}

export function initSchema(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handle TEXT NOT NULL UNIQUE,
      handle_normalized TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER NOT NULL REFERENCES operators(id),
      name TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      model_id TEXT NOT NULL,
      bracket TEXT NOT NULL DEFAULT 'scout_force',
      verification TEXT NOT NULL DEFAULT 'unverified',
      queue_eligible INTEGER NOT NULL DEFAULT 0,
      api_key TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS match_records (
      id TEXT PRIMARY KEY,
      operator_a_id INTEGER,
      operator_b_id INTEGER,
      agent_a_id INTEGER,
      agent_b_id INTEGER,
      origin_tag TEXT NOT NULL DEFAULT 'auto',
      outcome TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agents_operator ON agent_versions(operator_id);
    CREATE INDEX IF NOT EXISTS idx_agents_queue ON agent_versions(queue_eligible) WHERE queue_eligible = 1;
    CREATE INDEX IF NOT EXISTS idx_matches_origin ON match_records(origin_tag);
  `);
}