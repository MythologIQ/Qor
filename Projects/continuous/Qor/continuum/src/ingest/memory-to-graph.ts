import neo4j, { type Driver, type Session } from "neo4j-driver";
import { readdir, readFile } from "fs/promises";
import { join, extname } from "path";

const NEO4J_URI = "bolt://localhost:7687";
const NEO4J_USER = "neo4j";
const NEO4J_PASS = "victor-memory-dev";
const MEMORY_ROOT = "/home/workspace/.continuum/memory";

interface StructuredRecord {
  id: string;
  type: string;
  agent: string;
  content: {
    raw: string;
    processed?: string;
    entities?: string[];
    sentiment?: number;
    tone?: string[];
  };
  engagement?: Record<string, unknown>;
  provenance?: {
    createdAt: number;
    source: string;
    sessionId: string;
    platformPostId?: string | null;
  };
}

interface FlatRecord {
  type: string;
  content: string;
  metadata?: {
    source?: string;
    sessionId?: string;
    entities?: string[];
    sentiment?: number;
    timestamp?: string;
    severity?: string;
    category?: string;
  };
}

type MemoryRecord = StructuredRecord | FlatRecord;

function isStructured(r: MemoryRecord): r is StructuredRecord {
  return "id" in r && "agent" in r;
}

function extractId(r: MemoryRecord, filename: string): string {
  if (isStructured(r)) return r.id;
  const base = filename.replace(/\.(json|jsonl)$/, "");
  return `${getSource(r)}-${base}`;
}

function getSource(r: MemoryRecord): string {
  if (isStructured(r)) return r.provenance?.source ?? r.agent;
  return r.metadata?.source ?? "unknown";
}

function getAgent(r: MemoryRecord): string {
  if (isStructured(r)) return r.agent;
  const src = r.metadata?.source ?? "";
  if (src.startsWith("victor")) return "victor";
  if (src.startsWith("qora")) return "qora";
  return "unknown";
}

function getContent(r: MemoryRecord): string {
  if (isStructured(r)) return r.content.raw;
  if (typeof r.content === "string") return r.content;
  return JSON.stringify(r.content);
}

function getTimestamp(r: MemoryRecord): number {
  if (isStructured(r) && r.provenance?.createdAt) {
    return r.provenance.createdAt;
  }
  if (!isStructured(r) && r.metadata?.timestamp) {
    return new Date(r.metadata.timestamp).getTime();
  }
  return Date.now();
}

function getSessionId(r: MemoryRecord): string {
  if (isStructured(r)) return r.provenance?.sessionId ?? "";
  return r.metadata?.sessionId ?? "";
}

function getEntities(r: MemoryRecord): string[] {
  if (isStructured(r)) return r.content.entities ?? [];
  return r.metadata?.entities ?? [];
}

function getSentiment(r: MemoryRecord): number {
  if (isStructured(r)) return r.content.sentiment ?? 0;
  return r.metadata?.sentiment ?? 0;
}

async function readJsonFile(path: string): Promise<MemoryRecord[]> {
  const text = await readFile(path, "utf-8");
  if (extname(path) === ".jsonl") {
    return text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }
  return [JSON.parse(text)];
}

async function collectRecords(
  agentDir: string
): Promise<{ records: MemoryRecord[]; filenames: string[] }> {
  const records: MemoryRecord[] = [];
  const filenames: string[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith(".json") || entry.name.endsWith(".jsonl")) {
        try {
          const recs = await readJsonFile(fullPath);
          for (const r of recs) {
            records.push(r);
            filenames.push(entry.name);
          }
        } catch {
          console.error(`Skip bad file: ${fullPath}`);
        }
      }
    }
  }

  await walk(agentDir);
  return { records, filenames };
}

async function ensureAgent(session: Session, name: string) {
  await session.run(
    "MERGE (a:Agent {name: $name}) ON CREATE SET a.createdAt = $now",
    { name, now: Date.now() }
  );
}

async function ensureSession(session: Session, sessionId: string, agent: string) {
  if (!sessionId) return;
  await session.run(
    `MERGE (s:Session {id: $id})
     ON CREATE SET s.agent = $agent, s.createdAt = $now`,
    { id: sessionId, agent, now: Date.now() }
  );
}

async function ensureEntity(session: Session, name: string) {
  await session.run(
    "MERGE (e:Entity {name: $name}) ON CREATE SET e.createdAt = $now",
    { name, now: Date.now() }
  );
}

