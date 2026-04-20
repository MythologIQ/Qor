# HexaWars Arena — Long-Term Vision (Reference)

**Source**: Operator-provided document "Refined Dark Factory Arena Product & Project Plan" (uploaded 2026-04-18).
**Status**: REFERENCE ONLY. **Current execution (Plan A v2 → Plan B) is intentionally narrower in scope.** Do not pivot live work to match this document without explicit operator direction.

This artifact is the North Star — it captures the full platform vision (3-game arena, spectator UX, BYOA, autonomous SDLC). Current Plan A v2 delivers the identity + persistence substrate for HexaWars only; Plan B will add matchmaker/runner/rank/UI feed for HexaWars only. The other games (Bid Brawl, Synth Raid), governance UI layers, and 3D-printing lattice layers (L0-L10) are **explicitly out of current scope**.

---

## Executive Summary (verbatim)

This document presents a refined product requirements and project plan for a governed AI-Arena platform built using dark-factory principles. It merges a competitive arena, spectator-centric games, and an end-to-end autonomous development pipeline. To ensure disciplined and auditable development, the team will follow a structured governance framework inspired by industry best practices (e.g. the S.H.I.E.L.D.-style cycle of research, plan, audit, implement, substantiate and validate) that anchors every decision in cryptographically verifiable logs. By adopting these internal practices — such as single-purpose tasks, advisory gates and process-failure logging — the platform becomes auditable, extensible and self-correcting. The document outlines purpose, functional and non-functional requirements, architecture, user stories, development phases, Kanban and Gantt schedules, and next steps.

## Problem Statement

AI builders lack a realistic, governed environment to test autonomous agents under pressure. Existing evaluation frameworks focus on benchmarks or isolated tasks and offer little transparency into agent behaviour. Meanwhile, teams exploring autonomous pipelines need a reference implementation — a dark factory that can translate clear intent into working features, while capturing evidence and governance decisions. Building such a system manually is slow and costly; adopting a structured governance model can accelerate development and ensure trust. The goal is to deliver a Bring-Your-Own-Agent (BYOA) arena with spectator appeal and to run it through an automated, evidence-driven SDLC.

## Goals & Objectives

### Product Goals

- **Competitive Arena & Games**: Deliver a core arena that hosts matches between agents. Launch with three games — **HexaWars, Bid Brawl, and Synth Raid** — chosen for their ability to expose strategic, deceptive and collaborative behaviours.
- **Spectator Experience**: Provide a web interface that shows real-time state, event logs, agent reasoning snippets and post-match analytics. Ensure matches are digestible and engaging for viewers.
- **BYOA Integration**: Support external agent connections via WebSocket/REST using a strict Agent Action Contract (action, confidence, metadata). Enforce timeouts and token budgets.

### Development & Process Goals

- **Structured Methodology**: Adopt a phased development cycle — research, plan, audit, implement, substantiate and validate — to manage work. Each task should be single-purpose, clear and idempotent.
- **Traceability**: Record every plan, audit, implementation and release decision in cryptographically verifiable logs to guarantee traceability.
- **Failure Logging & Remediation**: Maintain an internal process log for failures and deviations. When severity thresholds are breached, trigger remediation actions and document the outcome.
- **Advisory Gates & Reviews**: Implement gates between phases; missing or invalid artifacts trigger warnings and require review. Overrides are allowed but must be documented.

### User Objectives

- **AI Builders**: Easily submit agents, observe performance across different games, and receive detailed metrics (decision times, move distributions, win/loss, invalid actions) to iterate on their models.
- **Researchers**: Access reproducible environments with clear contracts, fairness certification and replayability to study multi-agent systems.
- **Spectators**: Enjoy an entertaining, narrative-driven experience with clear visual cues, commentary and a consistent rule set.
- **Stakeholders**: Define high-level intent, monitor process logs and approve merges; spend time on strategy rather than manual code reviews.

## Scope & Assumptions

- **Scope**: Arena core, three game modules, a BYOA interface, spectator UI, and a structured development pipeline with governance logs. Future features (social networks, monetization, additional games) are out of scope.
- **Non-Goals**: Agent marketplaces, monetization schemes, automation of business-strategy decisions (humans remain responsible for intent).
- **Assumptions**: agents adhere to the Agent Action Contract with enforced time/token budgets; specs are unambiguous and testable; platform runs on containerized cloud infra; suitable governance frameworks are available.

## Development Process Guidance (internal)

- **Phased Lifecycle**: research → planning → audit → implementation → substantiation → validation.
- **Delegated Tasks**: single-purpose, may delegate follow-ups to next phase.
- **Gates & Reviews**: gates read/write artifacts; missing/invalid → warning + review.
- **Traceable Decisions**: hashed ledgers with evidence.
- **Failure Logging & Remediation**: severity-gated remediation actions.
- **Checkpoints & Bundles**: multi-phase initiatives split into checkpoints.
- **Resource Budgets**: token/compute quotas for reproducibility and fairness.

## Product Requirements (Functional)

### Arena Core

- Matchmaking (1v1 and team 2-3 per team)
- Game Engine (generic state-machine runner, rules, timeouts, scoring)
- Agent Gateway (WebSocket/HTTP, action validation, time/token budgets)
- Event Bus & Metrics (decision times, invalid actions, win/loss)
- Spectator Interface (board, bids, courses, reasoning snippets, scores, replay, fairness cues)

### Game Modules

- **HexaWars**: turn-based territory on hex grid, fog of war, map shrink, resource capture. Fairness tests for symmetric visibility and deterministic combat.
- **Bid Brawl**: multi-round auction, hidden info, alliance signaling, bluffing, structured communication.
- **Synth Raid**: cooperative obstacle course, 2-3 agents share partial knowledge, limited communication tokens, structured message schema, fairness + determinism tests.

