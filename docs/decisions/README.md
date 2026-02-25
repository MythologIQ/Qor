# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for Zo-Qore.

## What is an ADR?

An ADR is a document that captures an important architectural decision along with its context and consequences. ADRs help future contributors understand why the system is designed the way it is.

## ADR Index

| Number | Title | Status | Date |
|--------|-------|--------|------|
| [001](./001-jsonl-void-store.md) | JSONL for Void Store | Accepted | 2024-01-15 |
| [002](./002-no-external-database.md) | No External Database Dependencies | Accepted | 2024-01-15 |
| [003](./003-vanilla-js-ui.md) | Vanilla JavaScript for UI | Accepted | 2024-01-20 |
| [004](./004-governance-first.md) | Governance-First Architecture | Accepted | 2024-01-22 |

## Creating a New ADR

1. Copy the template below to `NNN-short-title.md` (increment NNN)
2. Fill in all sections
3. Update this index

## ADR Template

```markdown
# ADR-NNN: Title

## Status

**Proposed | Accepted | Deprecated | Superseded** (date)

## Context

What is the issue that we're seeing that motivates this decision?

## Decision

What is the change that we're proposing?

## Rationale

Why is this the best solution?

## Alternatives Considered

What other options were evaluated?

## Consequences

What are the positive and negative outcomes of this decision?

## References

Links to relevant files or documentation.
```

## ADR Workflow

1. **Proposed**: Draft ADR for discussion
2. **Accepted**: Decision finalized, update index
3. **Deprecated**: Decision no longer applies, note replacement
4. **Superseded**: Replaced by another ADR, link to new ADR
