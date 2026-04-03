import neo4j, { type Driver, type Session } from "neo4j-driver";
import { join } from "path";

const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
const NEO4J_PASS = process.env.NEO4J_PASS ?? "victor-memory-dev";
const EMBED_SCRIPT = join(import.meta.dir, "../embed/embed.py");

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  }
  return driver;
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export async function queryGraph(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>[]> {
  const session = getDriver().session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => {
      const obj: Record<string, unknown> = {};
      for (const key of r.keys) {
        const val = r.get(key);
        obj[key] = neo4j.isInt(val) ? val.toNumber() : val;
      }
      return obj;
    });
  } finally {
    await session.close();
  }
}

export async function getAgentTimeline(
  agent: string,
  since?: number
): Promise<Record<string, unknown>[]> {
  const sinceTs = since ?? 0;
  return queryGraph(
    `MATCH (n)-[:BELONGS_TO]->(a:Agent {name: $agent})
     WHERE n.timestamp >= $since
     RETURN n.id AS id, n.content AS content, n.timestamp AS ts,
            n.type AS type, labels(n)[0] AS label
     ORDER BY n.timestamp`,
    { agent, since: sinceTs }
  );
}

export async function getCrossAgentLinks(
  agent1: string,
  agent2: string
): Promise<Record<string, unknown>[]> {
  return queryGraph(
    `MATCH (a)-[:BELONGS_TO]->(:Agent {name: $a1}),
           (b)-[:BELONGS_TO]->(:Agent {name: $a2}),
           (a)-[r]-(b)
     RETURN a.id AS from, b.id AS to, type(r) AS rel,
            a.content AS fromContent, b.content AS toContent
     LIMIT 100`,
    { a1: agent1, a2: agent2 }
  );
}

export async function getEntityNetwork(
  entity: string
): Promise<Record<string, unknown>[]> {
  return queryGraph(
    `MATCH (n)-[:MENTIONS]->(e:Entity {name: $entity})
     RETURN n.id AS id, n.content AS content, n.agent AS agent,
            n.timestamp AS ts, labels(n)[0] AS label
     ORDER BY n.timestamp DESC
     LIMIT 50`,
    { entity }
  );
}

export async function getGraphStats(): Promise<Record<string, unknown>> {
  const nodes = await queryGraph(
    `MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC`
  );
  const edges = await queryGraph(
    `MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS cnt ORDER BY cnt DESC`
  );
  return { nodes, edges };
}

export async function embedText(text: string): Promise<number[]> {
  const proc = Bun.spawn(["python3", EMBED_SCRIPT], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(text.slice(0, 1000));
  proc.stdin.end();
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(output.trim());
}

export async function ensureVectorIndexes(): Promise<void> {
  const session = getDriver().session();
  try {
    await session.run(
      `CREATE VECTOR INDEX memory_embedding_observation IF NOT EXISTS
       FOR (n:Observation) ON n.embedding
       OPTIONS { indexConfig: {
         \`vector.dimensions\`: 384,
         \`vector.similarity_function\`: 'cosine'
       }}`
    );
    await session.run(
      `CREATE VECTOR INDEX memory_embedding_interaction IF NOT EXISTS
       FOR (n:Interaction) ON n.embedding
       OPTIONS { indexConfig: {
         \`vector.dimensions\`: 384,
         \`vector.similarity_function\`: 'cosine'
       }}`
    );
  } finally {
    await session.close();
  }
}

export async function recallSimilar(
  text: string,
  topK = 10
): Promise<Record<string, unknown>[]> {
  const embedding = await embedText(text);
  const observations = await queryGraph(
    `CALL db.index.vector.queryNodes('memory_embedding_observation', $k, $embedding)
     YIELD node, score
     RETURN node.id AS id, node.content AS content, node.agent AS agent,
            node.timestamp AS ts, score, 'Observation' AS label
     ORDER BY score DESC`,
    { k: topK, embedding }
  );
  const interactions = await queryGraph(
    `CALL db.index.vector.queryNodes('memory_embedding_interaction', $k, $embedding)
     YIELD node, score
     RETURN node.id AS id, node.content AS content, node.agent AS agent,
            node.timestamp AS ts, score, 'Interaction' AS label
     ORDER BY score DESC`,
    { k: topK, embedding }
  );
  return [...observations, ...interactions]
    .sort((a, b) => (b.score as number) - (a.score as number))
    .slice(0, topK);
}
