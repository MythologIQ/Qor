# ADR-002: No External Database Dependencies

## Status

**Accepted** (2024-01-15)

## Context

Zo-Qore needs to store and manage planning data (thoughts, clusters, phases, risks). We considered whether to require an external database (PostgreSQL, MongoDB, etc.) or use file-based storage.

Key considerations:
1. **Deployment complexity**: How easy is it to get started?
2. **Portability**: Can users move their data easily?
3. **Maintenance**: Who manages backups, updates, migrations?
4. **Scale**: What volume of data do we expect?
5. **Single-user vs multi-tenant**: Zo-Qore is designed for individual use on Zo Computer

## Decision

Zo-Qore will **not require external database dependencies**. All data will be stored in files (JSONL for Void, JSON for views) with DuckDB as an optional indexing layer.

## Rationale

### Advantages

1. **Zero Setup**: No database installation, configuration, or connection strings
2. **Portability**: Data is just files. Copy to backup, move to another machine, or version control
3. **Transparency**: Users can inspect their data with any text editor
4. **No Migrations**: Schema changes are handled in code, not database migrations
5. **Simplified Deployment**: Single binary/process, no external services
6. **Zo Computer Fit**: Designed for single-user environment where heavy databases are overkill

### Disadvantages

1. **No ACID Transactions**: File operations are not transactional
2. **Concurrency Limits**: File locking is less sophisticated than database locks
3. **Query Performance**: Complex queries are slower than indexed databases
4. **Scale Limits**: Not suitable for multi-tenant, high-volume scenarios

## Mitigations

### File Locking

We use `proper-lockfile` for cross-process file locking:

```typescript
import lockfile from 'proper-lockfile';

const release = await lockfile.lock(filePath);
try {
  // Modify file
} finally {
  await release();
}
```

### DuckDB for Indexing

DuckDB is embedded (not a separate server) and provides SQL querying over files:

```typescript
import { DuckDBClient } from './duckdb-client';

const db = new DuckDBClient();
const results = await db.query('SELECT * FROM thoughts WHERE status = ?', ['active']);
```

### Checksums for Integrity

SHA256 checksums verify data integrity without database constraints:

```typescript
const checksum = crypto
  .createHash('sha256')
  .update(JSON.stringify(data))
  .digest('hex');
```

## Scale Expectations

| Data Type | Expected Volume | Storage Approach |
|-----------|-----------------|------------------|
| Thoughts | 1-10K per project | JSONL + index |
| Clusters | 10-100 per project | JSON |
| Phases | 5-20 per project | JSON |
| Risks | 5-50 per project | JSON |
| Projects | 1-10 per user | Directory structure |

At these scales, file-based storage is efficient and appropriate.

## Alternatives Considered

### SQLite

- **Pros**: Embedded, full SQL, battle-tested
- **Cons**: Binary format (less transparent), requires schema management

### PostgreSQL

- **Pros**: Full ACID, mature ecosystem, excellent performance
- **Cons**: Requires installation, configuration, maintenance, external service

### MongoDB

- **Pros**: Document store fits our data model
- **Cons**: Heavyweight for single-user, memory-intensive

## Consequences

- Users can start using Zo-Qore immediately with `npm install`
- Data files can be backed up, versioned, and moved easily
- Scale is limited to single-user scenarios (by design)
- DuckDB is included as a dependency for indexing, but is embedded (no separate process)

## References

- `zo/storage/duckdb-client.ts`
- `runtime/planning/VoidStore.ts`
- `runtime/planning/StoreIntegrity.ts`
