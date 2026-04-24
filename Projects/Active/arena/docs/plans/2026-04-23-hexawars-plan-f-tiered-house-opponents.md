# Plan: HexaWars Tiered House Opponents

> Explicit-by-contract plan for the builder queue. This plan adds one LLM-backed computer opponent per bracket using the same base model across tiers. Difficulty comes from policy packs, doctrine, and planning horizon, not better models or stat cheats.

## Open Questions

- None. All design choices in this document are locked unless explicitly re-opened by `/qor-plan`.

## Decision Lock-Ins

- All house opponents use the **same base model**. Tier difficulty does not come from provider changes, larger models, extra hidden time budgets, or stat bonuses.
- Tier differentiation comes from **policy-pack doctrine + planning horizon**:
  - opening priorities
  - terrain valuation
  - threat heuristics
  - bidding posture
  - target selection
  - endgame conversion rules
  - matchup guides
  - anti-pattern warnings
- Policy packs are **versioned repo files**, not database-authored content and not inline prompt strings.
- House-opponent logic is split into:
  - policy-pack data
  - prompt assembly
  - LLM client port
  - response parsing / plan extraction
  - house-agent runtime adapter
- This plan adds the **runtime substrate** for house opponents and bracket-aligned seed opponents. It does **not** implement challenger page UI, bracket enrollment UI, or public leaderboard redesign.
- House opponents must connect to the existing server build path by the end of this plan: server -> matchmaker fallback selection -> house-agent registry -> local channel adapter -> `MatchRunner.start()`.
- If an LLM response is invalid, the house opponent falls back to deterministic local policy selection. Invalid model output must not forfeit the arena’s own house agents.

## Phase 1: Policy-Pack and Client Substrate

### Affected Files

- `src/house-agents/types.ts` - new DTOs for policy packs, planning horizon, matchup notes, and model client results
- `src/house-agents/policy-pack.ts` - new pure loader/validator for repo policy packs
- `src/house-agents/packs/starter.ts` - new Starter bracket doctrine pack
- `src/house-agents/packs/contender.ts` - new Contender bracket doctrine pack
- `src/house-agents/packs/apex.ts` - new Apex bracket doctrine pack
- `src/house-agents/llm-client.ts` - new interface-only model client port and request/response helpers
- `src/house-agents/http-model-client.ts` - new concrete fetch-based client using one configured base model
- `src/house-agents/fallback.ts` - new deterministic fallback planner
- `tests/house-agents/policy-pack.test.ts` - new tests for pack integrity
- `tests/house-agents/fallback.test.ts` - new deterministic fallback tests
- `tests/house-agents/http-model-client.test.ts` - new concrete client tests

### Changes

Create a dedicated `src/house-agents/` subtree. Do not mix house-opponent doctrine into `src/agents/` or `src/shared/`.

`src/house-agents/types.ts` defines the declarative pack shape:

```ts
export type HouseTier = "starter" | "contender" | "apex";

export interface PolicyPack {
  id: string;
  tier: HouseTier;
  modelId: string;
  planningHorizon: 1 | 2 | 3;
  doctrine: {
    opening: string[];
    terrain: string[];
    threat: string[];
    bidding: string[];
    targeting: string[];
    endgame: string[];
  };
  matchupNotes: Record<string, string[]>;
  antiPatterns: string[];
}
```

`src/house-agents/policy-pack.ts` exports:

- `getPolicyPack(tier: HouseTier): PolicyPack`
- `listPolicyPacks(): PolicyPack[]`
- `assertValidPolicyPack(pack: PolicyPack): void`

Each tier file exports one constant pack. Packs must share the same `modelId` and differ only in doctrine density, matchup depth, and `planningHorizon`.

`src/house-agents/llm-client.ts` defines the port:

- `HouseModelClient`
- `HouseModelRequest`
- `HouseModelResponse`

`src/house-agents/http-model-client.ts` is the concrete runtime adapter. It uses built-in `fetch` only and reads configuration from env:

- `HOUSE_AGENT_MODEL_ID`
- `HOUSE_AGENT_API_URL`
- `HOUSE_AGENT_API_TOKEN`

All tiers use the same configured `HOUSE_AGENT_MODEL_ID`. No extra package is added in this phase.

`src/house-agents/fallback.ts` provides a deterministic escape hatch that maps `MatchState + budget + policyPack` to a valid `RoundPlan` when the model output is empty, malformed, or out-of-budget.

### Unit Tests

- `tests/house-agents/policy-pack.test.ts` - every pack validates, all tiers share one `modelId`, tiers increase in doctrine/horizon complexity as locked
- `tests/house-agents/policy-pack.test.ts` - policy packs contain no empty doctrine sections and no duplicated anti-pattern rules
- `tests/house-agents/fallback.test.ts` - fallback planner returns a valid `RoundPlan` for empty-state, move-state, and attack-state cases
- `tests/house-agents/fallback.test.ts` - fallback output is deterministic for the same state and policy pack
- `tests/house-agents/http-model-client.test.ts` - concrete client sends the configured model id on every request and rejects missing env/config cleanly

## Phase 2: House-Agent Runtime Adapter

### Affected Files

- `src/house-agents/house-agent.ts` - new `BaseAgent` subclass that composes policy pack + client + fallback
- `src/house-agents/prompt.ts` - new prompt assembler from policy pack + public state summary
- `src/house-agents/parse.ts` - new strict parser from model output into `RoundPlan`
- `src/house-agents/channel.ts` - new adapter from `BaseAgent` to local `AgentChannel`
- `src/house-agents/registry.ts` - new constructors for starter/contender/apex house agents and channels
- `src/house-agents/config.ts` - new env/config reader for the concrete model client
- `src/agents/base.ts` - no semantic change; import compatibility only if needed
- `tests/house-agents/house-agent.test.ts` - new end-to-end house-agent tests
- `tests/house-agents/parse.test.ts` - new parser tests
- `tests/house-agents/channel.test.ts` - new local-channel tests

