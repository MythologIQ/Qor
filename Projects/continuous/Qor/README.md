<p align="center">
  <strong>Qor</strong><br>
  <em>Governed autonomy for agent systems</em>
</p>

<p align="center">
  <a href="https://github.com/MythologIQ/Qor/actions"><img src="https://img.shields.io/github/actions/workflow/status/MythologIQ/Qor/ci.yml?branch=main&style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/MythologIQ/Qor/issues"><img src="https://img.shields.io/github/issues/MythologIQ/Qor?style=flat-square&color=blue" alt="Issues"></a>
  <a href="https://github.com/MythologIQ/Qor"><img src="https://img.shields.io/github/last-commit/MythologIQ/Qor?style=flat-square" alt="Last Commit"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-f9f1e1?style=flat-square&logo=bun" alt="Bun"></a>
  <a href="https://frostwulf.zo.space/qor"><img src="https://img.shields.io/badge/dashboard-zo.space-7c3aed?style=flat-square" alt="Dashboard"></a>
</p>

---

Qor is a modular governance-first platform for autonomous agent systems. Every state mutation — phase creation, task updates, ledger entries, vetoes — passes through a **fail-closed governance gate** that requires structured evidence before allowing writes.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              zo.space (proxy layer)              │
│  /api/forge/*   /api/qora/*   /api/victor/*     │
└──────────────────────┬──────────────────────────┘
                       │
              ┌────────▼────────┐
              │  qor service     │  ← port 4100 (Bun)
              │  start.sh → Neo4j + Bun server
              └────────┬────────┘
                       │ evidence required
              ┌────────▼────────┐
              │ Governance Gate │  ← fail-closed
              │  classify → validate → evaluate   │
              └────────┬────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   evidence/      forge/         qora/
   ledger.jsonl   ledger.jsonl   Neo4j :LedgerEntry
                                 (via IPC kernel ops)
```

## Modules

| Module | Purpose |
|--------|---------|
| **Forge** | Build management — phases, tasks, risks, roadmap tracking |
| **Qora** | Distributed consensus — hash-chained ledger, vetoes, provenance |
| **Victor** | Agent heartbeat — autonomy derivation, governance, chat |
| **Continuum** | Semantic + procedural intelligence — Neo4j graph, embeddings |
| **Evidence** | Governance contracts, policy evaluation, evidence bundling |

## Governance Gate

All write endpoints enforce evidence-gated governance:

- **No evidence** → `403 Block` (fail-closed)
- **Invalid evidence** → `403 Block`
- **Valid lite evidence** (intent, justification, inputs, expectedOutcome) → evaluated against policy
- **Valid full bundle** (entries, sessionId, confidence) → evaluated with higher confidence

Every decision is recorded to `evidence/ledger.jsonl` as a `PolicyDecision` entry. Module ledger entries include a `governanceDecisionId` for end-to-end traceability.

### Gated Endpoints

| Endpoint | Action | Module |
|----------|--------|--------|
| `POST /api/forge/create-phase` | phase.create | forge |
| `POST /api/forge/update-task` | task.update | forge |
| `POST /api/forge/update-risk` | risk.update | forge |
| `POST /api/qora/append-entry` | ledger.append | qora |
| `POST /api/qora/record-veto` | veto.record | qora |

## Project Structure

```
Qor/
├── evidence/           # Governance contracts, gate, evaluation, logging
│   ├── contract.ts     # Type definitions (EvidenceBundle, GovernanceDecision, etc.)
│   ├── governance-gate.ts  # Central fail-closed enforcement
│   └── tests/          # 20+ tests
├── forge/              # Build manager (phases, tasks, risks)
│   └── src/kernel/     # Forge IPC kernel (identity + memory store)
├── qora/               # Consensus ledger (hash-chain, vetoes)
│   └── src/kernel/     # Qora IPC kernel (identity + memory store)
├── victor/             # Agent heartbeat and autonomy kernel
├── continuum/          # Semantic graph intelligence (Neo4j)
│   ├── src/memory/ops/ # Server-side ops (execution, ledger, learning, search)
│   ├── src/ipc/        # UDS IPC server + auth
│   └── client/         # ContinuumClient facade
├── qor/                # Mono-service entrypoint + canary
├── .secrets/           # IPC agent tokens (gitignored)
├── docs/               # Architecture plans, concepts, META_LEDGER
└── scripts/            # Migration + canary utilities
```

## Development

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0

### Run Tests

```bash
cd evidence && bun test
cd forge && bun test
cd qora && bun test
cd continuum && bun test
```

### API Authentication

Routes authenticate via the `X-Api-Key` header:

```bash
curl -X POST https://frostwulf.zo.space/api/forge/create-phase \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Phase",
    "objective": "Build something",
    "evidence": {
      "intent": "Create build phase",
      "justification": "Roadmap milestone",
      "inputs": ["phases.json"],
      "expectedOutcome": "Phase appended"
    }
  }'
```

## Design Principles

- **Fail-closed governance** — no write without evidence
- **Section 4 Simplicity Razor** — functions ≤ 40 lines, files ≤ 250 lines, nesting ≤ 3
- **Append-only ledgers** — hash-chained, immutable audit trail
- **Dual-ledger traceability** — evidence ledger + module ledger linked by `governanceDecisionId`
- **TDD-Light** — tests written alongside implementation

## Dashboard

Live at [frostwulf.zo.space/qor](https://frostwulf.zo.space/qor) — real-time visibility into Victor heartbeats, Forge progress, Qora consensus, and Continuum graph state.

---

<sub>Built by <a href="https://github.com/MythologIQ">MythologIQ</a></sub>
