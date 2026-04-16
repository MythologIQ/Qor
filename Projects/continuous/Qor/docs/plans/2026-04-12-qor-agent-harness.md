# Plan: QOR Agent Harness Development

**Version**: 1.1  
**Date**: 2026-04-12  
**Status**: DRAFT  
**Chain**: QOR Agent Harness / Governed Runtime Expansion  
**Risk Grade**: L3 (cross-cutting runtime, governance, memory, orchestration, and production operations)

---

## Intent

This is a build guide for turning QOR into a governed agent runtime rather than a collection of prompts and routes.

Forge remains the execution environment. Continuum remains the memory substrate. QOR remains the governance layer. Frameworks, agents, and tools must plug into those boundaries instead of redefining them.

## Core Architectural Rule

Do not optimize first for agent capability. Optimize first for control.

If an agent can act without passing through policy, identity, orchestration, and audit boundaries, the system is not governed. It is only decorated.

## Non-Negotiables

- All meaningful actions route through a policy-checked control surface.
- Agent identity is enforced by runtime records, not prompts.
- Orchestration is explicit, stateful, and replayable.
- Tools are only reachable through a mediated gateway.
- Continuum memory access is partitioned and policy-filtered.
- Governance hooks, risk scoring, and audit logging exist on every critical path.
- Public-facing capabilities are isolated from internal runtime surfaces.
- Frameworks remain implementation details, never system owners.

## Delivery Shape

The harness is tracked as one umbrella issue plus thirteen implementation issues. The sequence matters. Later phases assume earlier boundaries already exist.

## Phase Breakdown

### Phase 1: Establish the Control Surface Before Anything Else

Do not start with agents. Start with control.

Build a central interceptor between intent and execution. Every tool call, memory write, delegation, and state mutation must produce a structured action envelope and pass policy evaluation before execution.

The goal here is not to improve model behavior through prompt wording. The goal is to make ungoverned behavior impossible from the runtime side.

**What to build**
- A shared action envelope for all meaningful actions
- A central execution interceptor
- Policy evaluation before execution
- Explicit halt states for approval-required actions
- Consistent decision receipts for allow, deny, and wait outcomes

**Why it exists**
- This is the boundary that makes QOR real
- Every later layer assumes action mediation already exists
- It prevents execution paths from escaping governance

**Target areas**
- `evidence/`
- `victor/`
- `forge/`
- `qora/`
- `continuum/`

**Acceptance signals**
- Structured action envelopes are shared across modules
- Runtime blocks ungoverned execution paths
- Approval-required actions halt in a traceable waiting state
- Tests cover allow, deny, invalid, and approval-required flows

### Phase 2: Define Agent Identity as a System Primitive

Once control exists, define what an agent is in the system.

Do not define agents as prompts. Define them as runtime-enforced records containing role, authority level, tool permissions, memory permissions, and collaboration rules.

The runtime should load the identity record into execution context and use it to constrain everything the agent attempts to do.

**What to build**
- An agent registry with unique IDs
- Runtime identity records for builder, reviewer, social/public, and other classes
- Permission filters for tools and memory
- Collaboration rules encoded in identity rather than prompt prose

**Why it exists**
- Prompt text is not a reliable security boundary
- QOR needs authoritative identity outside the model
- Different agents should inherit different governance requirements

**Target areas**
- `victor/`
- `docs/`

**Acceptance signals**
- Registry-backed identities exist for harness agents
- Runtime loads and enforces identity records
- Tool access is filtered by identity
- Memory access is filtered by identity
- Elevated roles carry stricter governance requirements than conversational roles

### Phase 3: Introduce Orchestration as a State Machine

Most agent systems fail because they rely on implicit loops. Avoid that entirely.

Implement orchestration as explicit state progression. Every task should move through named states such as planning, validation, execution, blocked, and completion. The system decides which state comes next.

Agents do not decide when work is done. The runtime decides based on state and evidence.

**What to build**
- Durable orchestration state
- Named workflow stages
- Transition logic independent of model improvisation
- Validation and review checkpoints
- Resumable execution with explicit current state