### Changes

Create `HouseAgent extends BaseAgent` with constructor inputs:

- `tier`
- `policyPack`
- `modelClient`
- `fallbackPlanner`

The runtime flow is:

1. build prompt from `MatchState + AgentRoundBudget + PolicyPack`
2. call `HouseModelClient.complete()`
3. parse candidate `RoundPlan`
4. if parse/validation fails, use deterministic fallback

`src/house-agents/config.ts` centralizes required env validation for the concrete client so server boot fails early if house-opponent runtime is enabled without the three required env vars.

`src/house-agents/prompt.ts` must assemble prompts from declarative sections. Do not hardcode tier prompts inline in `house-agent.ts`.

`src/house-agents/parse.ts` must be strict:

- reject out-of-range bids
- reject missing `extras`
- reject malformed coords
- reject unknown action kinds

This parser returns either a valid `RoundPlan` or a typed parse failure consumed by the fallback path.

Add a small registry entrypoint so code can construct:

- `createStarterHouseAgent()`
- `createContenderHouseAgent()`
- `createApexHouseAgent()`

Create `src/house-agents/channel.ts` to adapt a `BaseAgent` into a local `AgentChannel` implementation. This channel:

- accepts `RoundFrame`
- calls `agent.getRoundPlan()`
- exposes `receivePlan()`
- never opens a WebSocket

The registry exports `createHouseChannel(tier)` in addition to the agent constructors. This keeps the runtime adapter connected to the existing `MatchRunner` contract before server wiring lands in Phase 3.

### Unit Tests

- `tests/house-agents/parse.test.ts` - valid JSON/text output parses into `RoundPlan`; malformed output is rejected
- `tests/house-agents/house-agent.test.ts` - each tier agent calls the same model client port and supplies the correct tier policy pack
- `tests/house-agents/house-agent.test.ts` - invalid model output falls back to deterministic planner instead of throwing or forfeiting
- `tests/house-agents/house-agent.test.ts` - higher tiers pass richer doctrine sections and longer planning horizon into prompt assembly
- `tests/house-agents/channel.test.ts` - local channel emits valid plans through the existing runner-facing `AgentChannel` seam

## Phase 3: Bracket Seeding and Matchmaker Integration

### Affected Files

- `src/matchmaker/types.ts` - add house-opponent identity metadata needed for bracket seeding
- `src/matchmaker/pair.ts` - allow bracket-local pairing against seeded house opponents
- `src/matchmaker/queue.ts` - allow enqueue of bracket-scoped house-opponent placeholders
- `src/server.ts` - instantiate local house-agent channels when a pair includes a house opponent
- `src/identity/agent-version.ts` - persist house-opponent policy-pack version fingerprint for seeded agents
- `src/persistence/seed.ts` - add house-opponent seed operators/agents for all three tiers
- `src/rank/leaderboard.ts` - ensure house opponents appear as normal ranked agents when seeded
- `tests/matchmaker/pair.test.ts` - bracket pairing tests with seeded house agents
- `tests/persistence/seed.test.ts` - house-opponent seeding tests
- `tests/rank/leaderboard.test.ts` - leaderboard visibility tests for seeded house agents
- `tests/server/house-opponent-routing.test.ts` - new runtime connection tests

### Changes

Integrate house opponents into the existing arena identity/persistence substrate as normal agents with stable IDs and declared metadata:

- operator handle per tiered house opponent
- agent version fingerprint tied to policy-pack contents
- bracket membership
- same declared base `modelId`

`src/persistence/seed.ts` seeds one house opponent per bracket:

- Starter house opponent
- Contender house opponent
- Apex house opponent

These are first-class agents, not special-case ghosts.

`src/matchmaker/types.ts`, `src/matchmaker/pair.ts`, and `src/matchmaker/queue.ts` gain bracket-aware logic so a bracket can fall back to its house opponent when no compatible live opponent is available. Keep this logic explicit and local to matchmaker modules; do not leak bracket fallback policy into `HouseAgent` itself.

`src/server.ts` closes the build path. When `onPair()` receives a pair containing a house entry:

- live operators still use their existing session-backed channel path
- house opponents use `createHouseChannel(tier, houseModelClient)`
- `MatchRunner.start()` receives one live channel and one local house channel through the same runner seam

This is the sole runtime connection required for the house-opponent tree.

`src/identity/agent-version.ts` must capture a fingerprint derived from the policy-pack file contents plus the shared `modelId`, so a doctrine change produces a new seeded house-opponent version.

### Unit Tests

- `tests/persistence/seed.test.ts` - all three house opponents seed with distinct policy-pack fingerprints and the same base `modelId`
- `tests/matchmaker/pair.test.ts` - bracket pairing prefers live-vs-live when available and falls back to the bracket’s house opponent only when needed
- `tests/matchmaker/pair.test.ts` - no cross-bracket house-opponent pairing occurs
- `tests/rank/leaderboard.test.ts` - seeded house opponents appear as normal entries with stable handles and ranks
- `tests/server/house-opponent-routing.test.ts` - server match start path instantiates local house channels only for house-opponent pairs and still uses `MatchRunner.start()`

## Builder Queue Refresh

- Phase 1 task slice: policy-pack substrate + fallback + tests
- Phase 2 task slice: house-agent adapter + parser + prompt assembly + tests
- Phase 3 task slice: bracket seeding + matchmaker integration + leaderboard visibility + tests
