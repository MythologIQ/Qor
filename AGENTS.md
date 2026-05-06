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
| **Qor (mono-service)** | Running (port 4100 HTTP + 7687 Bolt, svc `svc_2syCkir_MDw`, entrypoint `qor/start.sh`) |
| **Heartbeat** | 6-hour cadence via rule `5084d04a`, observe-only, fail-closed execution path |

### Key Architecture

- **Execution dispatch** (`victor/src/heartbeat/execution-dispatch.ts`): Requires wired `ExecutionRunner` for implementation sources. Returns `blocked` if runner missing, `quarantined` if runner returns `completed` without evidence.
- **Evidence pipeline** (`evidence/`): Evaluation, mutation contracts, governance gates — all test-covered.
- **Memory directory**: `/home/workspace/.continuum/memory/victor/` (NOT `.evolveai`)
- **API path**: `/api/continuum/memory` (NOT `/api/evolveai/memory`)

