# Zo-Qore Architecture Guide

**Version:** 2.0.0  
**Last Updated:** 2026-02-25

---

## Overview

Zo-Qore is an autonomous governance runtime evolved from FailSafe-Qore for Zo Computer. It provides a **planning pipeline** with policy-based governance, integrity verification, and Victor integration for strategic decision-making.

### Core Philosophy

- **Governance First**: Every action passes through policy checks
- **Integrity by Default**: Checksums verify data at rest and in transit
- **Transparency**: All decisions are logged and explainable
- **No External Database Dependencies**: File-based storage with DuckDB for indexing

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Zo Computer Platform                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │   UI Shell  │───▶│  API Layer  │───▶│   Runtime   │                 │
│  │ (vanilla JS)│    │  (Hono/HTTP)│    │  Services   │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│                              │                   │                      │
│                              ▼                   ▼                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Governance Layer                               │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │   │
│  │  │  Policy   │  │ Integrity │  │  Victor   │  │  Audit    │    │   │
│  │  │  Engine   │  │  Checker  │  │  Kernel   │  │  Logger   │    │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Storage Layer                                  │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │   │
│  │  │ VoidStore │  │ ViewStore │  │ DuckDB    │  │  Ledger   │    │   │
│  │  │  (JSONL)  │  │   (JSON)  │  │  Index    │  │  (SHA256) │    │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Planning Pipeline (6-Stage Flow)

The planning pipeline transforms raw creative input into actionable execution plans.

```
Void → Reveal → Constellation → Path → Risk → Autonomy
 │       │          │           │       │        │
 ▼       ▼          ▼           ▼       ▼        ▼
Capture  Cluster    Map         Plan   Guard    Execute
```

| Stage | Purpose | Key Module |
|-------|---------|------------|
| **Void** | Creative capture with negotiation-based prompting | `zo/void/` |
| **Reveal** | Thought clustering and pattern discovery | `zo/genesis/` |
| **Constellation** | Concept mapping and relationship graphing | `zo/constellation/` |
| **Path** | Phase and task planning | `runtime/planning/` |
| **Risk** | Risk identification and mitigation | `runtime/planning/` |
| **Autonomy** | Readiness checks and execution gates | `zo/autonomy/` |

### 2. Governance Layer

#### Policy Engine
- Location: `policy/definitions/`
- Format: YAML rule definitions with conditions and actions
- Rule IDs: `plan-NNN` pattern
- Enforcement: Strict mode (blocks) or Permissive mode (logs)

#### Integrity Checker
- Location: `runtime/planning/IntegrityChecker.ts`
- Checks: `PL-<category>-NN` pattern
- Categories: STORAGE, PIPELINE, GOVERNANCE, DATA
- Checksum: SHA256 of file contents

#### Victor Kernel
- Location: `zo/victor/`
- Stances: Support, Challenge, Mixed, Red Flag
- Integration: Decision reasoning, prompt transparency
- Rules: `zo/victor/planning/planning-rules.ts`

#### Audit Logger
- Structured JSON logging
- Fields: timestamp, level, component, action, projectId, actorId, duration, error
- Correlation IDs for request tracing

### 3. Storage Layer

#### VoidStore (JSONL)
- **Format**: JSON Lines (append-only)
- **Purpose**: Capture raw thoughts efficiently
- **Location**: `{projectDir}/void/thoughts.jsonl`
- **Index**: `{projectDir}/void/index.json` (thoughtId → byte offset)
- **Performance**: O(1) append, O(1) indexed lookup, O(n) full scan

#### ViewStore (JSON)
- **Format**: JSON with checksum header
- **Purpose**: Stage-specific views (Reveal, Constellation, Path, Risk, Autonomy)
- **Location**: `{projectDir}/{stage}/view.json`
- **Integrity**: SHA256 checksum in `{stage}/checksum.sha256`

#### DuckDB Index
- **Location**: `zo/storage/duckdb-client.ts`
- **Purpose**: Fast querying across stores
- **Schema**: `zo/storage/duckdb-schema.sql`
- **Use Cases**: Cross-view queries, aggregations, search

### 4. API Layer

#### Routes
- Base path: `/api/`
- Pattern: RESTful nouns (`/thoughts`, `/clusters`, `/phases`)
- Auth: Bearer token via `Authorization` header
- Response envelope: `{ data: T, meta?: { pagination, integrity } }`

#### Error Handling
- Standard shape: `UserFacingError` interface
- Location: `zo/ui-shell/errors.ts`
- Codes: `POLICY_DENIED`, `INTEGRITY_FAILURE`, `VALIDATION_*`, etc.

### 5. UI Shell

- **Location**: `zo/ui-shell/`
- **Framework**: Vanilla JavaScript (no React/Vue/Svelte)
- **Design System**: CSS custom properties (tokens) + component CSS
- **Components**: Button, Card, Badge, Modal, Toast, DataTable, etc.
- **Views**: void.js, reveal.js, constellation.js, path.js, risk.js, autonomy.js

---

## Data Flow

### Thought Capture Flow

```
User Input (text/voice)
        │
        ▼
┌─────────────────┐
│  VoidNegotiator │ ← Negotiation prompts for quality capture
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   VoidStore     │ ← Append to JSONL, update index
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ StoreIntegrity  │ ← Update checksums
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PolicyEngine   │ ← Check for policy violations
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AuditLogger    │ ← Log capture event
└─────────────────┘
```

### Planning Pipeline Flow

