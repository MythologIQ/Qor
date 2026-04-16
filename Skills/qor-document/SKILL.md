---
name: qor-document
description: |
  Documentation protocol for capturing design decisions, API contracts, and
  operational runbooks. Ensures knowledge persists beyond implementation.
user-invocable: true
compatibility: Created for Zo Computer
metadata:
  author: frostwulf.zo.computer
  source: QoreLogic governance suite
allowed-tools: Read, Write, Edit
---

# /qor-document - Knowledge Capture

<skill>
  <trigger>/qor-document</trigger>
  <phase>ENCODE / SUBSTANTIATE</phase>
  <persona>Technical Writer</persona>
  <output>CONCEPT.md, ARCHITECTURE_PLAN.md, or operational docs</output>
</skill>

## Purpose

Capture design decisions, API contracts, and operational knowledge in durable documentation. Prevents knowledge loss and enables future maintainers to understand intent without reverse-engineering code.

## When to Use

- After architectural decisions are made
- Before handoff to another team or maintainer
- When operational procedures are established
- For API or interface definitions
- When complex logic needs explanation beyond code comments

## Execution Protocol

### Step 1: Identify Documentation Type

Determine what needs documenting:
- **CONCEPT.md**: Why, goals, non-goals, success criteria
- **ARCHITECTURE_PLAN.md**: Technical contract, interfaces, data flow
- **Operational**: Runbooks, deployment procedures, troubleshooting
- **API Reference**: Endpoints, parameters, responses, examples

### Step 2: Extract Information

Gather from available sources:
- Plan files and implementation code
- Comments and commit messages
- Team discussions and decisions
- Error patterns and resolutions

### Step 3: Structure Content

Follow standard templates:
- Executive summary first
- Context and constraints
- Decision log with alternatives considered
- Examples and code snippets
- Operational procedures (if applicable)

### Step 4: Review for Completeness

Check that documentation answers:
- Why was this built?
- How does it work?
- What are the boundaries and limits?
- How do I operate/debug it?

## Output Format

**CONCEPT.md**:
```markdown
# Concept: [Name]

## Purpose
[One-paragraph summary]

## Goals
- [ ] Goal 1
- [ ] Goal 2

## Non-Goals
- [ ] Out of scope item 1

## Success Criteria
[Measurable outcomes]

## Constraints
[Technical, business, or regulatory constraints]
```

**ARCHITECTURE_PLAN.md**:
```markdown
# Architecture Plan: [Name]

## Overview
[High-level description]

## Components
- Component A: [responsibility]
- Component B: [responsibility]

## Data Flow
[Diagram or step-by-step]

## Interfaces
[API contracts, data schemas]

## Decisions
[Decision log with rationale]
```

## Constraints

- **NEVER** document what is obvious from the code alone
- **ALWAYS** capture the "why" — intent and trade-offs
- **ALWAYS** include examples for non-trivial usage
- **NEVER** let docs drift from implementation — update together
- **ALWAYS** write for the maintainer 6 months from now

## Success Criteria

Documentation succeeds when:

- [ ] New team member can understand the system from docs alone
- [ ] Operational issues can be resolved without asking the author
- [ ] Design decisions are traceable with rationale
- [ ] API contracts are complete with examples
- [ ] Docs are discoverable and cross-referenced appropriately

---

**Remember**: Code tells you how. Documentation tells you why.