async function ingestRecord(
  session: Session,
  record: MemoryRecord,
  filename: string
) {
  const id = extractId(record, filename);
  const agent = getAgent(record);
  const content = getContent(record);
  const ts = getTimestamp(record);
  const sessionId = getSessionId(record);
  const entities = getEntities(record);
  const sentiment = getSentiment(record);
  const nodeLabel = agent === "qora" ? "Interaction" : "Observation";

  await session.run(
    `MERGE (n:${nodeLabel} {id: $id})
     ON CREATE SET
       n.agent = $agent,
       n.content = $content,
       n.timestamp = $ts,
       n.sessionId = $sessionId,
       n.sentiment = $sentiment,
       n.source = $source,
       n.type = $type`,
    {
      id,
      agent,
      content: content || "",
      ts,
      sessionId,
      sentiment,
      source: getSource(record),
      type: record.type || "unknown",
    }
  );

  await ensureAgent(session, agent);
  await session.run(
    `MATCH (n {id: $id}), (a:Agent {name: $agent})
     MERGE (n)-[:BELONGS_TO]->(a)`,
    { id, agent }
  );

  if (sessionId) {
    await ensureSession(session, sessionId, agent);
    await session.run(
      `MATCH (n {id: $id}), (s:Session {id: $sid})
       MERGE (n)-[:OBSERVED_DURING]->(s)`,
      { id, sid: sessionId }
    );
  }

  for (const entityName of entities) {
    await ensureEntity(session, entityName);
    await session.run(
      `MATCH (n {id: $id}), (e:Entity {name: $ename})
       MERGE (n)-[:MENTIONS]->(e)`,
      { id, ename: entityName }
    );
  }
}

async function buildTemporalChains(session: Session) {
  await session.run(
    `MATCH (a:Observation)
     WITH a ORDER BY a.timestamp
     WITH collect(a) AS nodes
     UNWIND range(0, size(nodes)-2) AS i
     WITH nodes[i] AS prev, nodes[i+1] AS next
     WHERE prev.agent = next.agent
     MERGE (prev)-[:FOLLOWED_BY]->(next)`
  );
  await session.run(
    `MATCH (a:Interaction)
     WITH a ORDER BY a.timestamp
     WITH collect(a) AS nodes
     UNWIND range(0, size(nodes)-2) AS i
     WITH nodes[i] AS prev, nodes[i+1] AS next
     WHERE prev.agent = next.agent
     MERGE (prev)-[:FOLLOWED_BY]->(next)`
  );
}

async function buildCrossAgentLinks(session: Session) {
  await session.run(
    `MATCH (a:Observation)-[:OBSERVED_DURING]->(s:Session),
           (b:Interaction)-[:OBSERVED_DURING]->(s)
     MERGE (a)-[:SAME_SESSION]->(b)`
  );
  await session.run(
    `MATCH (a)-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(b)
     WHERE id(a) < id(b)
     MERGE (a)-[:SHARED_ENTITY {entity: e.name}]->(b)`
  );
}

export async function ingestAll(): Promise<{
  total: number;
  agents: number;
  sessions: number;
  entities: number;
}> {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASS)
  );

  let totalRecords = 0;

  try {
    for (const agentName of ["victor", "qora"]) {
      const agentDir = join(MEMORY_ROOT, agentName);
      const { records, filenames } = await collectRecords(agentDir);
      const session = driver.session();
      try {
        let skipped = 0;
        for (let i = 0; i < records.length; i++) {
          try {
            await ingestRecord(session, records[i], filenames[i]);
            totalRecords++;
            if (totalRecords % 100 === 0) {
              console.log(`Ingested ${totalRecords} records...`);
            }
          } catch (err) {
            skipped++;
            console.error(`Skip record ${i} in ${agentName}: ${(err as Error).message}`);
          }
        }
        if (skipped > 0) console.log(`Skipped ${skipped} bad records for ${agentName}`);
      } finally {
        await session.close();
      }
    }

    const session = driver.session();
    try {
      console.log("Building temporal chains...");
      await buildTemporalChains(session);
      console.log("Building cross-agent links...");
      await buildCrossAgentLinks(session);

      const stats = await session.run(
        `MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt
         ORDER BY cnt DESC`
      );
      const counts: Record<string, number> = {};
      for (const r of stats.records) {
        counts[r.get("label")] = r.get("cnt").toNumber();
      }

      return {
        total: totalRecords,
        agents: counts["Agent"] ?? 0,
        sessions: counts["Session"] ?? 0,
        entities: counts["Entity"] ?? 0,
      };
    } finally {
      await session.close();
    }
  } finally {
    await driver.close();
  }
}

if (import.meta.main) {
  console.log("Starting memory ingestion into Neo4j...");
  const result = await ingestAll();
  console.log(`\nIngestion complete:`);
  console.log(`  Records: ${result.total}`);
  console.log(`  Agents:  ${result.agents}`);
  console.log(`  Sessions: ${result.sessions}`);
  console.log(`  Entities: ${result.entities}`);
}
