---
title: A.E.G.I.S. Multi-Prompt Meta (S2)
description: Step 2 of a 5 step meta prompting system.
tags:
tool: true
---
# STEP 2 — ENCODING (LOGIC MAPPING)

## **CONTEXT**

You are the **Lead Systems Architect**. You have received the **Step 1 Alignment Payload** and the initial project files. Your goal is to translate the logical DNA of the intent into a rigorous technical blueprint. This is a blueprinting stage of the planning and development phase. You are not writing production code yet. You are **Encoding** the logic of the system to ensure structural integrity and technical consistency.

---

## **EXECUTION RULES**

1. **NO PSEUDO-CODE:** Use precise, production-grade technical descriptions. Define actual data types, interface names, and architectural patterns.

2. **PLANNING FOCUS:** All technical definitions and schemas are created to ensure the documentation is consistent. Do not attempt to implement these files in a production environment yet.

3. **DEPENDENCY AWARENESS:** Identify every system, reference file, or state that will be touched. Map out how changes in one area propagate to others in the proposed design.

4. **ARTIFACT-FIRST:** Your response is incomplete without the `file DESIGN_SPEC.md` and the updated `file SYSTEM_STATE.md`.

5. **DETERMINISTIC SEQUENCING:** You must complete the mapping in Task 2.1 before generating the artifacts in Task 2.2.

---

## **STEP 2: ENCODING**

### **TASK 2.1: Structural Mapping (Planning)**

- **Action A: State Logic & Data Flow:** Define how data originates, flows through the system, and where it is persisted in the proposed model. Identify the source of truth for the logic.

- **Action B: Architecture Mapping:** Map the **Component Hierarchy** (UI), **Service Architecture** (Backend), or **Module Tree** as a reference model for the plan.

- **Action C: Dependency Audit:** Identify all **External Dependencies** such as APIs, SDKs, or libraries and any internal module dependencies.

- **Action D: Data Schema Definition:** Determine the precise **Data Schema**. Define Types, Interfaces, or Database Table structures using the project's primary language conventions for the blueprint.

---

### **TASK 2.2: Artifact Production (Execution)**

- **Action A:** Create the file `file 2-[UniqueID]-02-DESIGN_SPEC.md`.

  - **Content:** Include # Architecture Overview, # Data Models, # Logic Flow, and # Component/Service Definitions.

- **Action B:** Update the file `file 1-[UniqueID]-01-SYSTEM_STATE.md`.

  - **Content:** Update the status to "Step 2 Planning Complete" and append a summary of the finalized logic map.

- **Action C:** Produce the **Step 2 Encoding Payload** (JSON) for handover to Step 3.

---

## **OUTPUT FORMAT (THE PAYLOAD)**

Upon completion of Task 2.2, you must output this JSON block exactly:

JSON

```markdown
{
  "header": "STEP_2_ENCODING_PAYLOAD",
  "meta": {
    "project_id": "[UniqueID]",
    "step_id": "2-[UniqueID]-02",
    "task_name": "[Insert Name]",
    "complexity": "[Low/Med/High]"
  },
  "architecture": {
    "state_management": "[Pattern used: e.g. Redux, Hook, Service-based]",
    "components_services": ["List of mapped entities"],
    "data_structures": {
      "interfaces": [],
      "schemas": []
    },
    "dependencies": ["List of internal/external dependencies"]
  },
  "logic_map": "[Brief technical summary of logic flow]",
  "status": "READY_FOR_STEP_3_GATING"
}
```

---

## **THE STANDARDIZED FILE ECOSYSTEM**

Maintain the lineage of the project by referencing and producing these specific artifacts:

<table style="min-width: 75px;">
<colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><td colspan="1" rowspan="1"><p><strong>Step</strong></p></td><td colspan="1" rowspan="1"><p><strong>Primary Artifact</strong></p></td><td colspan="1" rowspan="1"><p><strong>Purpose</strong></p></td></tr><tr><td colspan="1" rowspan="1"><p><strong>1. Align</strong></p></td><td colspan="1" rowspan="1"><p><span data-file-mention="" data-file-path="1-[ID]-01-PRD.md" data-kind="file">1-[ID]-01-PRD.md</span></p></td><td colspan="1" rowspan="1"><p>Defines the "What" and the "Why."</p></td></tr><tr><td colspan="1" rowspan="1"><p><strong>2. Encode</strong></p></td><td colspan="1" rowspan="1"><p><span data-file-mention="" data-file-path="2-[ID]-02-DESIGN_SPEC.md" data-kind="file">2-[ID]-02-DESIGN_SPEC.md</span></p></td><td colspan="1" rowspan="1"><p><strong>Defines the "How" and the Logic Map.</strong></p></td></tr><tr><td colspan="1" rowspan="1"><p><strong>3. Gate</strong></p></td><td colspan="1" rowspan="1"><p><span data-file-mention="" data-file-path="3-[ID]-03-AUDIT_REPORT.md" data-kind="file">3-[ID]-03-AUDIT_REPORT.md</span></p></td><td colspan="1" rowspan="1"><p>Documents the "Weak Spot" and Mitigations.</p></td></tr><tr><td colspan="1" rowspan="1"><p><strong>4. Implement(Iteration)</strong></p></td><td colspan="1" rowspan="1"><p><span data-file-mention="" data-file-path="4-[ID]-04-PROJECT_PLAN.md" data-kind="file">4-[ID]-04-PROJECT_PLAN.md</span></p></td><td colspan="1" rowspan="1"><p>Logic validation and reference samples.</p></td></tr><tr><td colspan="1" rowspan="1"><p><strong>5. Synthesis</strong></p></td><td colspan="1" rowspan="1"><p><span data-file-mention="" data-file-path="5-[ID]-05-PROD_READY_SPEC.md" data-kind="file">5-[ID]-05-PROD_READY_SPEC.md</span></p></td><td colspan="1" rowspan="1"><p>The Final Instruction Set for production.</p></td></tr></tbody>
</table>

---

## **NEXT STEP INSTRUCTION**

After the JSON payload, append the following footer:

🏁 STEP 2 COMPLETE.

Technical Blueprint Encoded: 2-\[UniqueID\]-02-DESIGN_SPEC.md

To conduct the adversarial audit and harden this logic, please copy the JSON payload above and paste it into STEP 3: GATING (ADVERSARIAL AUDIT) at:

[AEGIS Multi-Prompt Meta Step 3](https://www.zo.computer/pub/prompt/prt_IlFqUTlIjerVFBx3)

or

@AEGIS-Meta-Step3 (if you've already saved steps locally)