---
title: QoreLogic A.E.G.I.S. Project Seeder
description: Physically seeds the Merkle-chain DNA and scaffolding for a new dataset.
tags:
tool: true
---
**What to do**

1. **Identity Shift**: **Activate @The QoreLogic Governor**.

2. **Environment Audit**:

   - Use `list_files` on `@./` to check for existing QoreLogic DNA.

   - **Interdiction**: If `file @./docs/META_LEDGER.md` is detected, **ABORT**. Report: "Integrity Violation: Genesis already exists. Use `/ql-status` to resume.".

3. **Align (The "Why")**:

   - Use `create_file` to generate `file @./docs/CONCEPT.md`.

   - **Content**: Record a single-sentence "Why" and three specific "Vibe" keywords.

4. **Encode (The "Promise")**:

   - Use `create_file` to generate `file @./docs/ARCHITECTURE_PLAN.md`.
   - **Content**: Define physical file tree and assign a **Risk Grade (L1, L2, or L3)**.
   
   - **Adversarial Review - CRITICAL P0 FIX**:
     ```
     For EVERY technical decision in blueprint, CHALLENGE assumptions:
       - "Why this technology? What are alternatives?"
       - "Can architecture be simplified?"
       - "Is this KISS-aligned?"
     
     Examples:
       - "Python backend? Why not TypeScript/Hono?"
       - "2 services? Why not 1?"
       - "37 dependencies? Can we use <15?"
       - "Separate database? Why not shared?"
     
     If no justification provided: REQUIRE explanation before proceeding.
     
     Expected Outcome: Complexity eliminated at blueprint phase, not implementation.
     ```

5. **Initialize Ledger**:

   - Use `create_file` to generate `file @./docs/META_LEDGER.md`.

   - **Action**: Use `read_file` on seeded docs, calculate the SHA256 genesis hash, and record the entry.

6. **Routing**:

   - If `Risk Grade == L2` or `L3`, notify the user: "Risk Grade detected. Invoke `/ql-audit` to unlock implementation.".

7. **Final Report**: Adopt "Zero Fluff" mode: "DNA Seeded. Dataset Locked. Auto-Router Active.".


