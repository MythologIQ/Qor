import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import neo4j, { type Driver, type Session } from "neo4j-driver";

const URI = "bolt://localhost:7687";
const USER = "neo4j";
const PASS = "victor-memory-dev";
let driver: Driver;
let session: Session;

beforeAll(() => {
  driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASS));
  session = driver.session();
});

afterAll(async () => {
  await session.close();
  await driver.close();
});

describe("Memory Ingestion Structure", () => {
  it("creates Observation nodes for Victor records", async () => {
    await session.run(
      `CREATE (o:Observation {id: 'test-obs-1', agent: 'victor', content: 'test heartbeat', timestamp: $ts, sentiment: 0})`,
      { ts: Date.now() }
    );
    const r = await session.run(
      "MATCH (o:Observation {id: 'test-obs-1'}) RETURN o"
    );
    expect(r.records.length).toBe(1);
    expect(r.records[0].get("o").properties.agent).toBe("victor");
    await session.run("MATCH (o:Observation {id: 'test-obs-1'}) DETACH DELETE o");
  });

  it("creates Interaction nodes for Qora records", async () => {
    await session.run(
      `CREATE (i:Interaction {id: 'test-int-1', agent: 'qora', content: 'moltbook cycle', timestamp: $ts, sentiment: 0.6})`,
      { ts: Date.now() }
    );
    const r = await session.run(
      "MATCH (i:Interaction {id: 'test-int-1'}) RETURN i"
    );
    expect(r.records.length).toBe(1);
    expect(r.records[0].get("i").properties.agent).toBe("qora");
    await session.run("MATCH (i:Interaction {id: 'test-int-1'}) DETACH DELETE i");
  });

  it("creates Agent nodes and BELONGS_TO edges", async () => {
    await session.run(
      `CREATE (o:Observation {id: 'test-obs-2', agent: 'victor'})
       MERGE (a:Agent {name: 'victor'})
       CREATE (o)-[:BELONGS_TO]->(a)`
    );
    const r = await session.run(
      `MATCH (o:Observation {id: 'test-obs-2'})-[:BELONGS_TO]->(a:Agent)
       RETURN a.name AS name`
    );
    expect(r.records[0].get("name")).toBe("victor");
    await session.run("MATCH (o:Observation {id: 'test-obs-2'}) DETACH DELETE o");
  });

  it("creates Entity nodes with MENTIONS edges", async () => {
    await session.run(
      `CREATE (i:Interaction {id: 'test-int-2', agent: 'qora'})
       MERGE (e:Entity {name: 'mnemis'})
       CREATE (i)-[:MENTIONS]->(e)`
    );
    const r = await session.run(
      `MATCH (i:Interaction {id: 'test-int-2'})-[:MENTIONS]->(e:Entity)
       RETURN e.name AS name`
    );
    expect(r.records[0].get("name")).toBe("mnemis");
    await session.run("MATCH (i:Interaction {id: 'test-int-2'}) DETACH DELETE i");
  });

  it("creates Session nodes with OBSERVED_DURING edges", async () => {
    await session.run(
      `CREATE (o:Observation {id: 'test-obs-3', agent: 'victor'})
       MERGE (s:Session {id: 'vhb-test-session'})
       CREATE (o)-[:OBSERVED_DURING]->(s)`
    );
    const r = await session.run(
      `MATCH (o:Observation {id: 'test-obs-3'})-[:OBSERVED_DURING]->(s:Session)
       RETURN s.id AS sid`
    );
    expect(r.records[0].get("sid")).toBe("vhb-test-session");
    await session.run("MATCH (o:Observation {id: 'test-obs-3'}) DETACH DELETE o");
    await session.run("MATCH (s:Session {id: 'vhb-test-session'}) DETACH DELETE s");
  });

  it("builds FOLLOWED_BY temporal chains", async () => {
    await session.run(
      `CREATE (a:Observation {id: 'test-chain-1', agent: 'victor', timestamp: 1000})
       CREATE (b:Observation {id: 'test-chain-2', agent: 'victor', timestamp: 2000})
       CREATE (c:Observation {id: 'test-chain-3', agent: 'victor', timestamp: 3000})`
    );
    await session.run(
      `MATCH (a:Observation)
       WHERE a.id IN ['test-chain-1', 'test-chain-2', 'test-chain-3']
       WITH a ORDER BY a.timestamp
       WITH collect(a) AS nodes
       UNWIND range(0, size(nodes)-2) AS i
       WITH nodes[i] AS prev, nodes[i+1] AS next
       MERGE (prev)-[:FOLLOWED_BY]->(next)`
    );
    const r = await session.run(
      `MATCH (a:Observation {id: 'test-chain-1'})-[:FOLLOWED_BY]->(b)-[:FOLLOWED_BY]->(c)
       RETURN c.id AS id`
    );
    expect(r.records[0].get("id")).toBe("test-chain-3");
    await session.run(
      `MATCH (o:Observation) WHERE o.id STARTS WITH 'test-chain-' DETACH DELETE o`
    );
  });
});
