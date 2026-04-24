# Plan: HexaWars Spectator Producer Remediation

> Remediation plan for the 2026-04-24 VETO on `2026-04-23-hexawars-plan-e2-projection-producer-cutover.md`. This slice keeps the agent protocol stable, creates a separate spectator transport path, explicitly mounts every targeted runtime surface, and returns the live router to a bounded wiring-only role.

## Open Questions

- None. The transport-boundary decision is locked to a separate spectator path.

## Decision Lock-Ins

- `src/gateway/contract.ts` remains the **agent** wire contract. It is not repurposed for spectator frames.
- Spectator transport gets its own contract family and producer path. No mixed agent/spectator frame union is introduced.
- Every file named in this plan must be on a live build path by the end of the same slice. No new pure substrate is allowed to remain unmounted.
- `src/routes/matches.ts` becomes the authoritative public match read route module and is explicitly mounted from `src/router.ts`.
- `src/router.ts` must shrink in the same slice. This plan is not allowed to leave router reduction for a later phase.
- Demo replay must emit the same spectator frame family as the live spectator producer.

## Phase 1: Spectator Contract and Live Mount

### Affected Files

- `src/shared/public-match.ts` - add `PublicMatchFrame` spectator DTOs only
- `src/projection/public-match.ts` - add narrow projector adapters required by spectator transport
- `src/gateway/spectator-ws.ts` - new spectator-only WebSocket producer and upgrade handler
- `src/gateway/ws.ts` - no semantic spectator duties remain; keep agent-auth/session concerns only if still referenced
- `src/static-routes.ts` - no change unless small route helper extraction is needed for mount clarity
- `src/server.ts` - mount the spectator WebSocket entrypoint from the live server chain
- `tests/gateway/spectator-ws.test.ts` - new mounted spectator transport tests
- `tests/projection/public-match.test.ts` - projector adapter coverage for live spectator inputs

### Changes

Create a new spectator-only transport module:

- `src/gateway/spectator-ws.ts`

This module owns:

- the spectator upgrade entrypoint
- live frame emission for browser spectators
- translation from runtime/persistence state into `PublicMatchFrame`

`src/shared/public-match.ts` adds the spectator frame family:

```ts
export interface PublicMatchFrame {
  type: "MATCH_HELLO" | "MATCH_STATE" | "MATCH_EVENT" | "MATCH_END";
  projection: PublicMatchProjection;
}
```

Rules:

- `PublicMatchFrame` lives with the public projection DTOs, not in the agent gateway contract.
- `src/gateway/contract.ts` remains unchanged as the agent protocol surface.
- If shared low-level helpers are needed, they must be value-only helpers, not mixed transport unions.

`src/projection/public-match.ts` may gain small pure adapters for current live runtime inputs, but it remains the single place where public truth is derived.

`src/server.ts` must explicitly mount the spectator endpoint in the live chain. This plan must name and implement the concrete route path used by the browser client. The result must be:

- `server.ts` imports spectator mount/handler
- the handler is reachable from the running app
- the browser client no longer points at an unmounted path

No new spectator work may be placed into `src/gateway/ws.ts` unless it is truly shared agent-only plumbing. The separation is structural, not just naming.

### Unit Tests

- `tests/gateway/spectator-ws.test.ts` - mounted spectator entrypoint returns projected `MATCH_*` frames and never emits raw `visible`, `units`, `score`, `deadline`, or `budget`
- `tests/gateway/spectator-ws.test.ts` - hello, state, event, and end all use the same `PublicMatchFrame` family
- `tests/projection/public-match.test.ts` - live spectator adapter inputs yield stable `PublicMatchProjection` output for identical runtime state

## Phase 2: Public Route Cutover and Router Reduction

### Affected Files