```
Void (Thoughts) → Reveal (Clusters) → Constellation (Map) → Path (Phases) → Risk (Risks) → Autonomy (Execute)
       │                  │                   │                 │               │              │
       ▼                  ▼                   ▼                 ▼               ▼              ▼
  VoidStore          ViewStore          ViewStore         ViewStore       ViewStore      AutonomyChecker
  (JSONL)           (Reveal)        (Constellation)       (Path)          (Risk)            │
                                                                                          ▼
                                                                              PolicyEngine (gates)
                                                                                          │
                                                                                          ▼
                                                                              Victor (stance check)
```

---

## Integration Points

### Zo Computer Integration

| Integration | Module | Purpose |
|-------------|--------|---------|
| **Agent OS** | `zo/agent-os/` | Agent lifecycle, policy attachment |
| **MCP Proxy** | `zo/mcp-proxy/` | Model Context Protocol bridge |
| **HTTP Proxy** | `zo/http-proxy/` | External service forwarding |
| **Fallback CLI** | `zo/fallback/` | Degraded mode operation |

### External Services

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Embeddings** | Semantic similarity for clustering | `zo/embeddings/` |
| **TTS** | Text-to-speech for Victor | `zo/tts/` |
| **Storage** | DuckDB for indexing | `zo/storage/` |

---

## Security Model

### Authentication
- Actor keys: RSA key pairs per actor
- Rotation: `npm run keys:rotate`
- MFA: TOTP-based multi-factor auth

### Authorization
- Policy-based access control
- Role definitions in `policy/definitions/`
- Trust levels: low, medium, high

### Data Protection
- Checksums on all stored data
- Secrets via `SecureSecretStore`
- Audit trail for all mutations

---

## Performance Characteristics

| Operation | Scale | Target | Notes |
|-----------|-------|--------|-------|
| VoidStore append | 1 thought | <5ms | O(1) JSONL append |
| VoidStore indexed lookup | 1 thought | <25ms | O(1) via index |
| VoidStore paginated read | 50 thoughts | <50ms | Pagination supported |
| ViewStore read | Small | <5ms | JSON parse |
| ViewStore write | Medium | <10ms | JSON write + checksum |
| Batch thought import | 1K thoughts | <500ms | Batch endpoint |
| API response (simple) | Single item | <50ms | GET/POST |
| API response (paginated) | 200 items | <200ms | With filters |

---

## Configuration

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ZO_QORE_DATA_DIR` | Data storage root | `~/.zo-qore` |
| `ZO_QORE_LOG_LEVEL` | Logging verbosity | `info` |
| `ZO_QORE_POLICY_MODE` | Enforcement mode | `strict` |
| `ZO_QORE_PORT` | API server port | `3000` |

### Package Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type check only |
| `npm run test` | Run test suite |
| `npm run test:perf` | Run performance benchmarks |
| `npm run start:standalone` | Run standalone server |
| `npm run release:gate` | Run release validation |

---

## File Structure

```
zo-qore/
├── zo/                    # Core Zo modules
│   ├── agent-os/          # Agent OS integration
│   ├── autonomy/          # Autonomy checker
│   ├── constellation/     # Constellation view
│   ├── embeddings/        # Embedding service
│   ├── fallback/          # Fallback CLI
│   ├── genesis/           # Clustering pipeline
│   ├── storage/           # DuckDB client
│   ├── ui-shell/          # Web UI
│   ├── victor/            # Victor kernel
│   └── void/              # Void capture
├── runtime/               # Runtime services
│   ├── api/               # API definitions
│   ├── planning/          # Planning stores
│   └── service/           # Server entry points
├── policy/                # Policy definitions
│   └── definitions/       # YAML rule files
├── tests/                 # Test suite
│   └── performance/       # Benchmarks
├── docs/                  # Documentation
├── deploy/                # Deployment scripts
└── scripts/               # Utility scripts
```

---

## Extending Zo-Qore

### Adding a New View

1. Create store: `runtime/planning/{Name}Store.ts`
2. Create types: `zo/{name}/types.ts`
3. Create UI: `zo/ui-shell/{name}.js`, `{name}.css`
4. Create API routes: `runtime/service/planning-routes-{name}.ts`
5. Add tests: `tests/planning/{name}-*.test.ts`
6. Update policy rules if needed

### Adding a Policy Rule

1. Create YAML definition in `policy/definitions/`
2. Use pattern: `plan-NNN` for ID
3. Define condition (when to apply) and action (block/warn/log)
4. Register in policy engine
5. Add tests for rule enforcement

### Adding an API Endpoint

1. Define types in `runtime/api/` or contracts
2. Create route handler in `runtime/service/planning-routes.ts`
3. Apply standard error shape via `ErrorFactory`
4. Add request validation
5. Log via `AuditLogger`
6. Add integration tests

---

## Monitoring & Observability

### Health Endpoint

```
GET /api/health
```

Returns:
- Service status
- Store health (disk space, file count)
- Last integrity check timestamp

### Logs

- Location: `/dev/shm/zo-qore*.log` (in-memory)
- Format: JSON lines
- Query via Loki at `http://localhost:3100`

### Metrics

- Request latency
- Store operation duration
- Policy evaluation time
- Error rates by code

---

## References

- [Contributing Guide](../CONTRIBUTING.md)
- [API Reference](./API_REFERENCE.md)
- [Decision Records](./decisions/)
- [Threat Model](./THREAT_MODEL.md)