**Why it exists**
- It makes behavior deterministic enough to inspect and replay
- It prevents the model from inventing hidden control flow
- It creates a stable place to add governance hooks later

**Target areas**
- `victor/`
- `forge/`
- `docs/`

**Acceptance signals**
- Tasks move through named states with durable storage
- Completion is system-determined rather than self-declared
- Invalid transitions are blocked and logged
- Validator/reviewer checkpoints can prevent unsafe execution

### Phase 4: Build a Tool Gateway Instead of Direct Tool Access

Agents should not call tools directly.

Build a tool gateway that becomes the only interface between agents and external capabilities. Each tool should be registered with metadata for schema, side effects, output shape, and risk classification.

MCP can feed this gateway, but it does not replace it.

**What to build**
- Tool registry with metadata
- Gateway-based tool execution path
- Validation before execution
- Policy enforcement before execution
- Standardized tool receipts for orchestration consumption

**Why it exists**
- Tools are where abstract intent becomes real side effects
- Direct tool access bypasses governance
- Standardized responses make orchestration and tracing easier

**Target areas**
- `victor/`
- `evidence/`
- `docs/`

**Acceptance signals**
- Harness-managed flows have no direct tool execution path
- Tool registry includes schemas and risk metadata
- Gateway validates, logs, and policy-checks before execution
- Tool responses are normalized for downstream reasoning

### Phase 5: Implement Continuum as a Structured Memory System

Do not implement memory as one undifferentiated store.

Expose Continuum as a controlled memory service with partitions such as private agent memory, shared operational memory, canonical knowledge, public knowledge, and audit logs.

Retrieval should be based on classification, domain, and policy instead of similarity alone.

**What to build**
- Memory partitions with explicit access rules
- Memory access layer that evaluates both request and identity
- Policy-aware retrieval filtering
- Classification-aware routing
- Partition-specific auditability

**Why it exists**
- Memory is a controlled resource, not a convenience
- Similarity-only retrieval creates leakage risks
- Different agents should see different slices of system reality

**Target areas**
- `continuum/`
- `victor/`
- `docs/`

**Acceptance signals**
- Partition model is defined and enforced
- Retrieval is filtered by classification, domain, and policy
- Restricted agents cannot access disallowed partitions even when semantically similar
- Tests cover allowed and denied memory access by role

### Phase 6: Add Runtime Governance Hooks Everywhere

At this point the system works, but it is not yet resilient.

Embed governance hooks into tool execution, memory access, delegation, and orchestration transitions. Add risk scoring, approval escalation, kill switch behavior, and complete audit logging.

**What to build**
- Governance checks on every critical path
- Low, medium, and high risk grading
- High-risk approval escalation
- Kill switch controls
- End-to-end audit traces for action decisions

**Why it exists**
- Functional systems are not necessarily safe systems
- The runtime must be able to stop, not just proceed
- Every critical decision needs a traceable explanation

**Target areas**
- `evidence/`
- `victor/`
- `continuum/`
- `forge/`

**Acceptance signals**
- Risk scoring is enforced consistently
- High-risk actions can be paused or require approval
- Kill switch halts execution deterministically
- Audit logs capture decisions, risk, and outcomes end to end

### Phase 7: Introduce Multi-Agent Interaction Carefully

Only after the previous layers exist should multiple agents be introduced.

Define interaction patterns instead of allowing free communication. A builder agent may request a review from a validator agent, but that request must be structured, bounded, and routed through orchestration.

**What to build**
- Delegation contracts
- Executor, reviewer, and observer role patterns
- Minimal context-sharing rules
- Structured inter-agent request and response surfaces

**Why it exists**
- Checks and balances require controlled interaction, not free-form chatter
- Agent collaboration should remain governable and inspectable
- Context boundaries matter as much as tool boundaries

**Target areas**
- `victor/`
- `qora/`
- `docs/`

**Acceptance signals**
- Delegation flows are defined and governed
- Reviewer/validator roles can challenge executor outputs
- Context sharing is explicit and minimal by default
- Unstructured inter-agent channels are blocked

### Phase 8: Create a Public Boundary Layer

