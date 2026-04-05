import { queryGraph, embedText, ensureVectorIndexes, closeDriver } from "../service/graph-api";

async function batchEmbed() {
  await ensureVectorIndexes();

  const unembedded = await queryGraph(
    `MATCH (n) WHERE (n:Observation OR n:Interaction) AND n.embedding IS NULL AND n.content IS NOT NULL
     RETURN n.id AS id, n.content AS content, labels(n)[0] AS label
     LIMIT 1000`
  );

  console.log(`Found ${unembedded.length} nodes without embeddings`);

  let done = 0;
  let failed = 0;

  for (const node of unembedded) {
    try {
      const content = String(node.content).slice(0, 1000);
      if (!content.trim()) { done++; continue; }
      const embedding = await embedText(content);
      await queryGraph(
        `MATCH (n {id: $id}) SET n.embedding = $embedding`,
        { id: node.id, embedding }
      );
      done++;
      if (done % 50 === 0) {
        console.log(`Embedded ${done}/${unembedded.length} (${failed} failed)`);
      }
    } catch (err) {
      failed++;
      console.error(`Failed ${node.id}: ${(err as Error).message}`);
    }
  }

  console.log(`Done: ${done} embedded, ${failed} failed out of ${unembedded.length}`);
  await closeDriver();
}

batchEmbed();
