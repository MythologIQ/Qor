# Qor — Workspace Memory

**System:** Qor (formerly Zo-Qore) | **Builder:** Forge | **Agent:** Victor | **Companion:** Qora
**Last Updated:** 2026-04-14 09:05 EDT

---

## Current State

| Component | Status |
|-----------|--------|
| **Phase 15 (Memory Operator Surface)** | 3/4 tasks done — `task_victor_memory_operator_views` pending |
| **Phase 13 (Cache Validation & Temporal Memory)** | COMPLETE (5/5) |
| **Phase 12 (Zero-Trust Crystallization)** | COMPLETE (4/4) |
| **Phase 10 (Thermodynamic Decay Foundation)** | COMPLETE (4/4) |
| **Neo4j** | Running (`.neo4j/`, port 7474/7687, svc `svc_Vw2b3WN68nM`) |
| **Continuum API** | Running (svc `continuum-api`) |
| **Heartbeat** | 6-hour cadence via rule `5084d04a`, observe-only, fail-closed execution path |

### Key Architecture

- **Execution dispatch** (`victor/src/heartbeat/execution-dispatch.ts`): Requires wired `ExecutionRunner` for implementation sources. Returns `blocked` if runner missing, `quarantined` if runner returns `completed` without evidence.
- **Evidence pipeline** (`evidence/`): Evaluation, mutation contracts, governance gates — all test-covered.
- **Memory directory**: `/home/workspace/.continuum/memory/victor/` (NOT `.evolveai`)
- **API path**: `/api/continuum/memory` (NOT `/api/evolveai/memory`)

### Services

| Service | ID | Port | Notes |
|---------|----|------|-------|
| neo4j | `svc_Vw2b3WN68nM` | 7474 | Entrypoint: `bash -c '/home/workspace/.neo4j/start-neo4j.sh'` |
| continuum-api | (check `list_user_services`) | varies | — |

### Model Strategy

FREE-FIRST: Kimi K2.5 primary, Minimax M2.7 fallback. Sonnet/Opus for interactive sessions only.
Cost governance: `memory/cost-governance.ts` enforces $0/day budget, 200 invocations/day.

### Repository

- **GitHub**: `MythologIQ/Qor` (redirecting to `Knapp-Kevin/Qor`)
- **Local**: `/home/workspace/Projects/continuous/Qor/`
- **Branch**: `main`

---

## Session Log

### 2026-04-14 — Workspace Cleanup + Forge Chat Planning

- Root workspace cleanup: trashed `docs/`, `evolveai/`, `governance/`, `qora/`, `victor/`, `forge/`, `--full-page`, `Frontier Models.xlsx` (all confirmed obsolete pre-reorg duplicates)
- AGENTS.md rewritten (12K → concise)
- `.gitignore` committed and pushed
- Forge Chat concept initiated: governed chat interface for Forge

### 2026-04-13 — Heartbeat Execution Path Hardening

- Diagnosed Neo4j FATAL (supervisor couldn't exec start script, fixed with `bash -c` wrapper)
- Committed & pushed fail-closed execution dispatch changes (8 files, commit `16e5633`)
- Workspace cleanup triage: identified stale root duplicates, `--full-page` artifact, missing `.gitignore` entries

### 2026-04-12 — Heartbeat Fail-Closed Status Fix

- PR #2 merged: heartbeat observation ticks correctly report fail-close status
- Commit `89396cf`

### 2026-04-06 — Heartbeat Agent Rule Updated

- Updated rule `5084d04a` to use `/api/continuum/memory` and `.continuum/` paths
- Deprecated `/api/evolveai/` references

### 2026-03-22 to 2026-03-23 — Phase 10-15 Heartbeat Execution

- Completed Phases 10, 12, 13 (all tasks, all tests passing)
- Phase 15 at 3/4 (memory operator views pending)
- Total governed tasks: 50+/82+ across victor-resident and builder-console projects

*[Older session records available in git history]*
