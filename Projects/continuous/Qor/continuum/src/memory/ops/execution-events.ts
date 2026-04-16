/**
 * ExecutionEvent ops — distinct from LearningPacket.
 * Execution events are raw, per-dispatch telemetry.
 * LearningPacket contract is untouched; this is an entirely separate shape.
 */

import type { Session } from "neo4j-driver";
import { getDriver } from "../driver";
import { agentPrivate, type Partition } from "../partitions";
import { assertCanRead, assertCanWrite, type AgentContext } from "../access-policy";

export type ExecutionStatus = "completed" | "blocked" | "failed" | "quarantined";

export interface ExecutionEvent {
  readonly id: string;
  readonly agentId: string;
  readonly partition: Partition;
  readonly taskId: string;
  readonly phaseId?: string;
  readonly source: string;
  readonly status: ExecutionStatus;
  readonly timestamp: number;
  readonly summary?: string;
  readonly testsPassed?: number;
  readonly filesChanged?: string[];
  readonly acceptanceMet?: boolean;
  readonly verdict?: string;
}

export class ValidationError extends Error {
  constructor(reason: string) {
    super(`ExecutionEvent validation failed: ${reason}`);
    this.name = "ValidationError";
  }
}

const STATUSES: ReadonlySet<ExecutionStatus> = new Set(["completed", "blocked", "failed", "quarantined"]);

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`${field} must be non-empty string`);
  }
  return value;
}

export function validateExecutionEvent(value: unknown): ExecutionEvent {
  if (!value || typeof value !== "object") throw new ValidationError("event must be object");
  const e = value as Record<string, unknown>;
  const id = requireString(e.id, "id");
  const agentId = requireString(e.agentId, "agentId");
  const partition = requireString(e.partition, "partition");
  const taskId = requireString(e.taskId, "taskId");
  const source = requireString(e.source, "source");
  if (typeof e.status !== "string" || !STATUSES.has(e.status as ExecutionStatus)) {
    throw new ValidationError(`status must be one of ${[...STATUSES].join("|")}`);
  }
  if (typeof e.timestamp !== "number" || !Number.isInteger(e.timestamp) || e.timestamp <= 0) {
    throw new ValidationError("timestamp must be positive int");
  }
  return {
    id, agentId, partition: partition as Partition, taskId, source,
    status: e.status as ExecutionStatus,
    timestamp: e.timestamp,
    phaseId: typeof e.phaseId === "string" && e.phaseId.length ? e.phaseId : undefined,
    summary: typeof e.summary === "string" ? e.summary : undefined,
    testsPassed: typeof e.testsPassed === "number" ? e.testsPassed : undefined,
    filesChanged: Array.isArray(e.filesChanged) ? e.filesChanged.filter((x) => typeof x === "string") as string[] : undefined,
    acceptanceMet: typeof e.acceptanceMet === "boolean" ? e.acceptanceMet : undefined,
    verdict: typeof e.verdict === "string" ? e.verdict : undefined,
  };
}

export interface ExecutionIntentLike {
  readonly taskId: string;
  readonly phaseId?: string;
  readonly source: string;
  readonly agent?: string;
}

export interface ExecutionResultLike {
  readonly status: ExecutionStatus;
  readonly summary?: string;
  readonly testsPassed?: number;
  readonly filesChanged?: string[];
  readonly acceptanceMet?: string[] | boolean;
  readonly reason?: string;
}

function resolveAgent(intent: ExecutionIntentLike): string {
  return intent.agent && intent.agent.length ? intent.agent : "victor";
}

function deriveAcceptance(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  return undefined;
}

