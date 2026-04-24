# Plan: HexaWars Public Match Projection Foundation

> Explicit-by-contract plan for the builder queue. This plan creates one canonical public match truth that multiple UI consumers can read without re-deriving state in browser code. Operator-facing signup, dashboard, queue, and builder surfaces stay on separate view-model tracks.

## Open Questions

- None. All design choices in this document are locked unless explicitly re-opened by `/qor-plan`.

## Decision Lock-Ins

- The canonical projection scope is **public match truth only**. It covers spectator, replay, public match summaries, and leaderboard replay cards. It does **not** cover operator signup state, queue eligibility, bracket recommendation, or builder automation status.
- The canonical projection is emitted by server-side pure functions. Browser code renders projected data; it does not compute territory share, momentum, side naming, event copy classification, or summary labels from raw engine state.
- Public consumers read one stable DTO family:
  - `PublicMatchProjection`
  - `PublicMatchFrame`
  - `PublicMatchSummary`
  - `PublicReplayCard`
- Challenger/signup/dashboard work remains a separate contract family. This plan defines the boundary in architecture and route responsibilities only; it does not create unused challenger/builder DTO files in the runtime tree.
- Demo replay must emit the same frame shape as live spectator frames. Demo is not allowed to be a special-case truth source with extra or missing fields.
- Leaderboard rows stay rank-oriented. Replay emphasis is attached through `PublicReplayCard`, not by teaching leaderboard code to inspect raw match records or event logs.

## Phase 1: Projection Substrate

### Affected Files

- `src/shared/public-match.ts` - new public DTO definitions for projection, frame, summary, replay card, and public-side agent/board/event sections
- `src/projection/public-match.ts` - new pure projector from domain state + public metadata into `PublicMatchProjection`
- `src/projection/public-summary.ts` - new pure builders for `PublicMatchSummary` and `PublicReplayCard`
- `src/shared/types.ts` - add narrow metadata types needed by projectors; do not place projection DTOs here
- `tests/projection/public-match.test.ts` - new projector tests
- `tests/projection/public-summary.test.ts` - new summary/replay-card tests

### Changes

Create `src/shared/public-match.ts` with DTOs that are public-consumer shaped, not engine shaped:

```ts
export interface PublicMatchProjection {
  matchId: string;
  mode: "live" | "demo" | "replay";
  phase: string;
  round: number;
  roundCap: number;
  pressure: number;
  board: {
    cells: PublicBoardCell[];
    units: PublicBoardUnit[];
    territories: { A: number; B: number };
    controlShare: { A: number; B: number };
    momentum: "blue" | "red" | "even";
  };
  sides: {
    A: PublicSidePanel;
    B: PublicSidePanel;
  };
  featured: {
    headline: string;
    detail: string;
  };
  feed: PublicFeedEntry[];
  outcome: PublicOutcome | null;
}
```

Rules:

- `PublicMatchProjection` contains only render-ready public truth.
- All percentage fields are numeric, never preformatted strings.
- Side panels contain already-resolved operator/agent/model/status fields for the browser.
- Feed entries are already normalized into display-safe categories and text.

Create `src/projection/public-match.ts` as the sole projector from runtime/persistence state into `PublicMatchProjection`. The projector must:

- compute `controlShare` once
- compute `momentum` once
- resolve public-facing side labels once
- normalize event payloads into `PublicFeedEntry`
- produce deterministic, value-only output

Create `src/projection/public-summary.ts` for public cards and list surfaces:

- `buildPublicMatchSummary(rec, projection): PublicMatchSummary`
- `buildPublicReplayCard(summary): PublicReplayCard`

Keep these summary builders separate from the full match projector so leaderboard and homepage cards do not depend on the full spectator payload.

`src/shared/types.ts` may gain narrow helper types only if the projector needs typed metadata from engine/runtime modules. Do not move projection DTOs into the legacy engine contract file.

### Unit Tests

- `tests/projection/public-match.test.ts` - projector returns stable numeric shares, stable momentum classification, side panels with resolved operator/model/status fields, normalized feed entries, and null outcome before conclusion
- `tests/projection/public-match.test.ts` - same engine input yields byte-stable projection output
- `tests/projection/public-summary.test.ts` - summaries and replay cards derive only from `MatchRecord + PublicMatchProjection`, not raw event-log traversal
- `tests/projection/public-summary.test.ts` - leaderboard-card projection does not require browser-only fields or full feed history

## Phase 2: Producer Cutover

### Affected Files

