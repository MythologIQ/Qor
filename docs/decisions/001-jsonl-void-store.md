# ADR-001: JSONL for Void Store

## Status

**Accepted** (2024-01-15)

## Context

The Void stage captures raw thoughts from users. These thoughts can arrive at any time and in any volume. We need a storage format that:

1. Supports efficient append operations (new thoughts)
2. Handles variable data sizes (thoughts can be short or long)
3. Allows for potential streaming writes
4. Remains human-readable for debugging
5. Works without external database dependencies

## Decision

We will use **JSON Lines (JSONL)** format for the Void store, where each line is a valid JSON object representing a single thought.

```
{"thoughtId":"uuid-1","content":"First thought","timestamp":"..."}
{"thoughtId":"uuid-2","content":"Second thought","timestamp":"..."}
{"thoughtId":"uuid-3","content":"Third thought","timestamp":"..."}
```

## Rationale

### Advantages

1. **O(1) Append**: New thoughts are appended as new lines. No need to read or rewrite the entire file.
2. **Streaming Friendly**: Each line is independent. Can process line-by-line without loading entire file.
3. **Human Readable**: Plain text, easy to inspect with any text editor or `cat` command.
4. **No External Dependencies**: Plain file system. No database setup required.
5. **Incremental Processing**: Can process new lines without reprocessing old ones.
6. **Error Isolation**: Malformed line doesn't corrupt the entire file.

### Disadvantages

1. **O(n) Full Scan**: Finding a specific thought requires scanning from the beginning.
2. **No Built-in Indexing**: Unlike databases, no automatic indexing.
3. **File Size**: Slightly larger than binary formats due to repeated keys.

## Mitigations

### Index File

We create a companion index file (`index.json`) that maps thought IDs to byte offsets:

```json
{
  "uuid-1": 0,
  "uuid-2": 156,
  "uuid-3": 312
}
```

This enables O(1) lookups by ID using file seek operations.

### Pagination

The VoidStore API supports pagination to avoid loading all thoughts:

```typescript
getThoughts({ offset: 0, limit: 50 })
```

### DuckDB Index

For complex queries (filtering, sorting, aggregations), we use DuckDB as an indexing layer.

## Alternatives Considered

### SQLite

- **Pros**: Full SQL support, built-in indexing, mature ecosystem
- **Cons**: External dependency, heavier setup, not as streaming-friendly

### Message Queue (Kafka, NATS)

- **Pros**: Built for high-volume streaming, durable
- **Cons**: Significant infrastructure overhead, overkill for single-user use case

### Binary Format (Protocol Buffers, MessagePack)

- **Pros**: More compact, faster parsing
- **Cons**: Not human-readable, requires schema compilation, overkill for this use case

### Plain JSON Array

- **Pros**: Simple, widely supported
- **Cons**: Must rewrite entire file on append (O(n) writes)

## Consequences

- Void store can handle high-frequency thought capture efficiently
- Index file must be kept in sync with JSONL file
- Large thought collections (>10K) benefit from pagination
- Storage is portable across systems (just copy files)

## References

- [JSON Lines specification](https://jsonlines.org/)
- `runtime/planning/VoidStore.ts`
- `tests/unit/void-store.test.ts`
