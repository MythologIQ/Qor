/** Phase 3: Procedural layer — temporal chain discovery + outcome-anchored promotion */

import { createHash } from "crypto";
import neo4j from "neo4j-driver";
import { queryGraph } from "../service/graph-api";
import type { Chain, Pattern, ProceduralNode } from "./types";

export async function extractTemporalChains(
  minLength = 3,
  agent?: string
): Promise<Chain[]> {
  const agentFilter = agent ? "AND n.agent = $agent" : "";
  const rows = await queryGraph(
    `MATCH path = (n)-[:FOLLOWED_BY*${minLength - 1}..8]->(m)
     WHERE n.timestamp IS NOT NULL ${agentFilter}
     WITH nodes(path) AS chain
     RETURN [x IN chain | {
       id: x.id, type: x.type, agent: x.agent,
       timestamp: x.timestamp
     }] AS steps,
     chain[0].sessionId AS sessionId
     LIMIT 500`,
    { agent: agent ?? "" }
  );

  const chains: Chain[] = [];
  for (const row of rows) {
    const steps = row.steps as { id: string; type: string; agent: string; timestamp: number }[];
    if (steps.length < minLength) continue;
    chains.push({
      records: steps.map((s) => ({ ...s, entities: [] })),
      sessionId: (row.sessionId as string) ?? "",
    });
  }
  return chains;
}

export function fingerprint(chain: Chain): string {
  const sig = chain.records.map((r) => r.type).join("|");
  return createHash("sha256").update(sig).digest("hex").slice(0, 16);
}

export function findRepeatingPatterns(
  chains: Chain[],
  minOccurrences = 2
): Pattern[] {
  const groups = new Map<string, Chain[]>();
  for (const chain of chains) {
    const fp = fingerprint(chain);
    const list = groups.get(fp) ?? [];
    list.push(chain);
    groups.set(fp, list);
  }

  const patterns: Pattern[] = [];
  for (const [fp, grouped] of groups) {
    if (grouped.length < minOccurrences) continue;
    const representative = grouped[0];
    patterns.push({
      fingerprint: fp,
      chains: grouped,
      steps: representative.records.map((r) => ({
        action: r.type,
        entity: r.entities[0],
      })),
    });
  }
  return patterns;
}

export function createCandidateProcedure(pattern: Pattern): ProceduralNode {
  const now = new Date().toISOString();
  const earliest = Math.min(...pattern.chains.flatMap((c) => c.records.map((r) => r.timestamp)));
  const latest = Math.max(...pattern.chains.flatMap((c) => c.records.map((r) => r.timestamp)));
  return {
    id: `proc-${pattern.fingerprint}`,
    type: "procedural",
    status: "candidate",
    label: pattern.steps.map((s) => s.action).join(" → "),
    steps: pattern.steps.map((s) => ({ action: s.action, entity: s.entity })),
    occurrences: pattern.chains.length,
    successRate: 0,
    firstSeen: new Date(earliest).toISOString(),
    lastSeen: new Date(latest).toISOString(),
  };
}

const OUTCOME_TYPES = new Set(["task_complete", "evidence_seal", "governance_verdict"]);

export async function checkOutcomeEvidence(
  procedure: ProceduralNode
): Promise<{ hasOutcome: boolean; successRate: number; outcomeType: string }> {
  const terminalAction = procedure.steps[procedure.steps.length - 1]?.action ?? "";
  if (OUTCOME_TYPES.has(terminalAction)) {
    return { hasOutcome: true, successRate: 0.8, outcomeType: terminalAction };
  }
  return { hasOutcome: false, successRate: 0, outcomeType: "" };
}

const PROMOTE_MIN_OCCURRENCES = 3;
const PROMOTE_MIN_SUCCESS = 0.6;

export function promoteProcedure(
  candidate: ProceduralNode,
  evidence: { successRate: number; outcomeType: string }
): ProceduralNode {
  if (candidate.occurrences < PROMOTE_MIN_OCCURRENCES) return candidate;
  if (evidence.successRate < PROMOTE_MIN_SUCCESS) return candidate;
  return {
    ...candidate,
    status: "validated",
    successRate: evidence.successRate,
    outcomeType: evidence.outcomeType,
  };
}

async function persistProcedures(nodes: ProceduralNode[]): Promise<number> {
  let written = 0;
  for (const node of nodes) {
    const statusLabel = node.status === "validated" ? "Validated" : "Candidate";
    await queryGraph(
      `MERGE (p:Procedural:${statusLabel} {id: $id})
       SET p.label = $label, p.status = $status,
           p.occurrences = $occ, p.successRate = $rate,
           p.outcomeType = $outcome, p.firstSeen = $firstSeen,
           p.lastSeen = $lastSeen`,
      { id: node.id, label: node.label, status: node.status,
        occ: node.occurrences, rate: node.successRate,
        outcome: node.outcomeType ?? "", firstSeen: node.firstSeen, lastSeen: node.lastSeen }
    );
    written++;
  }
  return written;
}

export async function getProcedures(
  status?: string,
  limit = 50
): Promise<ProceduralNode[]> {
  const filter = status && status !== "all" ? "AND p.status = $status" : "";
  const rows = await queryGraph(
    `MATCH (p:Procedural)
     WHERE p.id IS NOT NULL ${filter}
     RETURN p.id AS id, p.label AS label, p.status AS status,
            p.occurrences AS occurrences, p.successRate AS successRate,
            p.outcomeType AS outcomeType,
            p.firstSeen AS firstSeen, p.lastSeen AS lastSeen
     ORDER BY p.occurrences DESC
     LIMIT $limit`,
    { status: status ?? "", limit: neo4j.int(limit) }
  );
  return rows.map((r) => ({
    id: r.id as string,
    type: "procedural" as const,
    status: (r.status as "candidate" | "validated") ?? "candidate",
    label: r.label as string,
    steps: [],
    occurrences: r.occurrences as number,
    successRate: (r.successRate as number) ?? 0,
    outcomeType: (r.outcomeType as string) || undefined,
    firstSeen: r.firstSeen as string,
    lastSeen: r.lastSeen as string,
  }));
}

export async function runProcedureMining(): Promise<{
  candidates: number;
  promoted: number;
}> {
  const chains = await extractTemporalChains();
  const patterns = findRepeatingPatterns(chains);
  const procedures: ProceduralNode[] = [];

  for (const pattern of patterns) {
    let proc = createCandidateProcedure(pattern);
    const evidence = await checkOutcomeEvidence(proc);
    if (evidence.hasOutcome) {
      proc = promoteProcedure(proc, evidence);
    }
    procedures.push(proc);
  }

  await persistProcedures(procedures);

  const candidates = procedures.filter((p) => p.status === "candidate").length;
  const promoted = procedures.filter((p) => p.status === "validated").length;
  return { candidates, promoted };
}