- `src/routes/matches.ts` - become the mounted public match read module
- `src/routes/leaderboard.ts` - new mounted public leaderboard route module
- `src/persistence/match-store.ts` - add projection-ready read helpers only
- `src/rank/leaderboard.ts` - return leaderboard data plus replay-card inputs through public builders
- `src/projection/public-summary.ts` - authoritative summary and replay-card builders
- `src/router.ts` - shrink to status/identity/tournament wiring plus explicit route mounts
- `tests/router/matches-routes.test.ts` - update to mounted public route shapes
- `tests/router/leaderboard.test.ts` - mounted leaderboard replay-card output tests
- `tests/persistence/match-store.test.ts` - read-helper coverage

### Changes

Mount `src/routes/matches.ts` from `src/router.ts` and move the current inline public match read logic out of the router.

`src/routes/matches.ts` becomes the only public match read surface for:

- `/api/arena/matches`
- `/api/arena/matches/:id`
- `/api/arena/matches/:id/events`
- `/api/arena/matches/:id/stream`
- `/api/arena/operators/:handle/matches`

`src/routes/leaderboard.ts` becomes the mounted surface for:

- `/api/arena/leaderboard`

`src/persistence/match-store.ts` may add only the minimal read helpers needed to build:

- `PublicMatchSummary`
- `PublicReplayCard`
- projection-backed detail responses

Formatting stays out of storage.

`src/rank/leaderboard.ts` must stop being the final public HTTP shape when replay emphasis is needed. It should return rank-oriented data that the route module finishes through `buildPublicReplayCard()`.

`src/router.ts` must shrink below the 250-line ceiling in this phase. The allowed end-state is:

- route mounting
- identity routes
- status/metrics routes
- tournament routes if still present

The router must not retain duplicated public match or leaderboard formatting logic after this phase.

### Unit Tests

- `tests/router/matches-routes.test.ts` - public match routes remain mounted and return projection-backed/public-summary shapes through the route module
- `tests/router/matches-routes.test.ts` - missing matches still return `404`
- `tests/router/leaderboard.test.ts` - leaderboard route returns rank entries plus replay-card data through the mounted leaderboard module
- `tests/persistence/match-store.test.ts` - new read helpers expose only the data required by summary/projector builders

## Phase 3: Demo Parity and Browser Consumer Alignment

### Affected Files

- `src/public/demo-replay.js` - emit spectator `MATCH_*` frames with `projection`
- `src/public/ws-client.js` - consume the mounted spectator path and new frame family
- `src/public/arena.js` - accept projected spectator payloads from both live and demo producers
- `tests/public/demo-replay.test.ts` - parity tests
- `tests/public/ws-client.test.ts` - mounted path + frame dispatch tests

### Changes

`src/public/demo-replay.js` must stop emitting bespoke `{ type, state, event }` payloads. It must emit the same spectator transport family as the live producer:

- same `MATCH_*` frame names
- same `projection` payload location
- same outcome placement

`src/public/ws-client.js` must:

- point at the mounted spectator path from Phase 1
- dispatch `MATCH_HELLO`, `MATCH_STATE`, `MATCH_EVENT`, and `MATCH_END`
- remain a thin transport client, not a browser-side truth builder

`src/public/arena.js` only adapts to the new projected payload shape. This phase does not introduce new browser-side derivation logic.

### Unit Tests

- `tests/public/demo-replay.test.ts` - demo emits the same spectator frame family and payload nesting as live transport
- `tests/public/demo-replay.test.ts` - final demo frame includes projected outcome in the same location as live end frames
- `tests/public/ws-client.test.ts` - client connects to the mounted spectator path and dispatches all four `MATCH_*` frame types correctly

## Razor Lock

- `src/gateway/contract.ts` is not edited for spectator transport.
- `src/router.ts` must end this plan under 250 lines.
- No new unmounted route or transport module may be introduced.
- No browser-side public-truth derivation is added in this remediation slice.

## Builder Queue Refresh

- Phase 1 task slice: spectator contract split + mounted spectator producer + tests
- Phase 2 task slice: mounted public route modules + router reduction + tests
- Phase 3 task slice: demo parity + browser transport alignment + tests