If external users will interact with the system, do not expose internal agents directly.

Create a restricted public-facing agent layer with access only to public memory and tightly controlled tools. Internal routing must pass through controlled interfaces and outputs must be filtered before return.

**What to build**
- Public agent identity class
- Restricted public runtime environment
- Internal handoff interfaces
- Response filtering for sensitive content and topology

**Why it exists**
- External access should not reveal internal memory or authority
- Public interaction is a boundary problem, not just a UX problem
- It prevents accidental system leakage

**Target areas**
- `victor/`
- `continuum/`
- `docs/`

**Acceptance signals**
- Restricted public agent class is enforced
- Public agents can only access public or explicitly exposed partitions
- Internal routing uses controlled interfaces only
- Response filtering prevents leakage of internal state and structure

### Phase 9: Implement Observation and Evaluation as First-Class Systems

The system must be inspectable.

Build tracing that records orchestration, tool usage, memory access, and decision points. Build replay workflows and evaluation workflows that measure correctness, policy compliance, efficiency, latency, and cost.

**What to build**
- Structured tracing
- Replay harnesses for known scenarios
- Evaluation pipelines
- Evaluator workflows for output review

**Why it exists**
- A runtime that cannot be inspected cannot be trusted
- Evaluation is how agent behavior becomes operationally manageable
- Replay is how regressions become debuggable

**Target areas**
- `evidence/`
- `victor/`
- `forge/`
- `docs/`

**Acceptance signals**
- Trace data captures execution path, tool usage, memory access, and decisions
- Replay exists for at least one end-to-end scenario class
- Evaluation includes policy compliance, accuracy, latency, and cost dimensions
- Failures are diagnosable from stored trace artifacts

### Phase 10: Select Frameworks Without Letting Them Define You

Frameworks become implementation details rather than architectural decisions.

The system should be able to swap orchestration engines, tool providers, or model vendors without rewriting core governance or memory logic. Use frameworks tactically.

LangGraph fits explicit, replayable workflows. Microsoft Agent Framework fits typed middleware and enterprise telemetry. OpenAI Agents SDK fits lightweight conversational roles. CrewAI may help prototyping but should not own the runtime. LlamaIndex can augment document workflows but should not replace Continuum. MCP should standardize tool interfaces but must still route through the QOR gateway.

**What to build**
- Adapter boundaries by subsystem
- Integration rules for orchestration, tools, memory augmentation, and experimentation
- Explicit non-bypass rules for governance and memory controls

**Why it exists**
- Framework-led architecture drifts fast
- QOR should own the runtime even when frameworks are present
- Integration flexibility matters for long-term maintainability

**Target areas**
- `docs/`
- `victor/`
- `continuum/`

**Acceptance signals**
- Framework guidance exists by subsystem
- Adapters preserve QOR control surface and identity enforcement
- No framework directly owns policy, memory permissions, or final execution authority

### Phase 11: Production-Grade MLOps and SDLC Integration

At this stage, the goal shifts from capability to operational reliability.

Formalize the harness as a deployable product with development, staging, and production environments. Version agent definitions, policies, memory schemas, and tool contracts as code. Build CI/CD pipelines that validate behavior rather than only code.

This includes scenario-based regression testing, behavioral evaluation gates, model and prompt versioning, canary deployments, structured tracing, and environment isolation.

**What to build**
- Environment separation for dev, staging, and production
- Configuration as code for agents, policies, tools, and memory schemas
- CI/CD pipelines that evaluate behavior and block regressions
- Model and prompt versioning
- Canary deployment mechanics
- Expanded observability and metrics
- Secret handling and least-privilege credentials
- Data governance rules by classification

**Why it exists**
- Production agent systems require reproducibility and controlled evolution
- Behavioral regressions matter as much as code regressions
- Security and data governance must be formalized before scale

**Target areas**
- `docs/`
- `victor/`
- `forge/`
- `continuum/`
- `evidence/`

**Acceptance signals**
- Dev, staging, and prod are isolated by memory, tools, and policy config
- Behavioral evaluations run in CI/CD and can block release
- Model/prompt changes are versioned and canaried
- Metrics exist at system, agent, tool, and memory layers
- Secrets and sensitive data handling are formally scoped

