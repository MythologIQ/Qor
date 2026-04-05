/** Phase 2: Batch embedding clustering for semantic layer */

import { queryGraph } from "../service/graph-api";
import type { SemanticNode, Cluster } from "./types";

interface EmbeddedRecord {
  id: string;
  embedding: number[];
  content: string;
  entities: string[];
}

export async function fetchEpisodicEmbeddings(
  since?: string
): Promise<EmbeddedRecord[]> {
  const sinceFilter = since ? "AND n.timestamp >= $since" : "";
  const sinceTs = since ? parseInt(since) : 0;
  const rows = await queryGraph(
    `MATCH (n)
     WHERE (n:Observation OR n:Interaction)
       AND n.embedding IS NOT NULL ${sinceFilter}
     OPTIONAL MATCH (n)-[:MENTIONS]->(e:Entity)
     WITH n, collect(e.name) AS entities
     RETURN n.id AS id, n.embedding AS embedding,
            n.content AS content, entities
     ORDER BY n.timestamp`,
    { since: sinceTs }
  );
  return rows
    .filter((r) => Array.isArray(r.embedding) && (r.embedding as number[]).length > 0)
    .map((r) => ({
      id: r.id as string,
      embedding: r.embedding as number[],
      content: r.content as string,
      entities: (r.entities as string[]).filter(Boolean),
    }));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) centroid[i] += emb[i];
  }
  for (let i = 0; i < dim; i++) centroid[i] /= embeddings.length;
  return centroid;
}

export function clusterByCosineSimilarity(
  records: EmbeddedRecord[],
  threshold = 0.75
): Cluster[] {
  if (records.length === 0) return [];
  const assigned = new Set<number>();
  const clusters: Cluster[] = [];

  for (let i = 0; i < records.length; i++) {
    if (assigned.has(i)) continue;
    const members = [records[i]];
    assigned.add(i);
    for (let j = i + 1; j < records.length; j++) {
      if (assigned.has(j)) continue;
      if (cosineSimilarity(records[i].embedding, records[j].embedding) >= threshold) {
        members.push(records[j]);
        assigned.add(j);
      }
    }
    if (members.length < 2) continue;
    const allEntities = members.flatMap((m) => m.entities);
    clusters.push({
      members: members.map((m) => ({ id: m.id, embedding: m.embedding, content: m.content })),
      centroid: computeCentroid(members.map((m) => m.embedding)),
      entities: [...new Set(allEntities)],
    });
  }

  return clusters;
}

export function labelCluster(cluster: Cluster): string {
  const freq = new Map<string, number>();
  for (const e of cluster.entities) {
    freq.set(e, (freq.get(e) ?? 0) + 1);
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, 3).map(([name]) => name).join(" / ") || "unnamed-cluster";
}

export function createClusterNode(cluster: Cluster): SemanticNode {
  const label = labelCluster(cluster);
  const id = `sem-cluster-${label}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  const now = new Date().toISOString();
  return {
    id,
    type: "semantic",
    subtype: "cluster",
    label,
    entities: cluster.entities.slice(0, 20),
    confidence: Math.min(1.0, cluster.members.length / 10),
    episodicCount: cluster.members.length,
    firstSeen: now,
    lastSeen: now,
    embedding: cluster.centroid,
  };
}

export function reconcileClusters(
  newClusters: SemanticNode[],
  existingNodes: SemanticNode[]
): { create: SemanticNode[]; merge: SemanticNode[]; retire: string[] } {
  const create: SemanticNode[] = [];
  const merge: SemanticNode[] = [];
  const matchedExisting = new Set<string>();

  for (const nc of newClusters) {
    const match = existingNodes.find(
      (ex) => ex.subtype === "cluster" && ex.embedding && nc.embedding
        && cosineSimilarity(ex.embedding, nc.embedding) > 0.85
    );
    if (match) {
      matchedExisting.add(match.id);
      merge.push({ ...match, episodicCount: nc.episodicCount,
        confidence: nc.confidence, lastSeen: nc.lastSeen });
    } else {
      create.push(nc);
    }
  }

  const retire = existingNodes
    .filter((ex) => ex.subtype === "cluster" && !matchedExisting.has(ex.id))
    .map((ex) => ex.id);

  return { create, merge, retire };
}

async function persistClusterNodes(nodes: SemanticNode[]): Promise<number> {
  let written = 0;
  for (const node of nodes) {
    await queryGraph(
      `MERGE (s:Semantic:Cluster {id: $id})
       SET s.label = $label, s.confidence = $confidence,
           s.episodicCount = $count, s.firstSeen = $firstSeen,
           s.lastSeen = $lastSeen, s.subtype = 'cluster'`,
      { id: node.id, label: node.label, confidence: node.confidence,
        count: node.episodicCount, firstSeen: node.firstSeen, lastSeen: node.lastSeen }
    );
    written++;
  }
  return written;
}

export async function runBatchClustering(
  since?: string
): Promise<{ created: number; merged: number; retired: number }> {
  const records = await fetchEpisodicEmbeddings(since);
  if (records.length === 0) return { created: 0, merged: 0, retired: 0 };

  const clusters = clusterByCosineSimilarity(records);
  const newNodes = clusters.map(createClusterNode);
  const { getSemanticNodes } = await import("./semantic-derive");
  const existing = await getSemanticNodes(500, "cluster");
  const { create, merge, retire } = reconcileClusters(newNodes, existing);

  const created = await persistClusterNodes(create);
  const merged = await persistClusterNodes(merge);

  for (const id of retire) {
    await queryGraph(`MATCH (s:Semantic {id: $id}) DETACH DELETE s`, { id });
  }

  return { created, merged, retired: retire.length };
}
