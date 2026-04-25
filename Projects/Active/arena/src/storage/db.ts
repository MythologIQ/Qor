import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.ARENA_DB ?? ".data/arena.db";

let db: Database | null = null;

export function getDbPath(): string {
  return process.env.ARENA_DB ?? ".data/arena.db";
}

export function getDb(): Database {
  if (!db) {
    mkdirSync(dirname(getDbPath()), { recursive: true });
    db = new Database(getDbPath(), { create: true });
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA foreign_keys=ON");
  }
  return db;
}

export function resetDb(): void {
  if (db) {
    db.close();
    db = null;
  }
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
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      agent_a_id INTEGER NOT NULL REFERENCES agent_versions(id),
      agent_b_id INTEGER NOT NULL REFERENCES agent_versions(id),
      bracket TEXT NOT NULL,
      origin_tag TEXT NOT NULL DEFAULT 'auto',
      outcome TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS match_events (
      match_id TEXT NOT NULL REFERENCES matches(id),
      seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      ts INTEGER NOT NULL,
      PRIMARY KEY (match_id, seq)
    );
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      challenger_agent_id INTEGER NOT NULL REFERENCES agent_versions(id),
      target_agent_id INTEGER NOT NULL REFERENCES agent_versions(id),
      bracket TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agents_operator ON agent_versions(operator_id);
    CREATE INDEX IF NOT EXISTS idx_agents_queue ON agent_versions(queue_eligible) WHERE queue_eligible = 1;
    CREATE INDEX IF NOT EXISTS idx_matches_bracket ON matches(bracket);
  `);
}
