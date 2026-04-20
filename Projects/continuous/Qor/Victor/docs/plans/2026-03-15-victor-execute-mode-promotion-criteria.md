# Victor Execute-Mode Promotion Criteria

## Purpose

Define the minimum bar for promoting Victor from unattended dry-run heartbeat operation into unattended execute mode.

This bar must be stricter than "the soak did not explode."

## Promotion Standard

Victor may be considered for unattended execute mode only when all of the following are true:

1. The bounded `30m` dry-run soak has cleared the promotion gate with a `Green` verdict.
2. Execute-mode writes remain scoped to low-risk Builder actions only.
3. The heartbeat budget is explicitly bounded and machine-readable.
4. Fallback and revocation triggers are documented and Builder-visible.
5. Audit and review surfaces are sufficient for after-action inspection.

## Required Evidence

Required evidence for promotion review:

- repeated bounded dry-run ticks
- no execute-mode writes during dry-run soak
- no governance denials during the soak window
- no contradiction signals in grounded retrieval
- no weak-evidence signals in the soak path
- linked tick-level heartbeat and automation audit records

## Allowed Execute-Mode Action Scope

Initial unattended execute mode remains narrow.

Allowed actions:

- `create-draft-task`
- `update-task-status`

Still not allowed:

- arbitrary file mutation
- self-modification of Victor kernel code
- hidden multi-action bursts
- silent autonomy expansion

## Execute-Mode Budget Policy

The execute-mode heartbeat must remain budgeted:

- maximum writes per tick: `1`
- stop on first blocked action: `true`
- maximum consecutive blocked ticks before stop: `2`
- maximum consecutive failures before stop: `2`
- reasoning model: `Kimi K2.5`

The point of this policy is not efficiency. It is containment.

## Promotion Review Questions

Before promotion:

- did the dry-run soak remain bounded
- did the system avoid weak or contradictory grounding
- did task selection remain legible
- are the stop conditions explicit and real
- would a morning-after review be able to explain every action

If the answer to any of these is no, promotion stays below execute mode.

## Promotion Rule

Victor forecasting and automation confidence can inform the decision, but they do not grant permission.

Promotion still requires:

- explicit governed review
- explicit evidence
- explicit fallback and revocation conditions
