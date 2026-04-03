import neo4j, { type Driver, type Session } from "neo4j-driver";

const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
const NEO4J_PASS = process.env.NEO4J_PASS ?? "victor-memory-dev";

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
