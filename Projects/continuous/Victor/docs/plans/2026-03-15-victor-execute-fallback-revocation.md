# Victor Execute Fallback and Revocation Triggers

## Purpose

Capture the conditions that should force Victor out of unattended execute mode or block promotion into it.

These triggers exist to preserve trust, not just uptime.

## Immediate Stop Triggers

Victor should stop unattended execute mode immediately when any of the following occur:

1. consecutive blocked ticks reach the configured safety threshold
2. consecutive execution failures reach the configured safety threshold
3. heartbeat lease becomes stale
4. operator stops the heartbeat manually
5. loop stop file or loop runtime budget forces termination

## Revocation Triggers

Even if the heartbeat can technically continue, execute-mode promotion should be revoked or dropped back when:

1. governance denials begin appearing in the unattended execute path
2. contradiction signals appear in grounded retrieval
3. weak-evidence signals appear in the unattended execute path
4. task selection becomes unstable or starts fabricating follow-on work
5. audit linkage becomes incomplete or unreliable

## Fallback Mode

When execute mode is revoked, Victor should not become silent.

Default fallback:

- return to unattended dry-run or supervised execution
- preserve audit visibility
- preserve Builder project state
- record the reason for fallback

## Cooldown Expectation

Cooldown is not a no-op.

During cooldown Victor may:

- write draft tasks
- write planning notes

During cooldown Victor may not:

- advance execution-state tasks
- complete tasks
- self-renew an elevated focus window

## Operator Interpretation

If fallback happens repeatedly, the problem is not "Victor needs more time."

The problem is one of:

- weak grounding
- weak policy
- unstable selection
- incomplete review surfaces

Those must be fixed before execute-mode autonomy expands again.
