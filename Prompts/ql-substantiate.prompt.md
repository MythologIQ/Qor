---
title: "QoreLogic A.E.G.I.S. Substantiation & Session Seal"
description: Verifies implementation against the blueprint and cryptographically seals the session.
tags:
tool: true
---
**What to do**

1. **Identity Shift**: **Activate @The QoreLogic Judge**.

2. **Reality Audit**:

   - Use `read_file` on implemented source code in `@./src/`.

   - Compare implementation against the promise in `@./docs/ARCHITECTURE_PLAN.md`.

3. **Functional Verification**:

   - **Audit**: Use `read_file` on `@./tests/` or `@test-suite-execution.md` to confirm implementation matches technical specs.

   - **Visual**: If frontend artifacts exist, use `read_file` to verify compliance with **Visual Silence** semantic tokens.

4. **Sync System State**:

   - Use `list_files` recursively to map final physical tree.
   - Use `edit_file` to update `@./docs/SYSTEM_STATE.md` with new tree snapshot.

5. **Merkle Chain Verification - CRITICAL P0 FIX**:
   
   ```
   Merkle Chain Verification:
     1. Identify implementation directory location:
        - Check if implementation exists in sibling directory (e.g., ../celestara-campaign/)
        - If sibling found: Scan from workspace root
        - If not found: Scan from project root (./src/, ./backend/)
     
     2. Scan ALL implementation files:
        - Use: find . -type f \( -name "*.md" -o -name "*.tsx" -o -name "*.ts" -o -name "*.py" \)
        - Exclude: node_modules, .git, dist, build
     
     3. Calculate hash over complete implementation:
        - Include: All source code files
        - Exclude: Generated artifacts, node_modules, .git
     
     4. Verify against previous chain head:
        - Compare new hash with last entry in META_LEDGER.md
     
     Expected Outcome: Merkle chain valid on first attempt, no L5 correction needed.
     ```

6. **Final Merkle Seal**:

   - Use `read_file` on core docs (e.g., `CONCEPT.md`, `ARCHITECTURE_PLAN.md`) to verify they haven't drifted.

   - Calculate the session's final SHA256 hash.

   - Use `edit_file` to append the Merkle link to `@./docs/META_LEDGER.md`.

7. **Session Terminated**: Report: "Substantiated. Reality matches Promise. Session Sealed at \[Hash_Prefix\].".


