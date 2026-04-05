/** Phase 1: Incremental co-occurrence derivation for semantic layer */

import neo4j from "neo4j-driver";
import { queryGraph } from "../service/graph-api";
import type { EpisodicRecord, CoOccurrence, SemanticNode } from "./types";

export function findCoOccurrences(
  records: EpisodicRecord[],
  minCount = 3
): CoOccurrence[] {
  const pairMap = new Map<string, CoOccurrence>();

  for (const rec of records) {
    const ents = rec.entities;
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        const key = [ents[i], ents[j]].sort().join("||");
        const existing = pairMap.get(key);
        if (existing) {
          existing.count++;
          existing.recordIds.push(rec.id);
          existing.lastSeen = rec.timestamp.toString();
        } else {
          const [a, b] = key.split("||");
          pairMap.set(key, {
            entityA: a,
            entityB: b,
            count: 1,
            recordIds: [rec.id],
            firstSeen: rec.timestamp.toString(),
            lastSeen: rec.timestamp.toString(),
          });
        }
      }
    }
  }

  return [...pairMap.values()].filter((p) => p.count >= minCount);
}

export function createSemanticNode(cooc: CoOccurrence): SemanticNode {
  return {
    id: `sem-cooc-${cooc.entityA}-${cooc.entityB}`.toLowerCase().replace(/\s+/g, "-"),
    type: "semantic",
    subtype: "co-occurrence",
    label: `${cooc.entityA} + ${cooc.entityB}`,
    entities: [cooc.entityA, cooc.entityB],
    confidence: Math.min(1.0, cooc.count / 20),
    episodicCount: cooc.count,
    firstSeen: cooc.firstSeen,
    lastSeen: cooc.lastSeen,
  };
}

export function mergeSemanticNode(
  existing: SemanticNode,
  newRecordIds: string[],
  lastSeen: string
): SemanticNode {
  const updated = { ...existing };
  updated.episodicCount += newRecordIds.length;
  updated.confidence = Math.min(1.0, updated.episodicCount / 20);
  updated.lastSeen = lastSeen;
  return updated;
}

export function deriveIncrementalSemantic(
  newRecord: EpisodicRecord,
  existingNodes: SemanticNode[]
): SemanticNode[] {
  const results: SemanticNode[] = [];
  const ents = newRecord.entities;
  const ts = newRecord.timestamp.toString();

  for (let i = 0; i < ents.length; i++) {
    for (let j = i + 1; j < ents.length; j++) {
      const pair = [ents[i], ents[j]].sort();
      const nodeId = `sem-cooc-${pair[0]}-${pair[1]}`.toLowerCase().replace(/\s+/g, "-");
      const existing = existingNodes.find((n) => n.id === nodeId);
      if (existing) {
        results.push(mergeSemanticNode(existing, [newRecord.id], ts));
      }
    }
  }

  return results;
}

export async function persistSemanticNodes(
  nodes: SemanticNode[]
): Promise<number> {
  let written = 0;
  for (const node of nodes) {
    await queryGraph(
      `MERGE (s:Semantic:CoOccurrence {id: $id})
       SET s.label = $label, s.confidence = $confidence,
           s.episodicCount = $count, s.firstSeen = $firstSeen,
           s.lastSeen = $lastSeen, s.subtype = 'co-occurrence'`,
      { id: node.id, label: node.label, confidence: node.confidence,
        count: node.episodicCount, firstSeen: node.firstSeen, lastSeen: node.lastSeen }
    );
    for (const entity of node.entities) {
      await queryGraph(
        `MATCH (s:Semantic {id: $sid}), (e:Entity {name: $ename})
         MERGE (e)-[:PARTICIPATES_IN]->(s)`,
        { sid: node.id, ename: entity }
      );
    }
    written++;
  }
  return written;
}

export async function getSemanticNodes(
  limit = 50,
  subtype?: string
): Promise<SemanticNode[]> {
  const filter = subtype ? "AND s.subtype = $subtype" : "";
  const rows = await queryGraph(
    `MATCH (s:Semantic)
     WHERE s.id IS NOT NULL ${filter}
     RETURN s.id AS id, s.subtype AS subtype, s.label AS label,
            s.confidence AS confidence, s.episodicCount AS episodicCount,
            s.firstSeen AS firstSeen, s.lastSeen AS lastSeen
     ORDER BY s.confidence DESC
     LIMIT $limit`,
    { limit: neo4j.int(limit), subtype: subtype ?? "" }
  );
  return rows.map((r) => ({
    id: r.id as string,
    type: "semantic" as const,
    subtype: (r.subtype as "co-occurrence" | "cluster") ?? "co-occurrence",
    label: r.label as string,
    entities: [],
    confidence: r.confidence as number,
    episodicCount: r.episodicCount as number,
    firstSeen: r.firstSeen as string,
    lastSeen: r.lastSeen as string,
  }));
}

export async function runIncrementalDerivation(): Promise<{
  created: number;
  merged: number;
}> {
  const records = await queryGraph(
    `MATCH (n)
     WHERE (n:Observation OR n:Interaction)
       AND n.timestamp IS NOT NULL
     OPTIONAL MATCH (n)-[:MENTIONS]->(e:Entity)
     WITH n, collect(e.name) AS entities
     WHERE size(entities) >= 2
     RETURN n.id AS id, n.content AS content, n.agent AS agent,
            n.type AS type, n.timestamp AS ts, entities
     ORDER BY ts`
  );

  const episodic: EpisodicRecord[] = records.map((r) => ({
    id: r.id as string,
    content: r.content as string,
    agent: r.agent as string,
    type: r.type as string,
    timestamp: r.ts as number,
    entities: r.entities as string[],
  }));

  const coocs = findCoOccurrences(episodic);
  const nodes = coocs.map(createSemanticNode);
  const written = await persistSemanticNodes(nodes);

  return { created: written, merged: 0 };
}
