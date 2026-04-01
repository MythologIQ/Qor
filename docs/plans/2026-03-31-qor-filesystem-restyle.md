# QOR Filesystem Restructure Plan

**Version**: 1.0  
**Date**: 2026-03-31  
**Status**: AUDIT PASS (L1)  
**Chain**: Qor > Victor, Qora, Forge, EvolveAI  

---

## Decision

**Choice A**: Mirror FailSafe-Pro structure exactly.  
**Decision**: ✅ **Yes — mirror exactly.** Simplification has not been productive for QOR. FailSafe-Pro is the proven architecture; QOR adopts it at scale.

Additionally: refactor the folder structure so it matches the system design. QOR > Victor, Qora, Forge, EvolveAI as top-level modules, with any subsystems nested from there.

---

## Target Structure

```
Qor/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── META_LEDGER.md
│   └── SHADOW_GENOME.md
│
├── victor/
│   ├── docs/
│   │   └── GOVERNANCE.md
│   ├── src/
│   │   ├── api/veto.ts
│   │   ├── cli/dry-run.ts
│   │   ├── heartbeat/mod.ts
│   │   ├── ui/VetoButton.tsx
│   │   └── governance/
│   │       ├── ledger.ts
│   │       └── transparency.ts
│   └── tests/
│       └── heartbeat.test.ts
│
├── qora/
│   ├── docs/
│   │   └── GOVERNANCE.md
│   ├── src/
│   │   ├── moltbook/
│   │   │   ├── ledger.ts
│   │   │   └── connector.ts
│   │   └── governance/
│   │       └── ledger.ts
│   └── tests/
│
├── forge/
│   ├── docs/
│   │   └── GOVERNANCE.md
│   ├── src/
│   │   ├── mindmap/
│   │   ├── projects/
│   │   └── governance/
│   │       └── ledger.ts
│   └── tests/
│
├── evolveai/
│   ├── docs/
│   │   └── GOVERNANCE.md
│   ├── src/
│   │   └── governance/
│   │       └── ledger.ts
│   └── tests/
│
├── evidence/
│   └── sessions/
│       └── {session-id}.jsonl
│
├── shadow-genome/
│   ├── graph.json
│   └── embeddings/
│       └── recall.db
│
└── governance/
    ├── policies/
    │   ├── victor-default.yaml
    │   ├── qora-default.yaml
    │   └── forge-default.yaml
    └── ledger.jsonl
```

### Module Evidence Scope (FLAG F1 Resolution)

Each module owns its evidence sessions. Victor, Qora, Forge, and EvolveAI each have `*/evidence/sessions/` directories. Global evidence aggregation happens via IPC from the running system.

### Governance Policy Precedence (FLAG F2 Resolution)

Module-level policies override top-level defaults. `victor/governance/policies/victor-default.yaml` takes precedence over `governance/policies/defaults.yaml`.

### Route-to-Filesystem Mapping (FLAG F3 Resolution)

zo.space routes are self-contained inline code — no filesystem imports to update. The mapping is organizational naming convention only, not a build dependency.

---

## Route Tree (Driven by Structure)

```
/qor                              ← shell
/qor/victor                      ← victor/
/qor/victor/governance           ← victor/src/governance/
/qor/victor/audit                ← victor/src/governance/transparency.ts
/qor/victor/chat                 ← existing
/qor/qora                        ← qora/
/qor/qora/governance             ← qora/src/governance/
/qor/forge                        ← forge/
/qor/forge/mindmap               ← forge/src/mindmap/
/qor/forge/projects              ← forge/src/projects/
/qor/forge/roadmap              ← existing
/qor/forge/risks                ← existing
/qor/forge/governance            ← forge/src/governance/
/qor/evolveai                    ← evolveai/
/qor/evolveai/governance         ← evolveai/src/governance/
/qor/evidence/sessions           ← evidence/ (read-only view)
/qor/shadow-genome               ← shadow-genome/ (read-only view)
/qor/governance                  ← governance/ (policy management)
```

---

## Migration Steps

| # | Action | Risk |
|---|--------|------|
| 1 | Create all new module directories | Low |
| 2 | Move `src/heartbeat/` → `victor/src/heartbeat/` | Low |
| 3 | Move `src/api/veto.ts` → `victor/src/api/veto.ts` | Low |
| 4 | Move `src/cli/dry-run.ts` → `victor/src/cli/dry-run.ts` | Low |
| 5 | Move `src/ui/VetoButton.tsx` → `victor/src/ui/VetoButton.tsx` | Low |
| 6 | Move `src/moltbook/` → `qora/src/moltbook/` | Low |
| 7 | Move `src/qora/moltbook-connector.ts` → `qora/src/` | Low |
| 8 | Move `tests/heartbeat.test.ts` → `victor/tests/` | Low |
| 9 | Create stub `*/governance/` dirs in all 4 modules | Low |
| 10 | Create `evidence/`, `shadow-genome/`, `governance/` | Low |
| 11 | Create `docs/` governance docs per module | Low |
| 12 | Delete empty `src/`, `tests/` dirs | Low |
| 13 | Verify all imports resolve | High |
| 14 | Update META_LEDGER chain | — |
| 15 | Substantiate + push to GitHub | — |

---

## Audit Status

| Pass | Result |
|------|--------|
| Security (L3) | ✅ PASS |
| Ghost UI | ✅ PASS |
| Razor | ✅ PASS |
| Dependency | ✅ PASS |
| Macro-Level | ✅ PASS (3 non-blocking flags) |
| Orphan | ✅ PASS |

**Verdict**: PASS (L1)  
**Audit Hash**: `sha256:restructure-plan-v1-audit-v3`