export function createExecutionEvent(
  intent: ExecutionIntentLike,
  result: ExecutionResultLike,
): ExecutionEvent {
  const agentId = resolveAgent(intent);
  const event: ExecutionEvent = {
    id: `exec-${intent.taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    agentId,
    partition: agentPrivate(agentId),
    taskId: intent.taskId,
    phaseId: intent.phaseId,
    source: intent.source,
    status: result.status,
    timestamp: Date.now(),
    summary: result.summary,
    testsPassed: result.testsPassed,
    filesChanged: result.filesChanged,
    acceptanceMet: deriveAcceptance(result.acceptanceMet),
    verdict: result.reason,
  };
  return validateExecutionEvent(event);
}

async function withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
  const session = getDriver().session();
  try { return await fn(session); } finally { await session.close(); }
}

export async function recordExecutionEvent(
  params: { event: unknown },
  ctx: AgentContext,
): Promise<{ id: string }> {
  const event = validateExecutionEvent(params.event);
  assertCanWrite(ctx, event.partition, "events.execution.record");
  if (event.agentId !== ctx.agentId) {
    throw new ValidationError(`event.agentId ${event.agentId} mismatches agentCtx ${ctx.agentId}`);
  }
  await withSession((session) =>
    session.run(
      `MERGE (x:ExecutionEvent {id: $id})
       ON CREATE SET x.agent_id = $agentId, x.partition = $partition,
         x.task_id = $taskId, x.phase_id = $phaseId, x.source = $source,
         x.status = $status, x.timestamp = $timestamp, x.summary = $summary,
         x.tests_passed = $testsPassed, x.files_changed = $filesChanged,
         x.acceptance_met = $acceptanceMet, x.verdict = $verdict`,
      {
        id: event.id, agentId: event.agentId, partition: event.partition,
        taskId: event.taskId, phaseId: event.phaseId ?? null, source: event.source,
        status: event.status, timestamp: event.timestamp,
        summary: event.summary ?? null,
        testsPassed: event.testsPassed ?? null,
        filesChanged: event.filesChanged ?? [],
        acceptanceMet: event.acceptanceMet ?? null,
        verdict: event.verdict ?? null,
      },
    ),
  );
  return { id: event.id };
}

export interface ExecutionQuery {
  readonly taskId?: string;
  readonly status?: ExecutionStatus;
  readonly sinceTimestamp?: number;
  readonly limit?: number;
}

export async function queryExecutionEvents(
  params: { filter?: ExecutionQuery },
  ctx: AgentContext,
): Promise<ExecutionEvent[]> {
  const partition = agentPrivate(ctx.agentId);
  assertCanRead(ctx, partition, "events.execution.query");
  const filter = params.filter ?? {};
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 1000);
  const rows = await withSession((session) =>
    session.run(
      `MATCH (x:ExecutionEvent)
       WHERE x.partition = $partition
         AND ($taskId IS NULL OR x.task_id = $taskId)
         AND ($status IS NULL OR x.status = $status)
         AND ($since IS NULL OR x.timestamp >= $since)
       RETURN x.id AS id, x.agent_id AS agentId, x.partition AS partition,
              x.task_id AS taskId, x.phase_id AS phaseId, x.source AS source,
              x.status AS status, x.timestamp AS timestamp, x.summary AS summary,
              x.tests_passed AS testsPassed, x.files_changed AS filesChanged,
              x.acceptance_met AS acceptanceMet, x.verdict AS verdict
       ORDER BY x.timestamp DESC LIMIT toInteger($limit)`,
      {
        partition, limit,
        taskId: filter.taskId ?? null,
        status: filter.status ?? null,
        since: filter.sinceTimestamp ?? null,
      },
    ),
  );
  return rows.records.map((r) => validateExecutionEvent({
    id: r.get("id"),
    agentId: r.get("agentId"),
    partition: r.get("partition"),
    taskId: r.get("taskId"),
    phaseId: r.get("phaseId") ?? undefined,
    source: r.get("source"),
    status: r.get("status"),
    timestamp: typeof r.get("timestamp") === "object" ? r.get("timestamp").toNumber() : r.get("timestamp"),
    summary: r.get("summary") ?? undefined,
    testsPassed: r.get("testsPassed") ?? undefined,
    filesChanged: r.get("filesChanged") ?? undefined,
    acceptanceMet: r.get("acceptanceMet") ?? undefined,
    verdict: r.get("verdict") ?? undefined,
  }));
}