## Non-Functional Requirements

- **Performance**: avg latency <200ms, matches within turn budgets.
- **Scalability**: dozens of concurrent matches via horizontal scaling.
- **Reliability**: graceful agent-crash recovery, deterministic termination.
- **Security**: containerization, input validation, cryptographic logs.
- **Accessibility**: responsive UI, dark/light, keyboard/screen-reader support.
- **Extensibility**: standardized module + harness interfaces.
- **Evidence & Auditability**: every change verifiable, hash-chain integrity.

## User Stories (verbatim)

1. **AI builder** — submit agent to HexaWars, WebSocket state updates, score + metrics, reasoning snippets.
2. **Evaluator** — post-match summary with metrics, offline data export, process-log entry.
3. **Spectator** — watch Bid Brawl with animated bids, commentary on alliances/bluffs, reveal points.
4. **Product owner** — spec "add fog-revealing power-ups to HexaWars" → pipeline ingests → plan → audit → impl → substantiate → approve.
5. **Governance engineer** — run process review cycles; severity thresholds trigger remediation + top-issues list.

## High-Level Architecture — Layered 3D-Printing Metaphor

| Layer | Name | Focus |
|------:|------|-------|
| L0 | Print Bed Calibration | Repo conventions, CI/CD, gates, logging |
| L1 | Intent Foundation | Business intents → testable specs |
| L2 | Structural Shell | Service boundaries, contracts |
| L3 | Governance Lattice | Gates between SDLC phases, severity thresholds |
| L4 | Contract Skeleton | Agent Action Contract, match lifecycle, event schemas, harnesses |
| L5 | Test Mold | Acceptance, integration, fairness, determinism, performance |
| L6 | Core Runtime Fill | State mgmt, validation, timeouts, events, persistence, metrics |
| L7 | Game Shells | HexaWars, Bid Brawl, Synth Raid on top of runtime |
| L8 | Spectator Skin | Web UI, event logs, reasoning panels, replay, commentary |
| L9 | Development Pipeline | Full SDLC operation with logs + evidence |
| L10 | Production Substantiation | Release seals, fairness certificates, rollback plans |

## Components & Services

- **Presentation**: React/TS + Tailwind + WebSockets; accessible themes.
- **Arena Services**: Node/TS or Python microservices; gRPC/GraphQL internal; PostgreSQL + Redis.
- **Orchestration & Governance**: internal pipeline orchestrates tasks; LangGraph/AutoGen candidates for LLM state; scripts for hashing/gating/logging.
- **Containerization**: Docker for agent + code-gen isolation; restricted net/fs; CPU/RAM caps.
- **Storage**: PostgreSQL metadata, S3/MinIO logs+artifacts, JSONL process logs.

## Data Flow

- **Match execution**: agents ↔ WebSocket/HTTP Gateway → game engine → events to UI + metrics.
- **Development pipeline**: feature request → intake → plan → audit → impl → substantiate → validate → merge; each step leaves a traceable record.
- **Process logging**: deviations captured; severity breach → structured remediation.

## Implementation & Simulation Phases (abbrev)

1. Print Bed (codebase + CI + artifact templates + logging)
2. Intent Foundation (author intents with acceptance tests)
3. Architecture Shell (freeze contracts)
4. Governance & Lattice (gates + logging + thresholds)
5. Tests (acceptance + fairness + determinism)
6. Core Runtime (headless engine, gateway, events, metrics; stub-agent validation)
7. Game Modules (HexaWars → Bid Brawl → Synth Raid, harness-enforced fairness)
8. UI (spectator + dashboards + reasoning + fairness indicators)
9. Automated SDLC (tie pipeline end-to-end with traceability)
10. Release & Review (evidence-based stakeholder approval, post-launch drift monitoring)

## Conclusion (verbatim)

By embracing a structured, phased development methodology and adopting practices like clear gatekeeping, traceable decision logs and rigorous testing, the arena platform can evolve from a promising idea into a provably trustworthy system. Next steps include creating harness templates, hardening the testing and audit phases, and running prototype pipelines to refine the process. Once launched, continue iterating based on match analytics, process logs and user feedback. Ultimately, this approach will establish the arena as a benchmark laboratory for agent behaviour and an exemplar of autonomous yet accountable software delivery.

---

## Current-Scope Alignment Map (as of 2026-04-18)

| Vision Element | Mapped To (Current Arena) | Status |
|----------------|---------------------------|--------|
| HexaWars game engine | `src/engine/*` | Scope-1 complete |
| Agent Gateway | `src/gateway/*` | Scope-1 complete |
| Spectator UI shell | `src/public/arena.html` + `arena.js` | Scope-1 complete; reader path for seed match is Plan B |
| Operator identity + tokens | `src/identity/*` (Plan A v2 Phase 2) | **Sealed** |
| Match persistence + replay | `src/persistence/match-store.ts` (Plan A v2 Phase 3) | **Sealed** |
| Demo seed fixture | `src/persistence/seed.ts` (Plan A v2 Phase 3.5) | **Sealed** |
| Matchmaker / runner / rank | — | **Plan B (unlocked, not started)** |
| Bid Brawl | — | Out of current scope |
| Synth Raid | — | Out of current scope |
| Governance lattice L3 | Qor skills + META_LEDGER | Active (governance applied as method, not embedded product) |
| Contract skeleton L4 | `docs/AGENT_CONTRACT.md` | Frozen |
| Production substantiation L10 | Qor substantiate + META_LEDGER seals | Active |

**Working posture**: preserve this vision for multi-quarter reference; do not expand current scope to pursue it without explicit operator direction.
