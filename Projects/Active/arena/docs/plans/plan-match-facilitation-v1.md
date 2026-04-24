# Plan: Match Facilitation Layer

**Plan ID**: plan-match-facilitation-v1
**Author**: Victor (via /qor-plan)
**Date**: 2026-04-24
**Status**: DRAFT → AUDIT
**Scope**: Operator identity, agent registration, matchmaker cutover, challenge system, leaderboard, operator dashboard API
**Blocks**: competitive play, any live non-demo match, operator onboarding

---

## Locked Decisions (from prior dialogue)

| Decision | Lock |
|----------|------|
| Identity model | Declared + verified, composite fingerprint |
| Storage | SQLite via `bun:sqlite` |
| Operator auth | Self-register via API key, no OAuth |
| Match trigger | Hybrid: auto-match + direct challenge |
| Brackets | 3 tiers: Scout Force / Warband / Vanguard Legion |
| Max queue-eligible | 2 per operator, manual designation |
| Leaderboard | Replay-first, no reliability metric |
| House opponents | Single base model, doctrine + horizon per tier |
| Agent sign-up | Guided handshake, bearer token shown once |
| Roster columns | Agent Name, agent_id, bracket, verification, queue state |
| Dashboard primary action | Register New Agent |
| Bracket names | Thematic + 5-word max descriptor |
| Missed match | Cooldown + visibility penalty |
| Config change | New agent_id; old config demoted |
| Queue designation change | Next queue cycle |

---

## Phase 1: Storage + Operator Identity

### Affected Files

- `src/storage/db.ts` — **NEW** — SQLite bootstrap + schema
- `src/storage/operators.ts` — **NEW** — operator CRUD
- `src/storage/agents.ts` — **NEW** — agent version CRUD
- `src/storage/matches.ts` — **NEW** — match record CRUD (replace in-memory maps)
- `src/gateway/routes/register.ts` — **NEW** — `POST /api/arena/register`
- `src/gateway/routes/agents.ts` — **NEW** — `POST /api/arena/agents`, `GET /api/arena/agents`
- `src/server.ts` — mount new routes

### Changes

**`src/storage/db.ts`**

```typescript
import { Database } from "bun:sqlite";

const DB_PATH = process.env.ARENA_DB ?? "arena.db";

let db: Database;
export function getDb(): Database {
  if (!db) db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
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
```

**`src/storage/operators.ts`**

```typescript
import { getDb } from "./db";
import { randomBytes } from "node:crypto";

export interface OperatorRow {
  id: number;
  handle: string;
  handle_normalized: string;
  api_key: string;
  created_at: number;
}

export function registerOperator(handle: string): { operator: OperatorRow; apiKey: string } {
  const normalized = handle.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (normalized.length < 3 || normalized.length > 32) throw new Error("Handle must be 3-32 alphanumeric chars");
  const apiKey = `ak_${randomBytes(24).toString("hex")}`;
  const now = Date.now();
  const db = getDb();
  const result = db.run(
    "INSERT INTO operators (handle, handle_normalized, api_key, created_at) VALUES (?, ?, ?, ?)",
    [handle, normalized, apiKey, now]
  );
  return {
    operator: { id: Number(result.lastInsertRowid), handle, handle_normalized: normalized, api_key: apiKey, created_at: now },
    apiKey,
  };
}

export function authenticateOperator(apiKey: string): OperatorRow | null {
  return getDb().query("SELECT * FROM operators WHERE api_key = ?").get(apiKey) as OperatorRow | null;
}
```

**`src/storage/agents.ts`**

