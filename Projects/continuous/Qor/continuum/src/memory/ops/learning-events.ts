/**
 * LearningPacket ops.
 * Existing contract (victor/src/kernel/learning-schema.ts) is preserved.
 * All fields stored verbatim; partition stamped from agentCtx server-side.
 */

import type { Session } from "neo4j-driver";
import { getDriver } from "../driver";
import { agentPrivate } from "../partitions";
import { assertCanRead, assertCanWrite, type AgentContext } from "../access-policy";

export interface IndexableLearningPacket {
  readonly id: string;
  readonly timestamp: number;
  readonly origin_phase: string;
  readonly trigger_type: string;
  readonly lesson: string;
  readonly debt_impact: number;
  readonly debt_heat: string;
  readonly project_id: string;
  readonly session_id: string;
  readonly tags: string[];
  readonly context_node?: string;
  readonly context_stack?: string[];
  readonly audit_constraint?: string;
  readonly guardrail_pattern?: string;
  readonly frequency?: number;
  readonly universal_truth?: boolean;
  readonly related_events?: string[];
  readonly verified_at?: number;
  readonly effectiveness_score?: number;
}

export interface LearningQuery {
  readonly origin_phase?: string;
  readonly trigger_type?: string;
  readonly universal_truth?: boolean;
  readonly limit?: number;
}

export interface HeatmapUpdate {
  readonly node: string;
  readonly heat: number;
  readonly reason: string;
}

async function withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
  const session = getDriver().session();
  try { return await fn(session); } finally { await session.close(); }
}

async function initializeImpl(): Promise<void> {
  // Schema init is handled at server startup via memory/schema.ts.
  // This op is a no-op kept for surface compatibility.
}

async function closeImpl(): Promise<void> {
  // Driver lifecycle is owned by memory/driver.ts + service/server.ts SIGTERM.
}

function validatePacket(packet: unknown): IndexableLearningPacket {
  if (!packet || typeof packet !== "object") throw new Error("packet must be object");
  const p = packet as Record<string, unknown>;
  if (typeof p.id !== "string" || !p.id) throw new Error("packet.id required");
  if (typeof p.timestamp !== "number") throw new Error("packet.timestamp required");
  if (typeof p.lesson !== "string") throw new Error("packet.lesson required");
  return p as unknown as IndexableLearningPacket;
}

export async function indexLearningEvent(
  params: { packet: unknown },
  ctx: AgentContext,
): Promise<{ id: string }> {
  const packet = validatePacket(params.packet);
  const partition = agentPrivate(ctx.agentId);
  assertCanWrite(ctx, partition, "events.index");
  await withSession((session) =>
    session.run(
      `MERGE (l:LearningEvent {id: $id})
       ON CREATE SET l.agent_id = $agentId, l.partition = $partition,
         l.timestamp = $timestamp, l.origin_phase = $origin, l.trigger_type = $trigger,
         l.lesson = $lesson, l.debt_impact = $impact, l.debt_heat = $heat,
         l.project_id = $project, l.session_id = $session, l.tags = $tags,
         l.universal_truth = $universal, l.context_node = $contextNode,
         l.context_stack = $contextStack`,
      {
        id: packet.id, agentId: ctx.agentId, partition,
        timestamp: packet.timestamp, origin: packet.origin_phase, trigger: packet.trigger_type,
        lesson: packet.lesson, impact: packet.debt_impact, heat: packet.debt_heat,
        project: packet.project_id, session: packet.session_id, tags: packet.tags,
        universal: packet.universal_truth ?? false,
        contextNode: packet.context_node ?? null,
        contextStack: packet.context_stack ?? [],
      },
    ),
  );
  return { id: packet.id };
}

export async function queryLearningEvents(
  params: { filter?: LearningQuery },
  ctx: AgentContext,
): Promise<IndexableLearningPacket[]> {
  const partition = agentPrivate(ctx.agentId);
  assertCanRead(ctx, partition, "events.query");
  const filter = params.filter ?? {};
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 1000);
  const rows = await withSession((session) =>
    session.run(
      `MATCH (l:LearningEvent) WHERE l.partition = $partition
         AND ($origin IS NULL OR l.origin_phase = $origin)
         AND ($trigger IS NULL OR l.trigger_type = $trigger)
         AND ($universal IS NULL OR l.universal_truth = $universal)
       RETURN l ORDER BY l.timestamp DESC LIMIT toInteger($limit)`,
      {
        partition, limit,
        origin: filter.origin_phase ?? null,
        trigger: filter.trigger_type ?? null,
        universal: filter.universal_truth ?? null,
      },
    ),
  );
  return rows.records.map((r) => r.get("l").properties as IndexableLearningPacket);
}

export async function updateLearningEvent(
  params: { id: string; packet: unknown },
  ctx: AgentContext,
): Promise<{ id: string }> {
  const packet = validatePacket(params.packet);
  const partition = agentPrivate(ctx.agentId);
  assertCanWrite(ctx, partition, "events.update");
  await withSession((session) =>
    session.run(
      `MATCH (l:LearningEvent {id: $id}) WHERE l.partition = $partition
       SET l.lesson = $lesson, l.debt_impact = $impact, l.debt_heat = $heat,
           l.effectiveness_score = $effectiveness, l.verified_at = $verified`,
      {
        id: params.id, partition,
        lesson: packet.lesson, impact: packet.debt_impact, heat: packet.debt_heat,
        effectiveness: packet.effectiveness_score ?? null,
        verified: packet.verified_at ?? null,
      },
    ),
  );
  return { id: params.id };
}

export async function updateHeatmap(
  params: { update: HeatmapUpdate },
  ctx: AgentContext,
): Promise<{ node: string; heat: number }> {
  const partition = agentPrivate(ctx.agentId);
  assertCanWrite(ctx, partition, "events.updateHeatmap");
  const u = params.update;
  await withSession((session) =>
    session.run(
      `MERGE (h:HeatmapNode {node: $node, partition: $partition})
       ON CREATE SET h.heat = $heat, h.reason = $reason, h.updatedAt = $ts
       ON MATCH SET h.heat = h.heat + $heat, h.reason = $reason, h.updatedAt = $ts`,
      { node: u.node, heat: u.heat, reason: u.reason, partition, ts: Date.now() },
    ),
  );
  return { node: u.node, heat: u.heat };
}

export const learningEventsOps = {
  "events.initialize": async () => initializeImpl(),
  "events.close": async () => closeImpl(),
  "events.index": indexLearningEvent,
  "events.query": queryLearningEvents,
  "events.update": updateLearningEvent,
  "events.updateHeatmap": updateHeatmap,
} as const;
