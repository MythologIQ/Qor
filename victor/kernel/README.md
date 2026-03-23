# Victor Kernel - Deterministic Collaborator And Memory Kernel

Victor is a safety-first virtual collaborator with two runtime surfaces:

- a deterministic rule engine for governance and action filtering
- a Neo4j-backed memory kernel for provenance-first ingestion and grounded retrieval

The memory kernel is still read-oriented. It ingests workspace artifacts, derives semantic structure, tracks cache freshness, and returns grounded context bundles without autonomous execution.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Victor Kernel                       │
│                                                           │
│  ┌──────────────────────┐   ┌──────────────────────────┐  │
│  │ Deterministic Rules  │   │ Neo4j Memory Kernel     │  │
│  │ • Honesty            │   │ • Source documents      │  │
│  │ • Focus              │   │ • Source chunks         │  │
│  │ • Momentum           │   │ • Semantic nodes/edges  │  │
│  │ • Safety             │   │ • Cache freshness       │  │
│  └──────────────────────┘   │ • Grounded retrieval    │  │
│                              └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Key Principles

### 1. **Deterministic Processing**
- Core functions execute without LLM involvement
- Rule evaluation is a pure function (same input → same output)
- Predictable behavior and fast execution

### 2. **Rule-Based Enforcement**
- Honesty: No hallucination, transparent reasoning
- Focus: Zero fluff, truth over comfort
- Momentum: Sustained action without compromising reality
- Safety: No destructive actions, no secret exposure

### 3. **Clear Boundaries**
- Victor operates within defined constraints
- No autonomous action beyond configured rules
- Human approval for high-risk operations

### 4. **Optional LLM Integration**
- LLM can be added for complex reasoning when requested
- Never enabled by default for core functions
- Always declared when in use

## Quick Start

### Neo4j First

```bash
cd kernel
docker compose -f docker-compose.neo4j.yml up -d

export NEO4J_URI=bolt://127.0.0.1:7687
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=victor-memory-dev
export NEO4J_DATABASE=neo4j

# Default: local vector retrieval
export EMBEDDING_PROVIDER=local-transformers
export LOCAL_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
export LOCAL_EMBEDDING_DIMENSIONS=384

# Optional: switch to an OpenAI-compatible embedding endpoint instead
export OPENAI_API_KEY=...
export EMBEDDING_PROVIDER=openai-compatible
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_EMBEDDING_MODEL=text-embedding-3-small
export OPENAI_EMBEDDING_DIMENSIONS=1536
```

### Zo Deployment

```bash
cd kernel

# Deploy to Zo ecosystem
bash deploy-zo.sh
```

### Local Development

```bash
cd kernel

# Install dependencies
bun install

# Run locally once Neo4j env vars are exported
bun run dev

# Ingest the real Victor project scope
bun run ingest:victor-scope

# Ingest governed Builder Console planning artifacts read-only
bun run ingest:builder-console

# Ingest the research corpus under Documents
bun run ingest:documents

# Ingest the research corpus and run grounded smoke queries
bun run exercise:documents-memory

# Run the same research-corpus smoke queries through the local in-memory harness
# Useful when Neo4j is not available yet
bun run exercise:documents-memory-offline

# Or build and run
bun run build
bun run start
```

## API Reference

### Health Check
```bash
GET /health
```

Response:
```json
{
  "service": "victor-kernel",
  "status": "healthy",
  "mode": "deterministic",
  "llm": "disabled",
  "timestamp": "2026-02-15T12:00:00.000Z"
}
```

### Memory Status
```bash
GET /api/victor/memory/status
```

### Ingest Workspace Artifact
```bash
POST /api/victor/memory/ingest
{
  "path": "/home/workspace/Projects/continuous/Victor/docs/plans/2026-03-14-victor-resident-memory-design.md",
  "projectId": "victor"
}
```

### Grounded Query
```bash
POST /api/victor/memory/query
{
  "projectId": "victor",
  "query": "what decisions mention neo4j memory"
}
```

### Process Request
```bash
POST /api/victor/process
```

Request:
```json
{
  "id": "req-001",
  "userId": "frostwulf",
  "action": "task.create",
  "params": {
    "title": "Review Zo-Qore deployment",
    "priority": "high"
  },
  "timestamp": "2026-02-15T12:00:00.000Z"
}
```

Response:
```json
{
  "id": "req-001",
  "mode": "support",
  "allowed": true,
  "requiresReview": false,
  "ruleEvaluations": [
    {
      "id": "focus-no-fluff",
      "name": "Zero Fluff Mode",
      "decision": {
        "allowed": true,
        "reason": "Direct, actionable responses only",
        "stance": "support",
        "requiresReview": false
      }
    }
  ],
  "result": {
    "id": "task-1739616000000",
    "userId": "frostwulf",
    "title": "Review Zo-Qore deployment",
    "priority": "high",
    "status": "pending",
    "createdAt": "2026-02-15T12:00:00.000Z",
    "victorDecision": {
      "stance": "support",
      "reason": "Task creation aligned with momentum"
    }
  }
}
```

