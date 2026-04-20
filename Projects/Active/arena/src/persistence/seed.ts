// HexaWars Arena — Demo Seed Fixture (Plan A v2, Phase 3.5)
// Idempotent synthetic match for UI bootstrapping. Gated at boot by
// ARENA_SEED_DEMO=1. origin_tag prefix "seed:" is the exclusion key
// Plan B's matchmaker must honor — these rows never enter competition.

import type { Database } from "bun:sqlite";
import { saveMatch, appendEvents, getMatch } from "./match-store";

export const DEMO_SEED_MATCH_ID = "seed-demo-v1";
const SEED_CREATED_AT = 1_713_400_000;
const SEED_ORIGIN = "seed:demo-v1";
const SEED_OUTCOME = "A_wins";
const EVENT_COUNT = 30;

export interface SeedResult {
  matchId: string;
  eventCount: number;
  alreadySeeded: boolean;
}

interface SeededOperator {
  id: number;
  tokenId: string;
}

export function seedDemoMatch(db: Database): SeedResult {
  const existing = getMatch(db, DEMO_SEED_MATCH_ID);
  if (existing) {
    const n = db
      .prepare("SELECT COUNT(*) AS n FROM match_events WHERE match_id = ?")
      .get(DEMO_SEED_MATCH_ID) as { n: number };
    return {
      matchId: DEMO_SEED_MATCH_ID,
      eventCount: n.n,
      alreadySeeded: true,
    };
  }

  const opA = ensureOperator(db, "demo_greedy", "seedid-greedy-00");
  const opB = ensureOperator(db, "demo_random", "seedid-random-00");
  const agentA = ensureAgent(db, opA.id, "fp-demo-greedy", "builtin-greedy-v1");
  const agentB = ensureAgent(db, opB.id, "fp-demo-random", "builtin-random-v1");

  saveMatch(db, {
    id: DEMO_SEED_MATCH_ID,
    operatorAId: opA.id,
    operatorBId: opB.id,
    agentAId: agentA,
    agentBId: agentB,
    originTag: SEED_ORIGIN,
    outcome: SEED_OUTCOME,
    createdAt: SEED_CREATED_AT,
  });
  appendEvents(db, DEMO_SEED_MATCH_ID, buildEventStream());

  return {
    matchId: DEMO_SEED_MATCH_ID,
    eventCount: EVENT_COUNT,
    alreadySeeded: false,
  };
}

function ensureOperator(
  db: Database,
  handle: string,
  tokenId: string,
): SeededOperator {
  const existing = db
    .prepare("SELECT id, token_id AS tokenId FROM operators WHERE handle = ?")
    .get(handle) as { id: number; tokenId: string } | undefined;
  if (existing) return { id: existing.id, tokenId: existing.tokenId };
  const salt = Buffer.alloc(16, 0);
  const hash = Buffer.alloc(32, 0);
  const row = db
    .prepare(
      `INSERT INTO operators
         (handle, handle_normalized, token_id, token_salt, token_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, token_id AS tokenId`,
    )
    .get(handle, handle, tokenId, salt, hash, SEED_CREATED_AT) as {
      id: number;
      tokenId: string;
    };
  return { id: row.id, tokenId: row.tokenId };
}

function ensureAgent(
  db: Database,
  operatorId: number,
  fingerprint: string,
  modelId: string,
): number {
  const row = db
    .prepare(
      `INSERT INTO agent_versions
         (operator_id, fingerprint, model_id, similarity_flags_json, created_at)
       VALUES (?, ?, ?, NULL, ?)
       RETURNING id`,
    )
    .get(operatorId, fingerprint, modelId, SEED_CREATED_AT) as { id: number };
  return row.id;
}

function buildEventStream(): Array<{
  seq: number;
  eventType: string;
  payload: string;
  ts: number;
}> {
  const kinds = ["unit_moved", "unit_attacked", "territory_claimed", "turn_ended"];
  const events = [];
  for (let i = 1; i <= EVENT_COUNT; i++) {
    const kind = kinds[i % kinds.length];
    events.push({
      seq: i,
      eventType: kind,
      payload: JSON.stringify({ step: i, actor: i % 2 === 0 ? "A" : "B" }),
      ts: SEED_CREATED_AT + i,
    });
  }
  return events;
}
