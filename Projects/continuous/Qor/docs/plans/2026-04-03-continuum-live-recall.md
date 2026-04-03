# Plan: Continuum Live Recall

**Version**: 1.0
**Date**: 2026-04-03
**Chain**: Auto-Ingestion → Path Updates → Semantic Recall

---

## Phase 1: Auto-Ingestion Loop

Replace the unreliable `fs.watch` listener with a periodic ingestion loop inside the Continuum server. MERGE is idempotent — re-ingesting existing records is a no-op, so a simple interval that calls `ingestAll()` every 5 minutes catches all new memories regardless of server restarts.

### Affected Files

- `continuum/src/service/server.ts` — Add `setInterval` calling `ingestAll()`
- `continuum/src/service/ingest-listener.ts` — Remove; replaced by interval
- `continuum/src/ingest/memory-to-graph.ts` — Export `ingestAll` (already exported)

### Changes

**1a. Remove ingest-listener import from server.ts**

Replace `startWatcher()` call with a `setInterval` that imports and calls `ingestAll` from `memory-to-graph.ts`. Log each cycle's new record count (compare before/after totals).

```typescript
import { ingestAll } from "../ingest/memory-to-graph";

let lastTotal = 0;
async function syncCycle() {
  const result = await ingestAll();
  if (result.total > lastTotal) {
    console.log(`Sync: ${result.total - lastTotal} new records (total: ${result.total})`);
  }
  lastTotal = result.total;
}

syncCycle();
setInterval(syncCycle, 5 * 60 * 1000);
```

**1b. Delete ingest-listener.ts**

No longer needed — the interval approach is simpler and more reliable.

**1c. Add `/api/continuum/sync` endpoint**

Manual trigger for immediate sync (POST only):

```typescript
if (path === "/api/continuum/sync" && req.method === "POST") {
  const result = await ingestAll();
  return Response.json(result);
}
```

### Unit Tests

- `continuum/tests/auto-ingest.test.ts` — Calling `ingestAll()` twice with same data returns same totals (idempotency)
- `continuum/tests/auto-ingest.test.ts` — After writing a new JSON file to `.continuum/memory/victor/`, calling `ingestAll()` increases the total count

---

## Phase 2: Heartbeat Path Updates

Update both Zo heartbeat agent instructions to reference `.continuum` instead of `.evolveai`. Also update the `victor-kernel` service workdir from the deleted old path.

### Affected Files

- Zo agent `f3712ef4` (Victor Heartbeat) — Update instruction text
- Zo agent `2d75782d` (Qora Heartbeat) — Update instruction text
- Zo service `svc_6OwvZPatO9k` (victor-kernel) — Update workdir

### Changes

**2a. Update Victor heartbeat agent**

Call `edit_agent` to replace any `.evolveai` references with `.continuum` in the instruction text. Replace `/api/evolveai/memory` with `/api/continuum/memory`.

**2b. Update Qora heartbeat agent**

Same replacement in Qora's instruction text.

**2c. Update victor-kernel service workdir**

Call `update_user_service` to change workdir from `/home/workspace/Projects/continuous/Victor/kernel` to `/home/workspace/Projects/continuous/Qor/victor/src/kernel`. Update `LOCAL_EMBEDDING_DIMENSIONS` to `384`.

**2d. Remove `.evolveai` symlink (deferred)**

Keep symlink until one full heartbeat cycle confirms both agents write to `.continuum` successfully.

### Unit Tests

- No code tests — verified by observing next heartbeat cycle writes to `.continuum/memory/`

---

## Phase 3: Semantic Recall

Add vector embeddings to all graph nodes using local `all-MiniLM-L6-v2` (384 dimensions, runs on Zo via PyTorch + transformers). Create a Neo4j vector index and expose a `recallSimilar(text, topK)` API endpoint.

### Affected Files

- `continuum/src/embed/embed.py` — NEW: Python script that reads text from stdin, outputs 384-dim embedding as JSON
- `continuum/src/service/graph-api.ts` — Add `embedText()` and `recallSimilar()` functions
- `continuum/src/service/server.ts` — Add `/api/continuum/recall` endpoint
- `continuum/src/ingest/memory-to-graph.ts` — Add embedding generation during ingestion

### Changes

**3a. Create embedding script**

```python
# continuum/src/embed/embed.py
import sys, json
from transformers import AutoTokenizer, AutoModel
import torch

model_name = "sentence-transformers/all-MiniLM-L6-v2"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModel.from_pretrained(model_name)

def embed(text: str) -> list[float]:
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=256)
    with torch.no_grad():
        output = model(**inputs)
    embedding = output.last_hidden_state[:, 0, :].squeeze().tolist()
    return embedding

if __name__ == "__main__":
    text = sys.stdin.read().strip()
    print(json.dumps(embed(text)))
```

**3b. Add embedText() to graph-api.ts**

Shell out to the Python script via `Bun.spawn`:

```typescript
async function embedText(text: string): Promise<number[]> {
  const proc = Bun.spawn(
    ["python3", join(import.meta.dir, "../embed/embed.py")],
    { stdin: "pipe", stdout: "pipe" }
  );
  proc.stdin.write(text);
  proc.stdin.end();
  const output = await new Response(proc.stdout).text();
  return JSON.parse(output);
}
```

**3c. Create vector index in Neo4j**

Run once during server startup:

```cypher
CREATE VECTOR INDEX memory_embedding IF NOT EXISTS
FOR (n:Observation) ON n.embedding
OPTIONS { indexConfig: {
  `vector.dimensions`: 384,
  `vector.similarity_function`: 'cosine'
}}
```

Same for `:Interaction` nodes.

**3d. Add embedding to ingestion pipeline**

In `ingestRecord()`, after creating the node, call `embedText(content)` and set `n.embedding = $embedding`. Only embed if `n.embedding IS NULL` (skip already-embedded nodes).

```typescript
const embedding = await embedText(content);
await session.run(
  `MATCH (n {id: $id}) WHERE n.embedding IS NULL SET n.embedding = $embedding`,
  { id, embedding }
);
```

**3e. Add recallSimilar() to graph-api.ts**

```typescript
async function recallSimilar(text: string, topK = 10): Promise<Record<string, unknown>[]> {
  const embedding = await embedText(text);
  return queryGraph(
    `CALL db.index.vector.queryNodes('memory_embedding_observation', $k, $embedding)
     YIELD node, score
     RETURN node.id AS id, node.content AS content, node.agent AS agent,
            node.timestamp AS ts, score
     ORDER BY score DESC`,
    { k: topK, embedding }
  );
}
```

**3f. Add `/api/continuum/recall` endpoint**

```typescript
if (path === "/api/continuum/recall") {
  const q = url.searchParams.get("q");
  const k = parseInt(url.searchParams.get("k") ?? "10");
  if (!q) return Response.json({ error: "q param required" }, { status: 400 });
  const rows = await recallSimilar(q, k);
  return Response.json(rows);
}
```

### Unit Tests

- `continuum/tests/embed.test.ts` — `embedText("hello world")` returns array of length 384
- `continuum/tests/embed.test.ts` — Two similar texts have cosine similarity > 0.7
- `continuum/tests/recall.test.ts` — After embedding a node, `recallSimilar()` returns it in results
- `continuum/tests/recall.test.ts` — `recallSimilar("heartbeat")` returns Observation nodes preferentially