```typescript
import { getDb } from "./db";
import { randomBytes, createHash } from "node:crypto";

export type Bracket = "scout_force" | "warband" | "vanguard_legion";
export type Verification = "unverified" | "pending_handshake" | "verified_pending_queue" | "queue_eligible" | "active" | "demoted";

export interface AgentVersionRow {
  id: number;
  operator_id: number;
  name: string;
  fingerprint: string;
  model_id: string;
  bracket: Bracket;
  verification: Verification;
  queue_eligible: number;
  api_key: string;
  created_at: number;
}

export function computeFingerprint(config: { modelId: string; systemPrompt?: string; params?: Record<string, unknown> }): string {
  const hash = createHash("sha256");
  hash.update(config.modelId);
  if (config.systemPrompt) hash.update(config.systemPrompt);
  if (config.params) hash.update(JSON.stringify(config.params));
  return hash.digest("hex").slice(0, 16);
}

export function registerAgent(operatorId: number, name: string, modelId: string, bracket: Bracket, config: { systemPrompt?: string; params?: Record<string, unknown> }): { agent: AgentVersionRow; apiKey: string } {
  const fingerprint = computeFingerprint(config);
  const apiKey = `ag_${randomBytes(24).toString("hex")}`;
  const now = Date.now();
  const db = getDb();
  const result = db.run(
    "INSERT INTO agent_versions (operator_id, name, fingerprint, model_id, bracket, verification, queue_eligible, api_key, created_at) VALUES (?, ?, ?, ?, ?, 'unverified', 0, ?, ?)",
    [operatorId, name, fingerprint, modelId, bracket, apiKey, now]
  );
  return {
    agent: { id: Number(result.lastInsertRowid), operator_id: operatorId, name, fingerprint, model_id: modelId, bracket, verification: "unverified", queue_eligible: 0, api_key: apiKey, created_at: now },
    apiKey,
  };
}

export function getAgentsByOperator(operatorId: number): AgentVersionRow[] {
  return getDb().query("SELECT * FROM agent_versions WHERE operator_id = ? ORDER BY created_at DESC").all(operatorId) as AgentVersionRow[];
}

export function getAgentById(agentId: number): AgentVersionRow | null {
  return getDb().query("SELECT * FROM agent_versions WHERE id = ?").get(agentId) as AgentVersionRow | null;
}

export function updateAgentVerification(agentId: number, verification: Verification): void {
  getDb().run("UPDATE agent_versions SET verification = ? WHERE id = ?", [verification, agentId]);
}

export function setQueueEligible(agentId: number, eligible: boolean): void {
  getDb().run("UPDATE agent_versions SET queue_eligible = ? WHERE id = ?", [eligible ? 1 : 0, agentId]);
}

export function getQueueEligibleAgents(bracket: Bracket): AgentVersionRow[] {
  return getDb().query("SELECT * FROM agent_versions WHERE queue_eligible = 1 AND bracket = ? AND verification IN ('queue_eligible', 'active')").all(bracket) as AgentVersionRow[];
}
```

**`src/gateway/routes/register.ts`** — `POST /api/arena/register`

Request: `{ handle: string }`
Response: `{ operator: { id, handle }, apiKey: string }`

**`src/gateway/routes/agents.ts`**

- `POST /api/arena/agents` — requires operator API key in `Authorization: Bearer`. Body: `{ name, modelId, bracket, config: { systemPrompt?, params? } }`. Returns agent + agent API key.
- `GET /api/arena/agents` — requires operator API key. Returns operator's agents.

### Unit Tests

- `src/storage/operators.test.ts` — register returns valid operator; duplicate handle throws; authenticate returns null for unknown key
- `src/storage/agents.test.ts` — register agent; fingerprint is deterministic; queue eligible filter works; update verification transitions correctly

---

## Phase 2: Matchmaker Cutover + Challenge System

### Affected Files

- `src/orchestrator/matchmaker.ts` — rewrite to use DB + bracket-aware pairing
- `src/orchestrator/challenge.ts` — **NEW** — challenge lifecycle
- `src/gateway/routes/matchmaking.ts` — **NEW** — `POST /api/arena/challenge`, `POST /api/arena/challenge/:id/respond`
- `src/server.ts` — mount new routes

### Changes

**`src/orchestrator/matchmaker.ts`** — rewrite:

```typescript
import { getDb } from "../storage/db";
import { getQueueEligibleAgents, type Bracket } from "../storage/agents";
import { createMatch } from "../engine/match";
import type { MatchState } from "../shared/types";

export interface MatchCreatedNotification {
  matchId: string;
  agentAId: number;
  agentBId: number;
  bracket: Bracket;
  originTag: "auto" | "challenge";
  matchState: MatchState;
}

let matchCounter = 0;

export function tryAutoMatch(bracket: Bracket): MatchCreatedNotification | null {
  const eligible = getQueueEligibleAgents(bracket);
  if (eligible.length < 2) return null;

  // Sort by wait time (oldest first) — use agent id as proxy for registration order
  eligible.sort((a, b) => a.id - b.id);

  const agentA = eligible[0];
  const agentB = eligible.find(a => a.operator_id !== agentA.operator_id) ?? eligible[1];

  matchCounter++;
  const matchId = `match-${matchCounter.toString().padStart(4, "0")}`;
  const seed = `seed-${matchId}-${Date.now()}`;
  const matchState = createMatch(seed, String(agentA.id), String(agentB.id));
  const now = Date.now();

  getDb().run(
    "INSERT INTO matches (id, agent_a_id, agent_b_id, bracket, origin_tag, created_at) VALUES (?, ?, ?, ?, 'auto', ?)",
    [matchId, agentA.id, agentB.id, bracket, now]
  );

  return { matchId, agentAId: agentA.id, agentBId: agentB.id, bracket, originTag: "auto", matchState };
}

export function runAutoMatchCycle(): MatchCreatedNotification[] {
  const brackets: Bracket[] = ["scout_force", "warband", "vanguard_legion"];
  const results: MatchCreatedNotification[] = [];
  for (const bracket of brackets) {
    const result = tryAutoMatch(bracket);
    if (result) results.push(result);
  }
  return results;
}
```

