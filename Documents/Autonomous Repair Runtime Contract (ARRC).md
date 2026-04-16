Autonomous Repair Runtime Contract (ARRC)
Purpose

Define the mandatory rules that guarantee:

termination

safety

determinism

tractable search

zero collateral damage

All automated or AI-driven repair must execute inside this contract.

These are not guidelines.
They are mechanically enforced invariants.

1. System Model

All repair operates over:

S = state
A = actions (candidate patches)
T = transition(S, a) → S'
I = invariant predicate (healthy state)
C = cost function (tokens, time, attempts)

Failure:
F(S) ⇔ not I(S)

Objective:
Find minimal a such that T(S, a) ∈ I with minimal cost.

Repair is constrained search, not generation.

2. Required Repair Order

The runtime MUST execute in this order:

Freeze

Reproduce

Reduce

Search

Validate

Commit or Rollback

Reordering is disallowed.

3. Validation Requirements (Proof of Correctness)

A repair MAY commit only if all checks pass.

3.1 Deterministic Replay (mandatory)

Before fix:
replay(S_fail) must reproduce failure

After fix:
replay(S_fixed) must succeed

If either fails:
abort

3.2 Invariant Checks (mandatory)

All defined invariants must hold:

Examples:

tests pass

contracts satisfied

no runtime errors

static checks clean

I(S_fixed) must return true

3.3 Regression Guard (mandatory)

Unrelated behavior must remain unchanged.

At least one:

full test suite

canary execution

diff/hash stability

metric thresholds

If regression detected:
abort

4. Enforcement Rules (Mechanical Constraints)

These rules MUST be enforced structurally by the runtime.

They must not rely on user or agent discipline.

Rule 1. Snapshot-Only Mutation

All repair actions occur on a sandbox copy.

Direct mutation of live state is forbidden.

Required API shape:

S' = snapshot(S)
apply_patch(S')
commit(S')

No other mutation path is allowed.

Rule 2. Hard Budgets

All repair loops must have enforced limits:

max attempts

max tokens

max wall clock

On exhaustion:
automatic rollback + terminate

Never escalate scope automatically.

Rule 3. Determinism Gate

If failure is not reproducible:
repair MUST NOT start

Runtime must require:
replay(failure) == stable

Rule 4. State Reduction First

Repair must operate only on a minimized failing state S'.

Reduction is mandatory before diagnosis.

Allowed reduction operators:

ddmin (input)

HDD (structure)

bisect (time/history)

slicing (dependency)

path pruning (symbolic)

Diagnosis on full state is disallowed.

Rule 5. Evidence Requirement

Each candidate patch must be justified by evidence.

Required:

causal link to failure

affected region or dependency slice

expected invariant restoration

Speculative or random patches are rejected.

Rule 6. Minimal Deltas Only

Each repair attempt must modify the smallest possible surface area.

Runtime must reject:

large diffs

multi-module rewrites

compound fixes

Large changes must be decomposed.

Rule 7. Validate Before Commit

commit() must internally enforce:

if not replay_ok: reject
if not invariants_ok: reject
if not regression_ok: reject

Manual override is prohibited.

Rule 8. Automatic Rollback

All failures must revert state automatically.

Partial application is forbidden.

ACID semantics required.

5. Required Runtime Skeleton

Reference implementation:

function repair(S_fail):

    require reproducible(S_fail)

    checkpoint = snapshot(S_fail)

    S_min = reduce(S_fail)

    with Budget(tokens, time, attempts):

        for candidate in generate_candidates(S_min):

            S_trial = snapshot(S_min)

            apply(candidate, S_trial)

            if validate_all(S_trial):
                commit(candidate)
                return SUCCESS

    rollback(checkpoint)
    return FAILURE


Where validate_all includes:

deterministic replay

invariants

regression

6. Guarantees Provided

If this contract is enforced:

The system guarantees:

termination (bounded search)

safety (reversible operations)

determinism (replayable)

tractability (reduced state)

correctness (validated commit)

Without these guarantees, autonomous repair is undefined behavior.

7. Non-Goals

The system does not rely on:

intuition

creativity

heuristic guessing

unbounded iteration

Repair is search under constraints, not generation.

Final note

This is intentionally minimal and mechanical.

If a rule cannot be:

tested

automated

enforced

it does not belong here.