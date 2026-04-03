import { watch } from "fs";
import { readFile } from "fs/promises";
import { extname, join } from "path";
import neo4j from "neo4j-driver";

const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
const NEO4J_PASS = process.env.NEO4J_PASS ?? "victor-memory-dev";
const MEMORY_ROOT = "/home/workspace/.continuum/memory";

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASS)
);

interface MemoryRecord {
  id?: string;
  type?: string;
  agent?: string;
  content: string | { raw: string; entities?: string[] };
  metadata?: { source?: string; sessionId?: string; entities?: string[] };
  provenance?: { createdAt?: number; sessionId?: string; source?: string };
}

function getContent(r: MemoryRecord): string {
  if (typeof r.content === "string") return r.content;
  return r.content?.raw ?? JSON.stringify(r.content);
}

function getAgent(r: MemoryRecord): string {
  if (r.agent) return r.agent;
  const src = r.metadata?.source ?? "";
  if (src.startsWith("victor")) return "victor";
  if (src.startsWith("qora")) return "qora";
  return "unknown";
}

function getEntities(r: MemoryRecord): string[] {
  if (typeof r.content === "object" && r.content?.entities) {
    return r.content.entities;
  }
  return r.metadata?.entities ?? [];
}

async function ingestFile(filePath: string): Promise<number> {
  const text = await readFile(filePath, "utf-8");
  let records: MemoryRecord[];

  if (extname(filePath) === ".jsonl") {
    records = text
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  } else {
    records = [JSON.parse(text)];
  }

  const session = driver.session();
  let ingested = 0;
  try {
    for (const record of records) {
      const agent = getAgent(record);
      const id =
        record.id ?? `${agent}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const label = agent === "qora" ? "Interaction" : "Observation";

      try {
        await session.run(
          `MERGE (n:${label} {id: $id})
           ON CREATE SET
             n.agent = $agent,
             n.content = $content,
             n.timestamp = $ts,
             n.type = $type,
             n.source = $source`,
          {
            id,
            agent,
            content: getContent(record) || "",
            ts: record.provenance?.createdAt ?? Date.now(),
            type: record.type || "unknown",
            source: record.provenance?.source ?? record.metadata?.source ?? agent,
          }
        );

        await session.run(
          `MERGE (a:Agent {name: $agent}) ON CREATE SET a.createdAt = $now`,
          { agent, now: Date.now() }
        );
        await session.run(
          `MATCH (n {id: $id}), (a:Agent {name: $agent}) MERGE (n)-[:BELONGS_TO]->(a)`,
          { id, agent }
        );

        for (const entity of getEntities(record)) {
          await session.run(
            `MERGE (e:Entity {name: $name}) ON CREATE SET e.createdAt = $now`,
            { name: entity, now: Date.now() }
          );
          await session.run(
            `MATCH (n {id: $id}), (e:Entity {name: $ename}) MERGE (n)-[:MENTIONS]->(e)`,
            { id, ename: entity }
          );
        }

        ingested++;
      } catch (err) {
        console.error(`Skip record ${id}: ${(err as Error).message}`);
      }
    }
  } finally {
    await session.close();
  }
  return ingested;
}

export function startWatcher(): void {
  const dirs = ["victor", "qora"];
  for (const agentName of dirs) {
    const dir = join(MEMORY_ROOT, agentName);
    console.log(`Watching ${dir} for new memory files...`);
    watch(dir, { recursive: true }, async (event, filename) => {
      if (!filename) return;
      if (!filename.endsWith(".json") && !filename.endsWith(".jsonl")) return;
      if (event !== "rename" && event !== "change") return;

      const fullPath = join(dir, filename);
      try {
        const count = await ingestFile(fullPath);
        console.log(`Ingested ${count} records from ${filename}`);
      } catch (err) {
        console.error(`Failed to ingest ${filename}: ${(err as Error).message}`);
      }
    });
  }
}

export { ingestFile };

if (import.meta.main) {
  console.log("Continuum ingest listener starting...");
  startWatcher();
}
