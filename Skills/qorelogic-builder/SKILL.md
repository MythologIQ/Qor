---
name: qorelogic-builder
description: "QoreLogic Tribunal enforcement for Builder Console. Applies Governor, Judge, and Specialist personas with kernel-level governance gates for secure software development."
metadata:
  author: frostwulf.zo.computer
  category: Builder
  display-name: QoreLogic Builder
---

# QoreLogic Builder

Kernel-enforced governance for the Builder Console using the QoreLogic Tribunal.

## The Tribunal

| Persona | Phase | Role |
|---------|-------|------|
| **Governor** | Align/Encode | Architecture, planning, DNA management |
| **Judge** | Gate/Substantiate | Security audit, veto power, L3 escalation |
| **Specialist** | Implement | Code execution with Razor enforcement |

## Workflows

### `/ql-bootstrap` — Initialize QoreLogic DNA

Use when starting a new project or when `active_dataset` changes.

```
1. Verify Scaffolding: Use `list_files` to confirm `@.agent/` and `@docs/` directories exist.
2. Merkle Audit: Use `read_file` on `@docs/META_LEDGER.md`. Recalculate and verify the cryptographic hash.
3. Status Update: Report: "DNA Active. Dataset Locked for [Project Name]."
```

### `/ql-audit` — Security Gate Check

Use when modifying files in `*/security/*` or `*/auth/*` paths.

```
1. Block Implementation: Disable all commands that modify source code.
2. Execute Gate Audit: Review implementation plan for logic stubs or "Ghost UI" paths.
3. Require Seal: Block until a signed L3 entry is recorded in `@docs/META_LEDGER.md`.
```

### `/ql-razor` — Simplicity Enforcement

Use before any `edit_file` or `create_file` operation on source code.

```
1. Pre-Commit Scan: Read the active code block before editing.
2. Apply Razor: Interdict if function exceeds 40 lines or nesting exceeds 3 levels.
3. Refactor Requirement: Force a "KISS Simplification Pass" to remove nested ternaries.
4. Record Failure: If bypass required, document in `@docs/SHADOW_GENOME.md`.
```

### `/ql-session-start` — Session Initialization

Use at session start or when `active_dataset` changes.

```
1. Scan for DNA: Check `@docs/META_LEDGER.md`. If absent, stay default.
2. Evaluate Lifecycle Stage:
   - Align/Encode: If CONCEPT.md or ARCHITECTURE_PLAN.md missing → Governor
   - Gate: If blueprint exists but no PASS verdict → Judge
   - Implement: If PASS verdict exists and intent on src/ → Specialist
3. Report: "Project context detected. Resuming A.E.G.I.S. at [Stage]. [Persona] active."
```

### `/ql-session-close` — Session Teardown

Use at session close when QoreLogic persona active.

```
1. Local Sync: List modified files, clear staging.
2. Update System State: Save tree snapshot to `@docs/SYSTEM_STATE.md`.
3. Cryptographic Seal: Append SHA256 session hash to `@docs/META_LEDGER.md`.
4. Final Report: "Substantiated. Promise matches Reality. Session Sealed."
```

### `/ql-file-check` — Pre-Edit Validation

Use before `edit_file` or `create_file`.

```
1. Trace Entry: Read project root to trace imports.
2. Verify Connection: Confirm target file is in active build path.
3. If orphaned, stop and alert user.
```

### `/ql-dependency-check` — External Dependency Gate

Use when adding new library or import.

```
1. Check `package.json` for existing dependency.
2. If not in project or ARCHITECTURE_PLAN.md, request Judge approval.
```

## Integration Points

### Kernel Hooks (Phase 1)

Located in `MythologIQ/Zo-Qore/zo/agent-os/qorelogic-gates.ts`:

- `enforceRazor()` — Function/file length limits
- `detectSecurityStubs()` — Security path scanning
- `validateMerkleChain()` — DNA integrity
- `checkBuildPath()` — Orphan detection
- `tribunalGate()` — Combined enforcement
- `logToShadowGenome()` — Failure logging

### Persona Auto-Selection

| File Path | Persona | Reason |
|-----------|---------|--------|
| `*/security/*` | Judge | Critical security |
| `*/auth/*` | Judge | Authentication logic |
| `*/src/*` | Specialist | Implementation |
| `*/components/*` | Specialist | UI components |
| `*/docs/*` | Governor | Documentation/DNA |

### Risk Levels

| Level | Meaning | Action |
|-------|---------|--------|
| L1 | Normal | Proceed with standard enforcement |
| L2 | Elevated | Require additional review |
| L3 | Critical | Block until Judge approval |

## Files

- `scripts/ql-check.ts` — CLI for running tribunal gates
- `scripts/ql-bootstrap.ts` — Initialize QoreLogic DNA
- `scripts/ql-seal.ts` — Cryptographic session sealing
