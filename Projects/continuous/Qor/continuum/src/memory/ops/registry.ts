/**
 * Named-op dispatch table.
 * Single source of truth for what ops exist.
 * ipc/server.ts dispatches via this table; every op is ACL-gated.
 */

import type { AgentContext } from "../access-policy";
import { learningEventsOps } from "./learning-events";
import { ledgerEventsOps } from "./ledger-events";
import { recordExecutionEvent, queryExecutionEvents } from "./execution-events";
import { semanticGraphOps } from "./semantic-graph";
import { searchOps } from "./search";

export type OpHandler = (params: any, ctx: AgentContext) => Promise<unknown>;

export class UnknownOpError extends Error {
  constructor(name: string) {
    super(`unknown op: ${name}`);
    this.name = "UnknownOpError";
  }
}

export const OP_TABLE: Readonly<Record<string, OpHandler>> = Object.freeze({
  ...learningEventsOps,
  ...ledgerEventsOps,
  "events.execution.record": recordExecutionEvent,
  "events.execution.query": queryExecutionEvents,
  ...semanticGraphOps,
  ...searchOps,
});

export function dispatchOp(
  name: string,
  params: unknown,
  ctx: AgentContext,
): Promise<unknown> {
  const handler = OP_TABLE[name];
  if (!handler) throw new UnknownOpError(name);
  return handler(params, ctx);
}

export function listOps(): string[] {
  return Object.keys(OP_TABLE).sort();
}
