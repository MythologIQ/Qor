---
name: vercel-composition-patterns
description: Apply Vercel composition patterns for scalable React component architecture. Use when designing reusable Victor and Builder view shells, shared layout systems, context boundaries, or component APIs that should avoid boolean-prop sprawl.
compatibility: Created for Zo Computer
metadata:
  author: frostwulf.zo.computer
  source: vercel-labs/agent-skills
---

# Vercel Composition Patterns

Use this skill when structuring the new UI shell so Victor and Builder stay separate but easily swappable.

Read `references/full-guide.md` when the task is about component architecture, reusable layouts, providers, or reducing prop/variant sprawl.

## Priority Focus

1. Explicit view variants instead of boolean mode props
2. Compound or provider-backed components for shared shell state
3. Clear separation between Victor-only and Builder-only concerns
4. Reusable layout primitives that do not hide data ownership

## When To Use

- Designing the new Victor | Builder switchable shell
- Splitting shared shell structure from view-specific panels
- Refactoring components that have accumulated too many toggles or modes
- Building scalable UI modules for later expansion

## Notes

- Prefer explicit components over a single mega-component with flags
- Keep data ownership obvious; shared shell state should not blur project boundaries
