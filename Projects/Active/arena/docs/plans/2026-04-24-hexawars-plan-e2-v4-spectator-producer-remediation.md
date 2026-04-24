# Plan: HexaWars Spectator Producer Remediation v4

## Open Questions

- None. The remediation scope is locked to the minimal router reduction that closes the active veto.

## Locked Design Decisions

- Canonical spectator websocket path is `/api/arena/matches/:id/ws`.
- `src/server.ts` is the explicit websocket upgrade owner. It exports a custom `fetch(req, server)` that intercepts only `/api/arena/matches/:id/ws` and falls through to `app.fetch(req)` for all non-spectator HTTP traffic.
- `src/gateway/ws.ts` becomes agent-only. Spectator transport ownership moves entirely to `src/gateway/spectator-ws.ts`.
- `src/routes/matches.ts` is the sole owner of the public match read surface.
- `src/routes/tournaments.ts` is the sole owner of tournament HTTP routes.
- `src/routes/leaderboard.ts` is the sole owner of leaderboard HTTP routes.
- `src/router.ts` ends this slice as a bounded mount layer for status/metrics, identity, matchmaker routes, and explicit route mounts only.
- Demo replay emits the same spectator `MATCH_*` frame family as the live spectator producer.

## Phase 1: Spectator Upgrade Ownership

### Affected Files

- `src/server.ts` - replace pure `app.fetch` export with explicit fetch wrapper that owns websocket interception for `/api/arena/matches/:id/ws`
- `src/gateway/spectator-ws.ts` - new spectator-only websocket handler and frame producer
- `src/shared/public-match.ts` - add spectator `PublicMatchFrame` DTOs
- `src/projection/public-match.ts` - add narrow live spectator adapters that derive `PublicMatchProjection`
- `tests/gateway/spectator-ws.test.ts` - mounted spectator path and frame-family coverage
- `tests/projection/public-match.test.ts` - projector adapter coverage for live runtime inputs

### Changes

Create `src/gateway/spectator-ws.ts` as the only spectator transport owner. It exports a handler shaped for the Bun upgrade seam used by `src/server.ts`.

`src/server.ts` changes from:

```ts
export default {
  port,
  fetch: app.fetch,
};
```

to:

```ts
export default {
  port,
  fetch(req: Request, server: unknown) {
    const url = new URL(req.url);
    const match = /^\/api\/arena\/matches\/([^/]+)\/ws$/.exec(url.pathname);
    if (match) {
      return handleSpectatorWs(req, server, decodeURIComponent(match[1]), spectatorDeps);
    }
    return app.fetch(req);
  },
};
```

Rules:

- Only `/api/arena/matches/:id/ws` is intercepted at the server seam.
- All normal HTTP routes still flow through Hono unchanged.
- `src/shared/public-match.ts` owns `PublicMatchFrame`.
- `src/projection/public-match.ts` remains the only public-truth derivation site.

### Unit Tests

- `tests/gateway/spectator-ws.test.ts` - `/api/arena/matches/:id/ws` is the mounted live entrypoint and does not depend on query-param `spectate`
- `tests/gateway/spectator-ws.test.ts` - spectator frames always use `MATCH_HELLO`, `MATCH_STATE`, `MATCH_EVENT`, and `MATCH_END`
- `tests/gateway/spectator-ws.test.ts` - emitted frames contain `projection` and never expose raw `visible`, `units`, `score`, `deadline`, or `budget`
- `tests/projection/public-match.test.ts` - identical live runtime inputs yield identical `PublicMatchProjection`

## Phase 2: Route Ownership Reduction

### Affected Files

- `src/gateway/ws.ts` - remove all spectator duties; keep only agent-auth/session concerns still used by the live runtime
- `src/routes/matches.ts` - mounted sole owner of public match read routes
- `src/routes/tournaments.ts` - mounted sole owner of tournament HTTP routes
- `src/routes/leaderboard.ts` - new mounted sole owner of leaderboard HTTP routes
- `src/router.ts` - delete inline match, tournament, and leaderboard routes; mount route modules explicitly
- `tests/router/matches-routes.test.ts` - mounted route ownership and public shape coverage
- `tests/router/tournament.test.ts` - mounted tournament route coverage
- `tests/router/leaderboard.test.ts` - mounted leaderboard route coverage
- `tests/router/status.test.ts` - verify router status surface still works after shrink
- `tests/gateway/ws-auth.test.ts` - verify agent websocket/auth behavior still passes after spectator split

