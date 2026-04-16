/**
 * Partition taxonomy.
 * Tenancy boundaries for all memory ops. Pure helpers — no I/O.
 */

export type Partition =
  | `agent-private:${string}`
  | "shared-operational"
  | "canonical"
  | "audit";

export function agentPrivate(agentId: string): Partition {
  if (!agentId) throw new Error("agentId required for agent-private partition");
  return `agent-private:${agentId}`;
}

export function isAgentPrivate(partition: string): partition is `agent-private:${string}` {
  return partition.startsWith("agent-private:") && partition.length > "agent-private:".length;
}

export function parseAgentId(partition: string): string {
  if (!isAgentPrivate(partition)) {
    throw new Error(`not an agent-private partition: ${partition}`);
  }
  return partition.slice("agent-private:".length);
}

export function stampPartition<T extends Record<string, unknown>>(
  data: T,
  partition: Partition,
): T & { partition: Partition } {
  return { ...data, partition };
}

const STATIC: ReadonlySet<string> = new Set(["shared-operational", "canonical", "audit"]);

export function isValidPartition(partition: string): partition is Partition {
  if (STATIC.has(partition)) return true;
  return isAgentPrivate(partition);
}
