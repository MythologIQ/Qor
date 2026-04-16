---
name: vercel-react-best-practices
description: Apply Vercel React performance and architecture guidance when writing, reviewing, or refactoring React-based UI in Zo-Qore. Use for new interfaces, React component cleanup, hydration concerns, render performance, and bundle discipline.
compatibility: Created for Zo Computer
metadata:
  author: frostwulf.zo.computer
  source: vercel-labs/agent-skills
---

# Vercel React Best Practices

Use this skill for React-driven Builder or Victor surfaces, especially while building the new UI shell.

Read `references/full-guide.md` when you need the detailed rules. Do not load it by default unless the task is actually in React UI code.

## Priority Focus

For Zo-Qore UI work, prioritize these areas first:

1. Async flow and waterfall elimination
2. Bundle size and lazy loading
3. Re-render and transition discipline
4. Hydration-safe rendering patterns
5. Data-fetching structure for real project state

## When To Use

- Building new React components or pages
- Refactoring the current shell into Victor and Builder views
- Fixing stale or misleading UI state caused by poor fetch/render boundaries
- Reviewing performance issues before exposing the new UI broadly

## Notes

- Prefer the smallest set of rules that materially improves the current code
- Do not optimize speculative paths before real data binding is correct
