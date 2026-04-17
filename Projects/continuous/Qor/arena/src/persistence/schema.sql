-- HexaWars Arena — Identity Substrate Schema v1 (Plan A v2, Phase 1)
-- All DDL is idempotent. Re-running initDb must be a no-op.

CREATE TABLE IF NOT EXISTS operators (
  id                INTEGER PRIMARY KEY,
  handle            TEXT    NOT NULL UNIQUE,
  handle_normalized TEXT    NOT NULL UNIQUE,
  token_id          TEXT    NOT NULL UNIQUE,
  token_salt        BLOB    NOT NULL,
  token_hash        BLOB    NOT NULL,
  created_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_versions (
  id                     INTEGER PRIMARY KEY,
  operator_id            INTEGER NOT NULL,
  fingerprint            TEXT    NOT NULL,
  model_id               TEXT    NOT NULL
                           CHECK (LENGTH(model_id) BETWEEN 1 AND 128),
  similarity_flags_json  TEXT,
  created_at             INTEGER NOT NULL,
  FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS matches (
  id              TEXT    PRIMARY KEY,
  operator_a_id   INTEGER NOT NULL,
  operator_b_id   INTEGER NOT NULL,
  agent_a_id      INTEGER NOT NULL,
  agent_b_id      INTEGER NOT NULL,
  origin_tag      TEXT    NOT NULL,
  outcome         TEXT,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (operator_a_id) REFERENCES operators(id)      ON DELETE RESTRICT,
  FOREIGN KEY (operator_b_id) REFERENCES operators(id)      ON DELETE RESTRICT,
  FOREIGN KEY (agent_a_id)    REFERENCES agent_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (agent_b_id)    REFERENCES agent_versions(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS match_events (
  id          INTEGER PRIMARY KEY,
  match_id    TEXT    NOT NULL,
  seq         INTEGER NOT NULL,
  event_type  TEXT    NOT NULL,
  payload     TEXT    NOT NULL,
  ts          INTEGER NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_handle
  ON operators(handle);
CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_handle_normalized
  ON operators(handle_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_token_id
  ON operators(token_id);
CREATE INDEX IF NOT EXISTS idx_agent_versions_operator_id
  ON agent_versions(operator_id);
CREATE INDEX IF NOT EXISTS idx_agent_versions_fingerprint
  ON agent_versions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_matches_created_at
  ON matches(created_at);
CREATE INDEX IF NOT EXISTS idx_match_events_match_id
  ON match_events(match_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_events_seq
  ON match_events(match_id, seq);
