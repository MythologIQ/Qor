/**
 * Default-deny ACL.
 * Agent may read/write own agent-private partition.
 * shared-operational: read+write per op.
 * canonical: read-only.
 * audit: append-only (write allowed; update/delete denied).
 */

import { isAgentPrivate, isValidPartition, parseAgentId, type Partition } from "./partitions";

export interface AgentContext {
  agentId: string;
  partitions: Partition[];
}

export class AccessDeniedError extends Error {
  constructor(public readonly reason: string) {
    super(`access denied: ${reason}`);
    this.name = "AccessDeniedError";
  }
}

export type Operation = "read" | "write" | "update" | "delete";

function requireCtx(ctx: AgentContext | null | undefined): asserts ctx is AgentContext {
  if (!ctx) throw new AccessDeniedError("agentCtx missing");
  if (!ctx.agentId) throw new AccessDeniedError("agentCtx.agentId missing");
}

function assertValidPartition(partition: string): asserts partition is Partition {
  if (!isValidPartition(partition)) {
    throw new AccessDeniedError(`invalid partition: ${partition}`);
  }
}

function allowedOnAgentPrivate(ctx: AgentContext, partition: string, op: Operation): void {
  const owner = parseAgentId(partition);
  if (owner !== ctx.agentId) {
    throw new AccessDeniedError(`agent ${ctx.agentId} cannot ${op} ${partition}`);
  }
}

function allowedOnCanonical(op: Operation, partition: string): void {
  if (op !== "read") throw new AccessDeniedError(`canonical is read-only (${op} on ${partition})`);
}

function allowedOnAudit(op: Operation, partition: string): void {
  if (op === "update" || op === "delete") {
    throw new AccessDeniedError(`audit is append-only (${op} on ${partition})`);
  }
}

export function assertAccess(
  ctx: AgentContext | null | undefined,
  partition: string,
  op: Operation,
  _opName: string,
): void {
  requireCtx(ctx);
  assertValidPartition(partition);
  if (isAgentPrivate(partition)) return allowedOnAgentPrivate(ctx, partition, op);
  if (partition === "canonical") return allowedOnCanonical(op, partition);
  if (partition === "audit") return allowedOnAudit(op, partition);
  // shared-operational: read/write allowed; update/delete denied by default.
  if (op === "update" || op === "delete") {
    throw new AccessDeniedError(`shared-operational disallows ${op}`);
  }
}

export function assertCanRead(ctx: AgentContext | null | undefined, partition: string, opName: string) {
  assertAccess(ctx, partition, "read", opName);
}

export function assertCanWrite(ctx: AgentContext | null | undefined, partition: string, opName: string) {
  assertAccess(ctx, partition, "write", opName);
}
