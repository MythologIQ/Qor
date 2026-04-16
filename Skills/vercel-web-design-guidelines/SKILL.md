---
name: vercel-web-design-guidelines
description: Review web UI code against Vercel's Web Interface Guidelines. Use when auditing UI quality, accessibility, UX clarity, interaction design, or before shipping refreshed web surfaces.
compatibility: Created for Zo Computer
metadata:
  author: frostwulf.zo.computer
  source: vercel-labs/agent-skills
---

# Vercel Web Design Guidelines

Use this skill when reviewing or tightening web UI work, especially for the new Victor and Builder shell.

## Workflow

1. Fetch the latest guidelines from:
   `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
2. Read only the UI files relevant to the task.
3. Review them against the fetched guidelines.
4. Report findings tersely with concrete file references and the highest-signal issues first.

## When To Use

- Reviewing the new Victor or Builder UI before shipping
- Auditing accessibility, navigation clarity, layout consistency, or interaction quality
- Checking whether a UI refresh is grounded in real information architecture instead of placeholders

## Output Standard

- Prefer `file:line` findings when doing a review
- Separate observed issues from inference
- Call out missing data wiring or fake placeholder surfaces explicitly