### Task Management
```bash
# Create task
POST /api/tasks
{
  "title": "Complete implementation plan",
  "priority": "high"
}

# List tasks
GET /api/tasks

# Complete task (via process API)
POST /api/victor/process
{
  "action": "task.complete",
  "params": {
    "id": "task-123"
  }
}
```

### Stance Determination
```bash
POST /api/victor/stance
{
  "action": "deploy.production"
}
```

Response:
```json
{
  "action": "deploy.production",
  "mode": "mixed",
  "stance": "mixed",
  "rulesEvaluated": 3,
  "allowed": true,
  "requiresReview": true,
  "victorDecision": {
    "stance": "mixed",
    "reason": "Evaluated 3 applicable rules"
  }
}
```

### Governance
```bash
# Get Victor's current mode
GET /api/victor/mode

# List all rules
GET /api/audit

# View audit log
GET /api/audit
```

## Victor's Modes

Victor declares his stance for every action:

| Mode | Meaning | When Used |
|-------|---------|-----------|
| **Support** | Encouragement, reinforcement | Safe operations aligned with goals |
| **Challenge** | Skeptical, evidence-based opposition | Actions requiring scrutiny |
| **Mixed** | Strengths and flaws separated | Operations with trade-offs |
| **Red Flag** | Faulty premise, high risk | Blocked or critical issues |

## Memory Kernel Behavior

The memory kernel does four things:

- ingests workspace artifacts into source documents and chunks
- extracts semantic nodes and relationships from those chunks
- marks dependent cache entries stale when evidence changes (UOR fingerprint-based)
- returns grounded retrieval bundles with contradictions and missing-information signals

When `OPENAI_API_KEY` is configured, Victor also generates chunk embeddings during ingestion and prefers Neo4j vector search before falling back to lexical retrieval.

### External Content: Quarantine Pipeline (Planned — Phase 7)

Victor can explore external agent discourse (starting with Moltbook) during idle heartbeat ticks. All external content is treated as adversarial and passes through a quarantine-first pipeline:

1. **Fetch** — Read-only GET requests, rate-limited, content-truncated
2. **Sanitize** — Strip HTML, decode base64, normalize unicode, remove control chars
3. **Adversarial Scan** — 4-layer detection (literal injection patterns, structural heuristics, encoding detection, similarity/flood)
4. **Governance Gate** — Hostile auto-rejects, suspicious quarantines for human review, clean quarantines with cooldown promotion
5. **Quarantine Store** — Separate SQLite store, not in main retrieval index. Provisional items capped at 0.40 confidence. Never auto-durable.
6. **Audit Ledger** — Append-only JSONL logging every pipeline event

Source trust tiering ensures external-untrusted content never outweighs internal workspace knowledge. See `docs/plans/2026-03-18-moltbook-quarantine-exploration-plan.md` for full architecture.

## Integration with Zo-Qore

```bash
# Check Zo-Qore status through Victor
POST /api/victor/process
{
  "action": "zoqore.status"
}
```

This keeps Builder Console and related operational surfaces behind Victor's rule layer while the memory kernel matures separately.

## Security & Boundaries

### Protected Actions (Require Review)
- Any action with destructive potential (`rm -rf`, `DROP TABLE`)
- Secret exposure attempts
- Production deployments
- Actions evaluated as "red-flag"

### Blocked Actions
- Explicitly destructive commands
- Secret value exposure
- Actions violating core rules

### Audit Trail
All actions are logged with:
- Timestamp
- User ID
- Action type
- Rule evaluations
- Decision outcome
- Review requirement

## Current Development Status

- Neo4j-backed storage is in place
- Provenance-first ingestion is in place
- Grounded retrieval endpoints are in place
- OpenAI-compatible embeddings can drive Neo4j vector retrieval when configured

## Development Roadmap

- [ ] Task persistence (database integration)
- [ ] Email integration (Gmail OAuth)
- [ ] Calendar integration (Google Calendar OAuth)
- [ ] Zo-Qore API integration
- [ ] Web UI (borrowing design from Zo-Qore)
- [ ] Optional LLM mode for complex reasoning
- [ ] Speech-to-text interface
- [ ] TTS integration (Qwen 3)

## License

MIT - MythologIQ

## Contact

- Repository: https://github.com/MythologIQ/Victor-Kernel
- Zo Space: https://frostwulf.zo.computer