**`src/orchestrator/challenge.ts`**:

```typescript
import { getDb } from "../storage/db";
import { getAgentById, type Bracket } from "../storage/agents";
import { randomBytes } from "node:crypto";

export interface ChallengeRow {
  id: string;
  challenger_agent_id: number;
  target_agent_id: number;
  bracket: Bracket;
  status: "pending" | "accepted" | "declined" | "expired";
  created_at: number;
  expires_at: number;
}

const CHALLENGE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function createChallenge(challengerAgentId: number, targetAgentId: number): ChallengeRow {
  const challenger = getAgentById(challengerAgentId);
  const target = getAgentById(targetAgentId);
  if (!challenger || !target) throw new Error("Agent not found");
  if (challenger.operator_id === target.operator_id) throw new Error("Cannot challenge own agent");
  if (challenger.bracket !== target.bracket) throw new Error("Cross-bracket challenges not allowed");

  const id = `ch_${randomBytes(12).toString("hex")}`;
  const now = Date.now();
  getDb().run(
    "INSERT INTO challenges (id, challenger_agent_id, target_agent_id, bracket, status, created_at, expires_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
    [id, challengerAgentId, targetAgentId, challenger.bracket, now, now + CHALLENGE_TTL_MS]
  );
  return { id, challenger_agent_id: challengerAgentId, target_agent_id: targetAgentId, bracket: challenger.bracket, status: "pending", created_at: now, expires_at: now + CHALLENGE_TTL_MS };
}

export function respondToChallenge(challengeId: string, accept: boolean): ChallengeRow | null {
  const row = getDb().query("SELECT * FROM challenges WHERE id = ? AND status = 'pending'").get(challengeId) as ChallengeRow | null;
  if (!row) return null;
  if (Date.now() > row.expires_at) {
    getDb().run("UPDATE challenges SET status = 'expired' WHERE id = ?", [challengeId]);
    return { ...row, status: "expired" };
  }
  getDb().run("UPDATE challenges SET status = ? WHERE id = ?", [accept ? "accepted" : "declined", challengeId]);
  return { ...row, status: accept ? "accepted" : "declined" };
}

export function getPendingChallengesForAgent(agentId: number): ChallengeRow[] {
  const now = Date.now();
  // Expire stale challenges
  getDb().run("UPDATE challenges SET status = 'expired' WHERE target_agent_id = ? AND status = 'pending' AND expires_at < ?", [agentId, now]);
  return getDb().query("SELECT * FROM challenges WHERE target_agent_id = ? AND status = 'pending'").all(agentId) as ChallengeRow[];
}
```

### Unit Tests

- `src/orchestrator/matchmaker.test.ts` — auto-match pairs by bracket; no cross-operator bias; no match when <2 eligible
- `src/orchestrator/challenge.test.ts` — create challenge; accept; decline; expire; cross-bracket rejection; self-challenge rejection

---

## Phase 3: Leaderboard + Operator Dashboard API

### Affected Files

- `src/storage/leaderboard.ts` — **NEW** — ranking + replay queries
- `src/gateway/routes/dashboard.ts` — **NEW** — operator dashboard endpoints
- `src/gateway/routes/public.ts` — **NEW** — public leaderboard + replay endpoints
- `src/server.ts` — mount new routes

### Changes

**`src/storage/leaderboard.ts`**:

