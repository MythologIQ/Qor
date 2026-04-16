/**
 * One-shot script: Align Forge phases with 2026-04-05 gap audit.
 * Run with: bun forge/src/scripts/align-gap-audit.ts
 */
import { createPhase } from "../projects/manager";

const phases = [
  // P0: Evidence Layer Wiring
  {
    name: "Evidence Layer API Wiring",
    objective: "Expose evidence-layer contract (evaluate, log, bundle) through Continuum API routes and wire the write-side so governance lifecycle events automatically produce evidence records.",
    tasks: [
      { title: "Create evidence API route handlers on Continuum service", description: "Add POST /api/continuum/evidence/evaluate, /evidence/log, /evidence/bundle endpoints that call the existing contract.ts, evaluate.ts, log.ts, bundle.ts modules." },
      { title: "Wire governance lifecycle events to evidence logger", description: "Hook plan, audit, implement, substantiate events into the evidence append-only ledger so every lifecycle transition is recorded automatically." },
      { title: "Add evidence proxy paths to zo.space API route", description: "Extend the /api/continuum/graph proxy ALLOWED list with evidence endpoints." },
      { title: "Write integration tests for evidence API endpoints", description: "Test evaluate, log, and bundle endpoints return correct shapes and persist to the evidence ledger." },
    ],
  },
  // P1: Evidence Recording in Governance Lifecycle
  {
    name: "Evidence Recording in Governance Lifecycle",
    objective: "Ensure every governance lifecycle event (plan creation, audit verdict, implementation seal, substantiation) automatically produces a structured evidence record linked to Continuum.",
    tasks: [
      { title: "Define evidence record schema for each lifecycle event type", description: "Specify the shape of evidence records for plan, audit, implement, and substantiate events with provenance hashes." },
      { title: "Instrument qor-plan skill to emit evidence on plan creation", description: "After a plan is created and committed, emit an evidence record to the evidence ledger." },
      { title: "Instrument qor-audit skill to emit evidence on verdict", description: "After audit PASS/VETO, emit evidence with the verdict, chain hash, and flagged items." },
      { title: "Instrument qor-substantiate to emit evidence on seal", description: "After Merkle seal, emit a final evidence record linking all prior evidence for the session." },
    ],
  },
  // P2: Victor Audit Page Rewire
  {
    name: "Victor Audit Page Rewire",
    objective: "Rewire the /qor/victor zo.space page to consume real promotion-gate, soak-evidence, and heartbeat data from the Victor kernel APIs instead of stubs.",
    tasks: [
      { title: "Expose promotion-gate summary as a Victor API endpoint", description: "Create GET /api/victor/promotion-gate that returns the PromotionGateSummary from promotion-gate.ts." },
      { title: "Expose soak-evidence summary as a Victor API endpoint", description: "Create GET /api/victor/soak-evidence that returns the SoakEvidenceSummary." },
      { title: "Update /qor/victor page to fetch and display real promotion data", description: "Replace stubbed promotion status with live API calls to promotion-gate and soak-evidence endpoints." },
      { title: "Write tests for Victor API endpoints", description: "Test promotion-gate and soak-evidence endpoints return correct shapes." },
    ],
  },
  // P3: Continuum Ingestion Fix
  {
    name: "Continuum Ingestion Reliability",
    objective: "Harden the Continuum ingestion pipeline to handle edge cases: duplicate records, malformed JSONL, missing embeddings, and stale heartbeat files.",
    tasks: [
      { title: "Add deduplication guard to memory-to-graph ingest", description: "Check record fingerprint before inserting to Neo4j, skip duplicates." },
      { title: "Add JSONL validation before ingestion", description: "Validate each line parses as valid JSON with required fields before graph write." },
      { title: "Handle missing embeddings gracefully in batch clustering", description: "Skip records without embeddings in cluster pipeline instead of erroring (audit flag F2 hardening)." },
      { title: "Write tests for ingestion edge cases", description: "Test duplicate rejection, malformed JSONL handling, and missing embedding graceful degradation." },
    ],
  },
  // P4: Dead Service Cleanup
  {
    name: "Dead Service and Route Cleanup",
    objective: "Identify and remove dead zo.space routes, unused API endpoints, and orphaned service registrations that no longer serve live functionality.",
    tasks: [
      { title: "Audit all zo.space routes for liveness", description: "List all routes, test each for 200/404, flag dead ones." },
      { title: "Audit registered user services for liveness", description: "List all registered services, check if their ports respond, flag dead ones." },
      { title: "Remove confirmed dead routes and services", description: "Delete routes and unregister services confirmed dead after audit." },
      { title: "Document active service inventory", description: "Update SYSTEM_STATE with the canonical list of active services, ports, and routes." },
    ],
  },
  // B1: Governance Memory
  {
    name: "Governance Memory Integration",
    objective: "Record all governance decisions (plan verdicts, audit results, VETO patterns, substantiation seals) as first-class Continuum episodic records so the intelligence layers can derive governance patterns.",
    tasks: [
      { title: "Define governance episodic record types", description: "Extend EpisodicRecord with governance-specific fields: verdict, chain_hash, session_id, lifecycle_stage." },
      { title: "Write governance events to Neo4j on lifecycle transitions", description: "Hook into META_LEDGER append to also write governance nodes to the graph." },
      { title: "Enable semantic derivation over governance records", description: "Ensure co-occurrence and clustering include governance records, surfacing recurring decision patterns." },
      { title: "Write tests for governance record ingestion", description: "Test that plan, audit, implement, and seal events create proper graph nodes." },
    ],
  },
  // B2: Shadow Genome Graph
  {
    name: "Shadow Genome Graph Projection",
    objective: "Project SHADOW_GENOME failure patterns and mandatory guards into Neo4j as queryable graph nodes, enabling the procedural layer to mine anti-patterns.",
    tasks: [
      { title: "Parse SHADOW_GENOME.md into structured records", description: "Extract VETO patterns, mandatory guards, and failure modes from the Shadow Genome document." },
      { title: "Create Shadow Genome node types in Neo4j", description: "Define :ShadowGenome:Pattern and :ShadowGenome:Guard labels with provenance edges." },
      { title: "Wire procedural mining to check against shadow patterns", description: "When mining procedures, cross-reference against shadow genome to flag anti-patterns." },
      { title: "Write tests for shadow genome graph operations", description: "Test parsing, graph insertion, and anti-pattern detection." },
    ],
  },
  // B3: Workcell State Machine
  {
    name: "Workcell Formal State Machine",
    objective: "Replace ad-hoc task status transitions with a formal state machine that enforces valid lifecycle transitions: planned → active → blocked/done, with governance gates at each transition.",
    tasks: [
      { title: "Define the workcell state machine transitions", description: "Specify valid state transitions with guards: planned→active requires plan, active→done requires substantiation." },
      { title: "Implement state machine enforcement in task updates", description: "Reject invalid transitions in updateTaskStatus with clear error messages." },
      { title: "Add governance gate checks at transition boundaries", description: "Before transitioning to 'done', verify evidence exists. Before 'active', verify plan exists." },
      { title: "Write tests for state machine enforcement", description: "Test all valid transitions succeed and invalid transitions are rejected." },
    ],
  },
  // B4: Trust Stage Enforcement
  {
    name: "Runtime Trust Stage Enforcement",
    objective: "Enforce the 5-tier trust progression at runtime so Victor cannot escalate beyond its earned autonomy level, with automatic demotion on governance violations.",
    tasks: [
      { title: "Add trust stage validation to heartbeat execution", description: "Before executing any action, verify the current trust tier permits it." },
      { title: "Implement automatic demotion on governance violation", description: "When a governance denial or contradiction is detected, drop trust tier by one level." },
      { title: "Add trust stage audit trail to heartbeat ledger", description: "Log every trust stage transition (promotion/demotion) with reason and evidence." },
      { title: "Write tests for trust enforcement and demotion", description: "Test that violations trigger demotion and tier checks prevent unauthorized actions." },
    ],
  },
  // B5: Autonomy Boundary Runtime Limits
  {
    name: "Autonomy Boundary Runtime Limits",
    objective: "Define and enforce runtime resource limits per autonomy level: action budgets, time windows, file access scope, and API call limits that scale with trust tier.",
    tasks: [
      { title: "Define resource limits per autonomy level", description: "Specify max actions/tick, max files modified, max API calls, and time window per tier." },
      { title: "Implement resource limit enforcement in heartbeat", description: "Track resource consumption per tick and enforce limits, blocking when exceeded." },
      { title: "Add resource consumption metrics to heartbeat state", description: "Expose current consumption vs limits in the heartbeat state snapshot." },
      { title: "Write tests for resource limit enforcement", description: "Test that exceeding limits blocks further actions and consumption tracking is accurate." },
    ],
  },
];

console.log("Creating gap audit phases in Forge...\n");

for (const p of phases) {
  const result = createPhase(p.name, p.objective, p.tasks);
  console.log(`  ${result.ok ? "✓" : "✗"} ${p.name} → ${result.phaseId}`);
}

console.log(`\nDone. Added ${phases.length} phases (ordinals 24-${23 + phases.length}).`);