### Changes

`src/gateway/ws.ts` becomes structurally agent-only. Allowed responsibilities after this phase:

- agent bearer/token auth if still used
- agent session creation and close hooks if still used
- agent-specific frame helpers if still used

Disallowed responsibilities after this phase:

- spectator path parsing
- spectator frame production
- spectator browser transport ownership

`src/routes/matches.ts` becomes the sole owner of:

- `GET /api/arena/matches`
- `GET /api/arena/matches/:id`
- `GET /api/arena/matches/:id/events`
- `GET /api/arena/matches/:id/stream`
- `GET /api/arena/operators/:handle/matches`

`src/routes/tournaments.ts` becomes the sole owner of:

- `POST /api/arena/tournaments`
- `POST /api/arena/tournaments/:id/signup`
- `GET /api/arena/tournaments/:id`

Create `src/routes/leaderboard.ts` as the sole owner of:

- `GET /api/arena/leaderboard`

`src/router.ts` deletes its inline versions of those three route families and mounts modules explicitly:

```ts
mountMatchRoutes(app, db);
mountTournamentRoutes(app, db);
mountLeaderboardRoutes(app, db);
```

The router end-state is constrained to:

- status and metrics
- identity routes
- matchmaker enqueue and status routes
- explicit route mounts

The arithmetic target is part of the plan contract: after deleting the current inline match block, inline tournament block, and inline leaderboard block, `src/router.ts` must end below the 250-line Razor ceiling in the same slice.

### Unit Tests

- `tests/router/matches-routes.test.ts` - all public match read routes remain reachable through the mounted module
- `tests/router/matches-routes.test.ts` - missing match paths still return `404`
- `tests/router/tournament.test.ts` - tournament routes still return `401/201/404` through the mounted module
- `tests/router/leaderboard.test.ts` - leaderboard route returns the same public shape through the mounted module
- `tests/router/status.test.ts` - `/api/arena/status` still reports queue, presence, and metrics after router shrink
- `tests/gateway/ws-auth.test.ts` - agent websocket/auth behavior still passes with spectator logic removed from `src/gateway/ws.ts`

## Phase 3: Demo Parity and Browser Client Alignment

### Affected Files

- `src/public/ws-client.js` - point at `/api/arena/matches/:id/ws` and consume `MATCH_*` spectator frames
- `src/public/demo-replay.js` - emit the same `MATCH_*` frame family with `projection`
- `src/public/arena.js` - consume projected spectator payloads from both live and demo producers without browser-side truth derivation
- `tests/public/ws-client.test.ts` - path and dispatch coverage
- `tests/public/demo-replay.test.ts` - live/demo parity coverage

### Changes

`src/public/ws-client.js` changes from:

```js
/api/arena/ws?spectate=<matchId>
```

to:

```js
/api/arena/matches/${encodeURIComponent(matchId)}/ws
```

It dispatches only:

- `MATCH_HELLO`
- `MATCH_STATE`
- `MATCH_EVENT`
- `MATCH_END`

`src/public/demo-replay.js` emits that exact same frame family and payload placement. `src/public/arena.js` adapts only to the projection-backed payload shape and does not re-derive public truth.

### Unit Tests

- `tests/public/ws-client.test.ts` - client connects to `/api/arena/matches/:id/ws`
- `tests/public/ws-client.test.ts` - client dispatches all four `MATCH_*` frame types correctly
- `tests/public/demo-replay.test.ts` - demo emits the same frame family and `projection` placement as live spectator transport
- `tests/public/demo-replay.test.ts` - demo end frame places outcome exactly where live `MATCH_END` does

## Razor Lock

- `src/server.ts` must explicitly own the Bun websocket upgrade seam for `/api/arena/matches/:id/ws`.
- `src/gateway/ws.ts` must end this slice agent-only.
- `src/routes/matches.ts`, `src/routes/tournaments.ts`, and `src/routes/leaderboard.ts` must be the sole owners of their route families by the end of this slice.
- `src/router.ts` must end below 250 lines in the same slice.
- No new unmounted transport or route module may be introduced.
- No browser-side public-truth derivation may be added.