```typescript
import { getDb } from "./db";

export interface LeaderboardEntry {
  rank: number;
  agentId: number;
  agentName: string;
  operatorHandle: string;
  bracket: string;
  wins: number;
  losses: number;
  draws: number;
  score: number; // wins * 3 + draws
}

export function getLeaderboard(bracket: string, limit = 50): LeaderboardEntry[] {
  const rows = getDb().query(`
    SELECT
      av.id as agentId, av.name as agentName, o.handle as operatorHandle, av.bracket,
      COALESCE(SUM(CASE WHEN m.outcome = 'A_win' AND m.agent_a_id = av.id THEN 1 WHEN m.outcome = 'B_win' AND m.agent_b_id = av.id THEN 1 ELSE 0 END), 0) as wins,
      COALESCE(SUM(CASE WHEN m.outcome = 'A_win' AND m.agent_b_id = av.id THEN 1 WHEN m.outcome = 'B_win' AND m.agent_a_id = av.id THEN 1 ELSE 0 END), 0) as losses,
      COALESCE(SUM(CASE WHEN m.outcome = 'draw' THEN 1 ELSE 0 END), 0) as draws
    FROM agent_versions av
    JOIN operators o ON o.id = av.operator_id
    LEFT JOIN matches m ON (m.agent_a_id = av.id OR m.agent_b_id = av.id) AND m.outcome IS NOT NULL
    WHERE av.bracket = ?
    GROUP BY av.id
    ORDER BY (wins * 3 + draws) DESC, av.id ASC
    LIMIT ?
  `).all(bracket, limit);

  return rows.map((row: any, idx: number) => ({
    rank: idx + 1,
    ...row,
    score: row.wins * 3 + row.draws,
  }));
}

export interface ReplayCard {
  matchId: string;
  bracket: string;
  agentA: string;
  agentB: string;
  winner: string | null;
  reason: string | null;
  createdAt: number;
}

export function getRecentReplays(bracket?: string, limit = 20): ReplayCard[] {
  const query = bracket
    ? "SELECT m.id as matchId, m.bracket, a.name as agentA, b.name as agentB, m.outcome as winner, m.outcome as reason, m.created_at as createdAt FROM matches m JOIN agent_versions a ON a.id = m.agent_a_id JOIN agent_versions b ON b.id = m.agent_b_id WHERE m.bracket = ? AND m.outcome IS NOT NULL ORDER BY m.completed_at DESC LIMIT ?"
    : "SELECT m.id as matchId, m.bracket, a.name as agentA, b.name as agentB, m.outcome as winner, m.outcome as reason, m.created_at as createdAt FROM matches m JOIN agent_versions a ON a.id = m.agent_a_id JOIN agent_versions b ON b.id = m.agent_b_id WHERE m.outcome IS NOT NULL ORDER BY m.completed_at DESC LIMIT ?";
  const params = bracket ? [bracket, limit] : [limit];
  return getDb().query(query).all(...params) as ReplayCard[];
}

export function getOperatorDashboard(operatorId: number) {
  const agents = getDb().query("SELECT * FROM agent_versions WHERE operator_id = ? ORDER BY created_at DESC").all(operatorId);
  const top5 = getLeaderboard("scout_force", 5); // simplified — show top 5 from primary bracket
  return { agents, top5 };
}
```

**`src/gateway/routes/dashboard.ts`** — operator-scoped:

- `GET /api/arena/dashboard` — returns operator's agents + compact leaderboard
- `POST /api/arena/agents/:id/activate` — designate agent as queue-eligible
- `POST /api/arena/agents/:id/deactivate` — remove from queue
- `GET /api/arena/agents/:id/history` — match history for agent

**`src/gateway/routes/public.ts`** — no auth:

- `GET /api/arena/leaderboard/:bracket` — public leaderboard
- `GET /api/arena/replays` — recent replays with optional `?bracket=` filter
- `GET /api/arena/replays/:matchId` — full match replay data

### Unit Tests

- `src/storage/leaderboard.test.ts` — empty leaderboard; single win ranks correctly; multi-bracket isolation
- `src/gateway/routes/dashboard.test.ts` — auth gate; activate/deactivate toggle; history returns correct matches

---

## Razor Budget

| Item | Lines (est.) |
|------|-------------|
| Storage layer (db + 3 CRUD modules) | ~250 |
| Register + agent routes | ~120 |
| Matchmaker rewrite | ~80 |
| Challenge system | ~100 |
| Leaderboard queries | ~80 |
| Dashboard + public routes | ~150 |
| Tests (6 files) | ~350 |
| **Total** | **~1130** |

## Files NOT Changed

- `src/engine/*` — all engine files unchanged
- `src/projection/*` — all projection files unchanged
- `src/shared/types.ts` — unchanged
- `src/public/*` — all client-side files unchanged
- `demo-replay.js` — unchanged

---

## Acceptance Criteria

1. `POST /api/arena/register` creates an operator with API key
2. `POST /api/arena/agents` creates an agent version with composite fingerprint
3. `GET /api/arena/agents` returns operator's agents with correct verification states
4. Matchmaker pairs agents by bracket from DB-backed queue
5. Challenge system creates, accepts, declines, and expires challenges correctly
6. `GET /api/arena/leaderboard/:bracket` returns ranked entries
7. `GET /api/arena/replays` returns recent completed matches
8. All routes requiring auth return 401 for missing/invalid bearer tokens
9. All existing tests pass (807 tests)
10. Demo replay plays identically
