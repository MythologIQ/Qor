# Plan: Victor Heartbeat Evidence-First Runtime

## Open Questions

- Should bounded self-remediation be enabled in the first cut, or should the heartbeat stop at verified observation plus escalation records?
  - **Decision:** Bounded self-remediation is enabled in the first cut, but only for bounded, policy-safe cases after evidence collection.
- Should the scheduled Zo agent instruction be reduced to a thin trigger that invokes Victor runtime, or remain a richer prompt with runtime invariants embedded?
- Should `/api/continuum/memory` remain a side-effect of every successful tick, or only of ticks that produce a sealed observation record?

## Phase 1: Authoritative Heartbeat Record

### Affected Files

- `victor/src/heartbeat/runtime.ts` - route all heartbeat execution through a single typed tick pipeline
- `victor/src/heartbeat/mod.ts` - reduce to compatibility exports and thin wrappers
- `victor/src/heartbeat/state-persistence.ts` - persist authoritative tick state outside `/tmp`
- `victor/src/heartbeat/types.ts` - define sealed heartbeat record and branch types
- `victor/tests/heartbeat.test.ts` - update tests to assert record-driven outcomes
- `victor/tests/state-persistence.test.ts` - cover authoritative persistence and reload behavior

### Changes

Define a sealed heartbeat record as the sole source of truth for tick outcomes.

```ts
type HeartbeatBranch =
  | "observed"
  | "claimed"
  | "executed"
  | "blocked"
  | "failed"
  | "quarantined"
  | "persisted";

interface HeartbeatEvidenceRef {
  kind: "service-check" | "space-error-check" | "project-scan" | "task-writeback" | "memory-write";
  target: string;
  status: "success" | "failure" | "missing";
  artifact: string | null;
}

interface HeartbeatRecord {
  tickId: string;
  sessionId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "completed" | "blocked" | "failed" | "quarantined" | "no-op";
  branchHistory: HeartbeatBranch[];
  claimedTaskId: string | null;
  summary: string;
  evidence: HeartbeatEvidenceRef[];
}
```

Persist authoritative state under:

- `.qore/projects/victor-resident/heartbeat-state.json`
- `.qore/projects/victor-resident/heartbeat-records/<tickId>.json`

Rules:

- no user-facing summary without a persisted `HeartbeatRecord`
- `/tmp/victor-heartbeat/*` remains cache only
- every branch appends to `branchHistory`
- missing evidence forces `blocked`, `failed`, or `quarantined`; never `completed`

### Unit Tests

- `victor/tests/heartbeat.test.ts` - successful tick returns `completed` only when a persisted record exists
- `victor/tests/heartbeat.test.ts` - missing evidence artifact prevents `completed`
- `victor/tests/state-persistence.test.ts` - persisted record reloads after simulated process restart
- `victor/tests/state-persistence.test.ts` - `/tmp` loss does not erase authoritative heartbeat history

## Phase 2: Evidence-Bearing Check Executors

### Affected Files

- `victor/src/heartbeat/execution-dispatch.ts` - dispatch check executors and classify branch outcomes
- `victor/src/heartbeat/checks/project-status.ts` - verify Qor project status and emit artifact refs
- `victor/src/heartbeat/checks/space-health.ts` - wrap zo.space health check as typed artifact production
- `victor/src/heartbeat/checks/service-health.ts` - wrap service inspection as typed artifact production
- `victor/src/heartbeat/checks/memory-write.ts` - write observation record only from sealed tick result
- `victor/tests/execution-dispatch.test.ts` - assert branch classification and artifact requirements

### Changes

Split heartbeat work into explicit check executors with uniform outputs.

```ts
interface CheckExecutorResult {
  branch: "observed" | "blocked" | "failed";
  artifact: HeartbeatEvidenceRef;
  details: Record<string, unknown>;
}
```

Execution order:

1. project status check
2. space health check
3. service health check
4. optional memory write from sealed record

Rules:

- each executor returns an artifact ref
- summaries derive from executor results, not freeform narration
- service gaps are classified as `expected-missing`, `unexpected-missing`, or `degraded`
- if any required executor returns `failed` or missing artifact, tick cannot seal as `completed`

### Unit Tests

- `victor/tests/execution-dispatch.test.ts` - all required executors producing artifacts yields `completed`
- `victor/tests/execution-dispatch.test.ts` - missing service artifact yields `blocked` or `failed` with no completion claim
- `victor/tests/execution-dispatch.test.ts` - memory write does not run before record sealing
- `victor/tests/execution-dispatch.test.ts` - summary text is generated from executor outputs only

## Phase 3: Service Expectation Registry and Severity Policy

### Affected Files

- `victor/src/heartbeat/service-expectations.ts` - define expected services and severity mapping
- `victor/src/kernel/memory/execute-governance.ts` - consume heartbeat severity in governance decisions
- `governance/policies/victor-default.yaml` - classify heartbeat anomaly actions and thresholds
- `victor/tests/neo4j-connection.test.ts` - extend service expectation coverage
- `victor/tests/heartbeat.test.ts` - assert expected vs unexpected missing-service behavior

### Changes

Add a small registry for heartbeat expectations instead of inferring gaps from raw names.

```ts
interface ExpectedService {
  serviceKey: "neo4j" | "continuum-api" | "victor-kernel";
  required: boolean;
  acceptableAliases: string[];
  missingSeverity: "info" | "warning" | "critical";
}
```

Rules:

- heartbeat classifies service state against registry, not ad hoc string matching
- `victor-kernel` may be `replaced`, `inactive-by-design`, or `missing`
- only `critical` unexpected gaps create failure-grade records
- governance receives structured anomaly events instead of prose claims

### Unit Tests

- `victor/tests/heartbeat.test.ts` - alias match prevents false missing-service gap
- `victor/tests/heartbeat.test.ts` - inactive-by-design service yields non-failing observation
- `victor/tests/heartbeat.test.ts` - unexpected critical absence yields sealed failure record
- `victor/tests/neo4j-connection.test.ts` - registry severity integrates with existing service checks

## Phase 4: Operator and Agent Surfaces

### Affected Files

- `victor/src/kernel/memory/memory-operator-views.ts` - add heartbeat record view helpers
- `victor/src/api/heartbeat-status.ts` - expose latest sealed record and branch history
- `victor/tests/memory-operator-views.test.ts` - cover heartbeat record rendering
- `victor/tests/forge-writeback-e2e.test.ts` - assert end-to-end heartbeat record, writeback, and persistence
- `.qore/projects/victor-resident/path/phases.json` - track the remediation task state
- scheduled agent `f3712ef4-589e-4971-8916-a5850a49c3b0` - reduce instruction to runtime invariants and explicit no-claim-without-record rule

### Changes

Expose heartbeat truth directly to operators and tighten the scheduled agent contract.

Operator API shape:

```ts
interface HeartbeatStatusView {
  latestTickId: string | null;
  latestStatus: "completed" | "blocked" | "failed" | "quarantined" | "no-op" | null;
  branchHistory: HeartbeatBranch[];
  claimedTaskId: string | null;
  evidenceCount: number;
  summary: string | null;
}
```

Scheduled agent contract changes:

- require persisted `HeartbeatRecord` before any completion-language output
- prohibit inferred gap reporting without service registry classification
- require record-first memory write path
- require no-op status when observation succeeds but no remediation or claim occurs

### Unit Tests

- `victor/tests/memory-operator-views.test.ts` - renders latest heartbeat status from persisted record
- `victor/tests/forge-writeback-e2e.test.ts` - full tick produces sealed record, optional memory write, and operator-visible status
- `victor/tests/heartbeat.test.ts` - no-op tick exposes truthful operator status without false completion
- `victor/tests/heartbeat.test.ts` - scheduled-agent runtime invariants reject completion language when no record exists