- `src/gateway/ws.ts` - emit `PublicMatchFrame` payloads for spectator clients
- `src/gateway/contract.ts` - add public spectator frame typings that reference the new DTOs
- `src/persistence/match-store.ts` - add projection-ready read helpers for public summary consumers
- `src/rank/leaderboard.ts` - return rank rows plus public replay-card inputs, not raw DB-only rows
- `src/routes/public-matches.ts` - new public match read routes built on the new summary/projector builders
- `src/routes/public-leaderboard.ts` - new leaderboard route module built on the new replay-card summary path
- `src/router.ts` - mount new route modules only; no new formatting logic
- `src/public/demo-replay.js` - emit live-equivalent public frames instead of a bespoke browser-only state shape
- `tests/gateway/ws.test.ts` - spectator frame contract tests
- `tests/router/leaderboard.test.ts` - leaderboard output tests
- `tests/router/matches-routes.test.ts` - public match summary route tests
- `tests/public/demo-replay.test.ts` - demo frame parity tests

### Changes

In `src/gateway/contract.ts`, define the public spectator transport explicitly:

```ts
export interface PublicMatchFrame {
  type: "MATCH_HELLO" | "MATCH_STATE" | "MATCH_EVENT" | "MATCH_END";
  projection: PublicMatchProjection;
}
```

`src/gateway/ws.ts` must build spectator frames by calling the Phase 1 projector. It must not serialize partial raw `MatchState` fields and expect browser code to finish the job.

`src/public/demo-replay.js` must be rewritten so `buildDemoFrames()` emits the same public frame family as live spectator transport. Demo stays deterministic, but the frame schema becomes identical to live:

- same `type` variants
- same `projection` object shape
- same outcome placement

`src/routes/public-matches.ts` and `src/routes/public-leaderboard.ts` own the new public formatting path. `src/router.ts` only mounts them, preserving the Razor against an already-over-limit router file.

`src/rank/leaderboard.ts` must stop returning bare DB rows as the final public shape where a public card or summary is intended. Add explicit summary/replay-card builders so the homepage/leaderboard path can consume the same derived public truth without teaching each route how to interpret matches.

`src/persistence/match-store.ts` gains read helpers that supply the minimal record/event material required by the projector/summary builders. Keep storage responsibilities in `match-store.ts`; do not put formatting logic there.

### Unit Tests

- `tests/gateway/ws.test.ts` - spectator WS frames carry `projection` and never raw `visible/units/score` transport fragments
- `tests/public/demo-replay.test.ts` - demo frame sequence matches live spectator frame family exactly
- `tests/router/leaderboard.test.ts` - leaderboard route returns rank rows with replay-card data built through the summary builder, not ad hoc route formatting
- `tests/router/matches-routes.test.ts` - match read route exposes `PublicMatchSummary` consistently for seeded demo data and persisted matches

## Phase 3: Browser Consumer Cutover

### Affected Files

- `src/public/arena-bootstrap.js` - new top-level bootstrap and DOM binding entrypoint
- `src/public/arena-render.js` - new projection-to-DOM render module
- `src/public/arena-controls.js` - new replay/dialog/focus controls module
- `src/public/arena.js` - reduced to import-and-wire wrapper only
- `src/public/ws-client.js` - rename frame constants and handlers to the public frame family
- `src/public/agent-status.js` - accept projection side-panel data directly
- `src/public/agent-bubbles.js` - accept projection reasoning/feed slices directly
- `src/public/event-log.js` - accept normalized public feed entries directly
- `tests/public/arena.test.ts` - new browser consumer contract tests

### Changes

`src/public/arena.js` must be cut down to a thin wrapper because it is already over the file-line Razor. Move browser responsibilities into:

- `arena-bootstrap.js`
- `arena-render.js`
- `arena-controls.js`

Then delete browser-side helpers that derive public truth from raw state, including:

- territory-share math
- momentum classification
- side label resolution
- feed normalization
- summary label generation

Keep only rendering and interaction concerns:

- DOM binding
- focus mode
- replay controls
- dialog controls
- applying already-projected data to board, panels, and feed

Boundary rule for future work:

- challenger and builder surfaces may reference `matchId`, stable agent/operator identifiers, and `PublicReplayCard`
- they may not import `PublicMatchProjection` as their primary view model

This boundary is architectural, not a runtime-file creation task in this plan.

### Unit Tests

- `tests/public/arena.test.ts` - arena consumer renders from `PublicMatchProjection` without requiring raw engine transport fields
- `tests/public/arena.test.ts` - removing derived-browser helpers does not change rendered momentum, side labels, or progress for the same projection input
- `tests/public/arena.test.ts` - consumer modules fail fast if required projection sections are missing, proving contract completeness

## Razor Lock

- No phase may add logic to `src/router.ts` beyond route-module mounting.
- No phase may add new state-derivation logic to `src/public/arena.js`; that file must shrink to a wrapper under this plan.

## Builder Queue Refresh

- Phase 1 task slice: projection DTOs + projector + summary builders + tests
- Phase 2 task slice: WS/route/demo producer cutover + tests
- Phase 3 task slice: browser consumer cutover + challenger/builder boundary DTOs + tests
