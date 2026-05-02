/**
 * events.ledger.* ops — hash-chained ledger entries in Neo4j.
 * Distinct from LearningPacket; owns :LedgerEntry label.
 * Server auto-stamps partition = agentPrivate(ctx.agentId).
 */

import { randomUUID } from "node:crypto";
import { getDriver } from "../driver";
import { agentPrivate } from "../partitions";
import { assertCanRead, assertCanWrite, type AgentContext } from "../access-policy";
import { computeHash } from "../../shared/hash-chain";

export interface LedgerEntry {
  readonly id: string;
  readonly partition: string;
  readonly agentId: string;
  readonly seq: number;
  readonly type: string;
  readonly hash: string;
  readonly prevHash: string;
  readonly timestamp: number;
  readonly payload: string;
  readonly provenance: string;
}

async function withSession<T>(fn: (s: import("neo4j-driver").Session) => Promise<T>): Promise<T> {
  const session = getDriver().session();
  try { return await fn(session); } finally { await session.close(); }
}

async function getLastEntry(partition: string): Promise<{ seq: number; hash: string } | null> {
  const rows = await withSession((s) =>
    s.run(
      `MATCH (l:LedgerEntry {partition: $partition})
       RETURN l.seq AS seq, l.hash AS hash
       ORDER BY l.seq DESC LIMIT 1`,
      { partition },
    ),
  );
  if (rows.records.length === 0) return null;
  const r = rows.records[0];
  return { seq: typeof r.get("seq") === "object" ? r.get("seq").toNumber() : Number(r.get("seq")), hash: r.get("hash") };
}

export async function appendLedgerEntry(
  params: { type: string; payload?: unknown; provenance?: unknown; mode?: string; seq?: number; hash?: string; prevHash?: string; timestamp?: number },
  ctx: AgentContext,
): Promise<{ id: string; seq: number; hash: string; prevHash: string; timestamp: number }> {
  const partition = agentPrivate(ctx.agentId);
  assertCanWrite(ctx, partition, "events.ledger.append");

  if (params.mode === "import") {
    if (process.env.QOR_LEDGER_IMPORT !== "1") {
      throw new Error("import mode disabled");
    }
    const id = `ledger-${randomUUID()}`;
    const ts = params.timestamp ?? Date.now();
    await withSession((s) =>
      s.run(
        `CREATE (l:LedgerEntry {id: $id, partition: $partition, agent_id: $agentId,
          seq: $seq, type: $type, hash: $hash, prev_hash: $prevHash,
          timestamp: $timestamp, payload: $payload, provenance: $provenance})`,
        {
          id, partition, agentId: ctx.agentId,
          seq: params.seq ?? 1, type: params.type,
          hash: params.hash ?? "", prevHash: params.prevHash ?? "genesis",
          timestamp: ts,
          payload: JSON.stringify(params.payload ?? {}),
          provenance: JSON.stringify(params.provenance ?? {}),
        },
      ),
    );
    return { id, seq: params.seq ?? 1, hash: params.hash ?? "", prevHash: params.prevHash ?? "genesis", timestamp: ts };
  }

  const last = await getLastEntry(partition);
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? "genesis";
  const hash = computeHash(prevHash, params.type, params.payload);
  const id = `ledger-${randomUUID()}`;
  const ts = Date.now();

  await withSession((s) =>
    s.run(
      `CREATE (l:LedgerEntry {id: $id, partition: $partition, agent_id: $agentId,
        seq: $seq, type: $type, hash: $hash, prev_hash: $prevHash,
        timestamp: $timestamp, payload: $payload, provenance: $provenance})`,
      {
        id, partition, agentId: ctx.agentId,
        seq, type: params.type, hash, prevHash, timestamp: ts,
        payload: JSON.stringify(params.payload ?? {}),
        provenance: JSON.stringify(params.provenance ?? {}),
      },
    ),
  );
  return { id, seq, hash, prevHash, timestamp: ts };
}

export async function queryLedgerEntries(
  params: { limit?: number; orderBy?: string },
  ctx: AgentContext,
): Promise<LedgerEntry[]> {
  const partition = agentPrivate(ctx.agentId);
  assertCanRead(ctx, partition, "events.ledger.query");
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);
  const order = params.orderBy === "seq ASC" ? "ASC" : "DESC";

  const rows = await withSession((s) =>
    s.run(
      `MATCH (l:LedgerEntry {partition: $partition})
       RETURN l.id AS id, l.partition AS partition, l.agent_id AS agentId,
              l.seq AS seq, l.type AS type, l.hash AS hash, l.prev_hash AS prevHash,
              l.timestamp AS timestamp, l.payload AS payload, l.provenance AS provenance
       ORDER BY l.seq ${order} LIMIT toInteger($limit)`,
      { partition, limit },
    ),
  );
  return rows.records.map((r) => ({
    id: r.get("id"),
    partition: r.get("partition"),
    agentId: r.get("agentId"),
    seq: typeof r.get("seq") === "object" ? r.get("seq").toNumber() : Number(r.get("seq")),
    type: r.get("type"),
    hash: r.get("hash"),
    prevHash: r.get("prevHash"),
    timestamp: typeof r.get("timestamp") === "object" ? r.get("timestamp").toNumber() : Number(r.get("timestamp")),
    payload: r.get("payload"),
    provenance: r.get("provenance"),
  }));
}

export async function getLastLedgerHash(
  _params: unknown,
  ctx: AgentContext,
): Promise<{ hash: string | null; seq: number | null }> {
  const partition = agentPrivate(ctx.agentId);
  assertCanRead(ctx, partition, "events.ledger.getLastHash");
  const last = await getLastEntry(partition);
  return last ? { hash: last.hash, seq: last.seq } : { hash: null, seq: null };
}

export const ledgerEventsOps: Record<string, (params: any, ctx: AgentContext) => Promise<unknown>> = {
  "events.ledger.append": appendLedgerEntry,
  "events.ledger.query": queryLedgerEntries,
  "events.ledger.getLastHash": getLastLedgerHash,
};