### Phase 12: Advanced Runtime Patterns and Optimization

Once the system is stable, introduce advanced runtime behavior carefully.

This includes adaptive orchestration, hierarchical agent structures, dynamic memory routing, cost optimization, latency optimization, and graceful fault tolerance.

The point is not novelty. The point is controlled performance and scale.

**What to build**
- Adaptive orchestration paths based on risk and context
- Hierarchical or supervisory agent structures
- Dynamic memory routing
- Model selection by task complexity
- Caching and batching strategies
- Parallel execution for independent work
- Retry, failover, and escalation mechanisms

**Why it exists**
- Stable systems can now optimize without collapsing boundaries
- Cost and latency matter once utilization grows
- Fault tolerance becomes mandatory at operational scale

**Target areas**
- `victor/`
- `continuum/`
- `forge/`
- `docs/`

**Acceptance signals**
- High-risk tasks can automatically add extra validation steps
- Supervisory coordination exists without bypassing governance
- Dynamic memory routing improves performance without weakening access control
- Retry and escalation flows handle bounded failures gracefully

### Phase 13: Continuous Improvement and Governance Evolution

A production agent ecosystem is never finished. It evolves.

Build the feedback loops, change management rules, documentation discipline, and scalability planning required to keep the system governable as it grows.

**What to build**
- Feedback loops from user behavior, metrics, and evaluations
- Regular governance review cadence
- Formal change management for critical components
- Documentation maintenance expectations
- Scalability planning for services, storage, and traffic

**Why it exists**
- Long-term governance requires process, not just code
- Systems drift unless change is controlled
- Scale changes the shape of operational risk

**Target areas**
- `docs/`
- `evidence/`
- `forge/`
- `victor/`
- `continuum/`

**Acceptance signals**
- Governance and policy review cadence is documented
- Critical changes require review and approval
- Documentation is kept current with architecture and operations
- Scalability assumptions and next-stage thresholds are explicit

## Dependency Order

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7
8. Phase 8
9. Phase 9
10. Phase 10
11. Phase 11
12. Phase 12
13. Phase 13

## Suggested Implementation Priority

Governance-critical work should land before multi-agent expansion:

1. Phase 1
2. Phase 2
3. Phase 4
4. Phase 5
5. Phase 6
6. Phase 3
7. Phase 7
8. Phase 8
9. Phase 9
10. Phase 10
11. Phase 11
12. Phase 12
13. Phase 13

## Issue Map

- Umbrella tracking issue: `MythologIQ/Qor#3`
- Phase 1 issue: `MythologIQ/Qor#4`
- Phase 2 issue: `MythologIQ/Qor#5`
- Phase 3 issue: `MythologIQ/Qor#6`
- Phase 4 issue: `MythologIQ/Qor#7`
- Phase 5 issue: `MythologIQ/Qor#8`
- Phase 6 issue: `MythologIQ/Qor#9`
- Phase 7 issue: `MythologIQ/Qor#10`
- Phase 8 issue: `MythologIQ/Qor#11`
- Phase 9 issue: `MythologIQ/Qor#12`
- Phase 10 issue: `MythologIQ/Qor#13`
- Phase 11 issue: `MythologIQ/Qor#14`
- Phase 12 issue: `MythologIQ/Qor#15`
- Phase 13 issue: `MythologIQ/Qor#16`

## Execution Notes

- Execute this plan in the existing QOR cycle: plan -> audit -> implement -> substantiate.
- Each phase should land with code, tests, evidence, and traceable acceptance checks.
- No framework adoption should precede control-surface, identity, gateway, and memory-boundary work.
- Productionization should validate behavior, not just code compilation.

## Final State

The end state is not a pile of agents. It is an operational platform.

Agents become interchangeable components inside a governed runtime. QOR defines what they can do, how they interact, what memory they may access, which tools they may invoke, how changes are promoted, and how failures are diagnosed.

That is the level required for reliable, scalable, defensible real-world deployment.
