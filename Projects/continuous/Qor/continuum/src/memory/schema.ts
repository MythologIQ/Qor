/**
 * Schema initialization.
 * Invoked once at Continuum startup by service/server.ts before IPC listen.
 * Fail-closed: any Cypher error aborts process start.
 */

import type { Driver } from "neo4j-driver";

const CONSTRAINTS: string[] = [
  "CREATE CONSTRAINT agent_name_unique IF NOT EXISTS FOR (a:Agent) REQUIRE a.name IS UNIQUE",
  "CREATE CONSTRAINT observation_id_unique IF NOT EXISTS FOR (o:Observation) REQUIRE o.id IS UNIQUE",
  "CREATE CONSTRAINT interaction_id_unique IF NOT EXISTS FOR (i:Interaction) REQUIRE i.id IS UNIQUE",
  "CREATE CONSTRAINT session_id_unique IF NOT EXISTS FOR (s:Session) REQUIRE s.id IS UNIQUE",
  "CREATE CONSTRAINT entity_name_unique IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE",
  "CREATE CONSTRAINT semantic_id_unique IF NOT EXISTS FOR (s:Semantic) REQUIRE s.id IS UNIQUE",
  "CREATE CONSTRAINT procedural_id_unique IF NOT EXISTS FOR (p:Procedural) REQUIRE p.id IS UNIQUE",
  "CREATE CONSTRAINT learning_id_unique IF NOT EXISTS FOR (l:LearningEvent) REQUIRE l.id IS UNIQUE",
  "CREATE CONSTRAINT execution_id_unique IF NOT EXISTS FOR (x:ExecutionEvent) REQUIRE x.id IS UNIQUE",
  "CREATE CONSTRAINT ledger_entry_id_unique IF NOT EXISTS FOR (l:LedgerEntry) REQUIRE l.id IS UNIQUE",
  "CREATE CONSTRAINT ledger_entry_partition_seq_unique IF NOT EXISTS FOR (l:LedgerEntry) REQUIRE (l.partition, l.seq) IS UNIQUE",
  "CREATE CONSTRAINT source_doc_id_unique IF NOT EXISTS FOR (d:SourceDocument) REQUIRE d.id IS UNIQUE",
  "CREATE CONSTRAINT source_chunk_id_unique IF NOT EXISTS FOR (c:SourceChunk) REQUIRE c.id IS UNIQUE",
];

function vectorDimensions(): number {
  const raw = process.env.NEO4J_VECTOR_DIMENSIONS;
  if (!raw) return 1024;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid NEO4J_VECTOR_DIMENSIONS: ${raw}`);
  }
  return parsed;
}

function vectorIndexStatements(dimensions: number): string[] {
  return [
    `CREATE VECTOR INDEX memory_embedding_observation IF NOT EXISTS
     FOR (n:Observation) ON n.embedding
     OPTIONS { indexConfig: { \`vector.dimensions\`: ${dimensions}, \`vector.similarity_function\`: 'cosine' } }`,
    `CREATE VECTOR INDEX memory_embedding_interaction IF NOT EXISTS
     FOR (n:Interaction) ON n.embedding
     OPTIONS { indexConfig: { \`vector.dimensions\`: ${dimensions}, \`vector.similarity_function\`: 'cosine' } }`,
    `CREATE VECTOR INDEX source_chunk_embedding IF NOT EXISTS
     FOR (c:SourceChunk) ON c.embedding
     OPTIONS { indexConfig: { \`vector.dimensions\`: ${dimensions}, \`vector.similarity_function\`: 'cosine' } }`,
  ];
}

export async function initializeSchema(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    for (const stmt of CONSTRAINTS) await session.run(stmt);
    await session.run("CREATE INDEX ledger_entry_partition_seq_idx IF NOT EXISTS FOR (l:LedgerEntry) ON (l.partition, l.seq)");
    for (const stmt of vectorIndexStatements(vectorDimensions())) await session.run(stmt);
  } finally {
    await session.close();
  }
}
