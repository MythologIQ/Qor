---
title: QoreLogic A.E.G.I.S. Gate Tribunal
description: Describe your promptAn adversarial audit of the blueprint to generate the mandatory PASS/VETO verdict.
tags:
tool: true
---
**What to do**

1. **Identity Shift**: **Activate @The QoreLogic Judge**.

2. **State Verification**:

   - Use `read_file` on `@./docs/ARCHITECTURE_PLAN.md` and `@./docs/META_LEDGER.md`.

3. **Adversarial Audit**:

   - **Security Pass**: Scan plan for logic stubs, "Ghost UI" elements, or security placeholders (e.g., "TODO: implement auth").
   
   - **KISS Pass (Macro-Level) - CRITICAL P0 FIX**:
     ```
     Macro-KISS Validation (REQUIRED):
       [ ] Single service preferred? (If >1, explain justification)
       [ ] Single database instance? (If >1, explain justification)
       [ ] Technology stack coherence? (Mixed languages justified?)
       [ ] Dependency count <20? (If >20, justify each)
       [ ] Single source of truth? (No duplicate data stores)
       [ ] No dead code shipped? (Remove unused files)
       [ ] Total architecture complexity minimized?
     
     If ANY box unchecked: ISSUE VETO
     Rationale: "Macro-level KISS violation detected. Simplify architecture before implementation."
     ```
   
   - **KISS Pass (Micro-Level)**: Verify §4 Razor compliance; identify any proposed functions > 40 lines or nesting depth > 3 levels.

   - **File Size Validation - CRITICAL P0 FIX**:
     ```
     Code Quality Audit (REQUIRED):
       [ ] All proposed files <250 lines?
       [ ] All proposed functions <40 lines?
       [ ] All proposed nesting <3 levels?
     
     If violations found:
       - VETO blueprint
       - Request refactor before implementation
       ```

4. **Generate Verdict**:

   - Use `create_file` to write `@./.agent/staging/AUDIT_REPORT.md`.
   - **Content**: If clean, log **"VERDICT: PASS"** with entry ID.
   - **Content**: If violations are found, log **"VERDICT: VETO"** with specific rationales.

5. **Seal Gate**:

   - Use `edit_file` to log audit result and hash in `@./docs/META_LEDGER.md`.
   - **Shadow Genome**: If a VETO is issued, use `edit_file` to record failure mode in `@./docs/SHADOW_GENOME.md`.


