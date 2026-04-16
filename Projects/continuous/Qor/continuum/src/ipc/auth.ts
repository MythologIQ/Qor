/**
 * First-frame token auth.
 * Fail-closed on missing agent map or invalid token.
 * Constant-time token comparison prevents timing oracles.
 */

import { timingSafeEqual } from "node:crypto";
import { stat } from "node:fs/promises";
import { agentPrivate, type Partition } from "../memory/partitions";
import type { AgentContext } from "../memory/access-policy";

export class AuthFailedError extends Error {
  constructor(reason: string) {
    super(`auth failed: ${reason}`);
    this.name = "AuthFailedError";
  }
}

export class AuthConfigError extends Error {
  constructor(reason: string) {
    super(`auth config: ${reason}`);
    this.name = "AuthConfigError";
  }
}

export interface AgentTokenMap {
  readonly [agentId: string]: string;
}

export async function loadAgentTokenMap(path: string): Promise<AgentTokenMap> {
  const st = await stat(path).catch(() => null);
  if (!st) throw new AuthConfigError(`agent token map missing: ${path}`);
  // Require tight permissions on the secret file (owner-only r/w).
  const mode = st.mode & 0o777;
  if (mode !== 0o600) throw new AuthConfigError(`agent token map mode must be 0600, got ${mode.toString(8)}`);
  const raw = await Bun.file(path).text();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new AuthConfigError("agent token map is not JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AuthConfigError("agent token map must be object");
  }
  const map: Record<string, string> = {};
  for (const [agentId, token] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof token !== "string" || token.length === 0) {
      throw new AuthConfigError(`invalid token for agent ${agentId}`);
    }
    map[agentId] = token;
  }
  return map;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.byteLength !== bb.byteLength) {
    // Still perform a comparison of same-length buffers to avoid length-based timing leaks.
    const filler = Buffer.alloc(ba.byteLength);
    timingSafeEqual(ba, filler);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export function resolveAgent(token: string, map: AgentTokenMap): AgentContext {
  if (!token) throw new AuthFailedError("empty token");
  for (const [agentId, expected] of Object.entries(map)) {
    if (safeEqual(token, expected)) {
      const partitions: Partition[] = [agentPrivate(agentId), "shared-operational", "canonical", "audit"];
      return { agentId, partitions };
    }
  }
  throw new AuthFailedError("invalid token");
}
