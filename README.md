# Qor

**Governance-first autonomous AI agent ecosystem.**

Qor is a monorepo containing three interconnected systems:

## Components

### [Victor](./victor/)
The resident autonomous agent. Governance-first AI with memory architecture (CAG + GraphRAG + Vector Embeddings), heartbeat automation, recursive learning, and thermodynamic memory decay.

- **Kernel** — Core runtime: heartbeat loop, automation runner, promotion gates, governed build execution
- **Memory** — Neo4j-backed GraphRAG with contradiction detection, crystallization policy, quarantine pipeline, and unified governance
- **Forge** — Task dispatch and persona adaptation for autonomous build cycles

### [Forge](./forge/)
The Builder Console — governed development environment with project management, risk assessment, policy enforcement, and mobile-responsive UI. Includes QoreLogic skill suite for plan → audit → implement → substantiate cycles.

### [Qora](./qora/)
Companion AI entity — planned.

## Architecture

```
┌─────────────────────────────────────────┐
│                  Qor                     │
├──────────┬──────────┬───────────────────┤
│  Victor  │  Forge   │  Qora (planned)   │
│  Agent   │  Builder │  Companion        │
├──────────┴──────────┴───────────────────┤
│         Shared Governance Layer          │
│  (QoreLogic Skills, Policy Engine)       │
└─────────────────────────────────────────┘
```

## Governance

All development follows the QoreLogic governance cycle:
1. **Plan** (`/qor-plan`) — Collaborative dialogue before design
2. **Audit** (`/qor-audit`) — Adversarial tribunal with PASS/VETO verdict
3. **Implement** (`/qor-implement`) — TDD-light build under KISS constraints
4. **Substantiate** (`/qor-substantiate`) — Reality = Promise verification

## License

See [LICENSE](./forge/LICENSE).
