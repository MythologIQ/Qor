# Plan: HexaWars Projection Producer Cutover

## Open Questions

- None. This plan is the locked next slice after choosing projection producer cutover as the immediate bottleneck.

## Phase 1: Spectator Transport Cutover

### Affected Files

- `src/gateway/contract.ts` - replace raw spectator frame typings with public projection transport typings
- `src/gateway/ws.ts` - build and emit `PublicMatchFrame` payloads from the projection layer instead of raw state fragments
- `src/projection/public-match.ts` - add narrow adapter helpers needed by gateway transport from runtime state/event inputs
- `src/shared/public-match.ts` - add `PublicMatchFrame` transport DTO if kept with public projection contracts
- `tests/gateway/ws.test.ts` - assert spectator transport emits projected frames only
- `tests/projection/public-match.test.ts` - cover any new gateway-facing projector adapters

### Changes

Cut live spectator transport over to the public projection family.

`src/gateway/contract.ts` must stop defining spectator output in terms of raw engine fields:

- remove `StateFrame.visible`
- remove `StateFrame.units`
- remove `StateFrame.score`
- remove `StateFrame.deadline`
- remove `StateFrame.budget` from the spectator contract

Replace the spectator output family with a projection-centered contract:

```ts
export interface PublicMatchFrame {
  type: "MATCH_HELLO" | "MATCH_STATE" | "MATCH_EVENT" | "MATCH_END";
  projection: PublicMatchProjection;
}
```

If the gateway still needs internal raw-frame helpers for agent channels, split them from spectator transport explicitly instead of complecting both concerns in one file.

`src/gateway/ws.ts` must:

- call the projector before sending any spectator frame
- emit one stable public frame family for hello, state, event, and end
- stop serializing raw match-state slices for browser completion
- keep authentication and upgrade logic unchanged

`src/projection/public-match.ts` may gain small pure adapters that map current runtime state/event inputs into `PublicProjectionInput`, but it must remain the single point where public truth is derived.

### Unit Tests

- `tests/gateway/ws.test.ts` - spectator frames contain `projection` and do not expose raw `visible`, `units`, `score`, `deadline`, or `budget`
- `tests/gateway/ws.test.ts` - hello, mid-match, event-driven, and end-of-match sends all use the same public frame family
- `tests/projection/public-match.test.ts` - gateway adapter inputs produce stable `PublicMatchProjection` output for identical runtime state

## Phase 2: Public Read Route Cutover

### Affected Files

- `src/persistence/match-store.ts` - add projection-ready read helpers for public match summaries and replay-card inputs
- `src/routes/matches.ts` - return public summaries/projections instead of raw records/events for public read surfaces
- `src/rank/leaderboard.ts` - return leaderboard entries plus replay-card data built from public summaries
- `src/router.ts` - mount the updated route behavior only; no new formatting logic in router
- `tests/router/matches.test.ts` - assert public match route shapes
- `tests/rank/leaderboard.test.ts` - assert leaderboard replay-card output path
- `tests/persistence/match-store.test.ts` - cover new projection-ready read helpers

### Changes

Cut the public HTTP read surfaces over to projection-owned DTOs.

`src/persistence/match-store.ts` stays storage-only, but it must expose the minimal read helpers required to build:

- `PublicMatchSummary`
- `PublicReplayCard`
- full `PublicMatchProjection` for replay/read endpoints where needed

Do not place formatting logic in `match-store.ts`; only add the shaped reads the summary builders need.

`src/routes/matches.ts` must stop returning raw `MatchRecord` and raw event arrays as the final public contract where a public match view is intended. Replace those responses with:

- summary/list output for match index routes
- projection-backed output for match detail routes
- if an event route remains, it should expose normalized public feed entries, not raw event-log payloads

`src/rank/leaderboard.ts` must stop ending at bare DB rows when the public consumer needs replay emphasis. Add an explicit return shape that combines:

- leaderboard rank fields
- replay-card fields built through `buildPublicReplayCard()`

`src/router.ts` remains wiring-only. If route-file pressure grows, move more logic into `src/routes/matches.ts` and `src/routes/*`, not into the router.

### Unit Tests

- `tests/router/matches.test.ts` - `/api/arena/matches` returns public summary rows instead of raw SQL aliases
- `tests/router/matches.test.ts` - `/api/arena/matches/:id` returns projection-backed public data, not raw `MatchRecord`
- `tests/router/matches.test.ts` - missing matches still return `404`
- `tests/rank/leaderboard.test.ts` - leaderboard output includes replay-card fields built via the public summary path
- `tests/persistence/match-store.test.ts` - projection-ready read helpers return only the data required by summary/projector builders

## Phase 3: Demo Producer Parity

### Affected Files

- `src/public/demo-replay.js` - emit the same public frame family as live spectator transport
- `src/public/ws-client.js` - accept the new public frame names and projection payload shape
- `tests/public/demo-replay.test.ts` - assert demo/live transport parity
- `tests/public/ws-client.test.ts` - assert client dispatch for the public frame family

### Changes

Make demo replay a producer-parity surface, not a browser-side special case.

`src/public/demo-replay.js` must stop emitting bespoke `{ type, state, event }` payloads that bypass the public projection contract. Rewrite frame generation so demo emits:

- the same frame type names as live spectator transport
- the same `projection` payload placement
- the same end-state outcome placement

`src/public/ws-client.js` only needs the minimal transport rename/update required to consume the new frame family. It should not perform browser-side derivation or attempt to rebuild public truth from partial payloads.

This phase does not perform the full browser consumer refactor. It only guarantees that both live and demo producers speak the same contract so the later browser cutover is mechanical.

### Unit Tests

- `tests/public/demo-replay.test.ts` - demo emits the same frame family and payload nesting as live spectator transport
- `tests/public/demo-replay.test.ts` - final demo frame includes the projected outcome in the same location as live end frames
- `tests/public/ws-client.test.ts` - client dispatches `MATCH_HELLO`, `MATCH_STATE`, `MATCH_EVENT`, and `MATCH_END` correctly

## Razor Lock

- No browser-side public-truth derivation is added in this plan.
- No route-formatting logic is added to `src/router.ts`.
- Agent-channel contracts and spectator contracts remain explicitly separate if both continue to coexist.
