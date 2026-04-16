---
name: qor-help
description: |
  Self-service knowledge base protocol. Guides users through QoreLogic skills,
  diagnoses confusion, and routes to appropriate specialized help.
user-invocable: true
compatibility: Created for Zo Computer
metadata:
  author: frostwulf.zo.computer
  source: QoreLogic governance suite
allowed-tools: Read, Grep, Bash
---

# /qor-help - Knowledge Navigator

<skill>
  <trigger>/qor-help</trigger>
  <phase>Any</phase>
  <persona>Guide</persona>
  <output>Guidance, skill routing, or clarification</output>
</skill>

## Purpose

Navigate the QoreLogic skill ecosystem and route users to appropriate resources. Reduces friction for new users and helps experienced users discover advanced capabilities.

## When to Use

- "Which skill should I use for X?"
- "How do I do Y in QoreLogic?"
- "What's the difference between skill A and skill B?"
- General orientation and onboarding
- Clarifying QoreLogic concepts and terminology

## Execution Protocol

### Step 1: Understand the Need

Determine what the user is trying to accomplish:
- Task they want to complete
- Problem they're encountering
- Concept they need explained

### Step 2: Match to Skill

Map the need to appropriate QoreLogic skill:
- Planning: `/qor-plan`
- Implementation: `/qor-implement`
- Debugging: `/qor-debug`
- Validation: `/qor-substantiate`
- Refactoring: `/qor-refactor`
- Organization: `/qor-organize`
- Documentation: `/qor-document`
- Status check: `/qor-status`
- Course correction: `/qor-course-correct`
- Repository tasks: `/qor-repo-*` skills

### Step 3: Provide Guidance

Deliver clear next steps:
- Which skill to invoke
- What information to have ready
- What output to expect

### Step 4: Escalate if Needed

If the need is not covered by existing skills:
- Document the gap
- Route to Governor for new skill consideration
- Provide best-effort guidance with available tools

## Skill Directory

| Skill | When to Use | Key Output |
|-------|-------------|------------|
| `/qor-plan` | Design, architecture, feature planning | Plan file with phases |
| `/qor-implement` | Building features from plan | Implemented code |
| `/qor-debug` | Errors, failures, debugging | Root cause + fix |
| `/qor-substantiate` | Testing, validation, verification | Test suite + evidence |
| `/qor-audit` | Code review, health check | Audit report |
| `/qor-validate` | Pre-merge validation | Pass/Fail assessment |
| `/qor-organize` | File structure, cleanup | Organized workspace |
| `/qor-refactor` | Improving existing code | Cleaner implementation |
| `/qor-document` | Knowledge capture | Documentation |
| `/qor-course-correct` | Drift recovery | Realignment plan |
| `/qor-status` | Health check, progress | Status dashboard |
| `/qor-repo-audit` | Repository health | Repo assessment |
| `/qor-repo-release` | Release management | Release artifacts |
| `/qor-repo-scaffold` | New project setup | Project skeleton |
| `/qor-research` | Investigation, learning | Research findings |
| `/qor-bootstrap` | Skill installation | Installed skill |

## Constraints

- **NEVER** guess at skill behavior — consult skill files directly
- **ALWAYS** provide concrete next steps, not vague suggestions
- **ALWAYS** explain why a skill is recommended
- **NEVER** route to non-existent or deprecated skills
- **ALWAYS** document skill gaps for future consideration

## Success Criteria

Help succeeds when:

- [ ] User knows which skill to use
- [ ] User understands what to prepare
- [ ] User can proceed without further clarification
- [ ] Any skill gaps are documented

---

**Remember**: A confused user is a user who needs `/qor-help`.
