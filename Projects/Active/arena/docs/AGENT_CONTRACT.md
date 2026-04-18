# HexaWars Agent Action Contract v1

**Contract ID**: `hexawars-agent-contract-v1`
**Status**: FROZEN (changes require new contract version)
**Transport**: WebSocket, JSON frames

## Connection Lifecycle

```
client                               server (arena)
  │                                     │
  │──── WS upgrade /api/arena/ws ──────▶│
  │◀─── HELLO {matchId,side,seed} ─────│
  │──── READY {agentId,version} ──────▶│
  │◀─── STATE {turn,board,visible} ────│
  │──── ACTION {action,from,to,...} ──▶│
  │◀─── ACK {accepted:bool,reason?} ───│
  │◀─── EVENT {type,payload}* ─────────│  (broadcast)
  │◀─── STATE {turn+1,...} ────────────│
  │           ... loop ...              │
  │◀─── END {winner,reason,metrics} ───│
```

## Frame Types (server → client)

### HELLO
Sent once on connection.
```typescript
{
  type: "HELLO",
  matchId: string,
  side: "A" | "B",
  seed: string,              // For deterministic replay verification
  boardSize: { width: 9, height: 9 },
  timeBudgetMs: 5000,        // Per action
  turnCap: 50,
  protocolVersion: "1.0"
}
```

### STATE
Sent at the start of each turn. Observation may be fogged.
```typescript
{
  type: "STATE",
  turn: number,
  yourTurn: boolean,
  visible: HexCell[],        // Only cells the agent can see
  units: Unit[],             // Only the agent's own units (opponent fogged)
  score: { a: number, b: number },
  deadline: number           // Unix ms, enforce client-side
}
```

### ACK
Response to an action.
```typescript
{
  type: "ACK",
  accepted: boolean,
  reason?: "invalid_action" | "not_your_turn" | "budget_exceeded" | "out_of_range",
  correctedState?: Partial<State>
}
```

### EVENT
Broadcast for spectator + agent. Does not require response.
```typescript
{
  type: "EVENT",
  event: "unit_moved" | "unit_attacked" | "unit_destroyed" | "territory_claimed" | "turn_ended",
  payload: object,
  timestamp: number
}
```

### END
Terminal frame.
```typescript
{
  type: "END",
  winner: "A" | "B" | "draw",
  reason: "elimination" | "territory_control" | "turn_cap" | "timeout" | "forfeit",
  finalScore: { a: number, b: number },
  metrics: {
    totalActions: number,
    avgDecisionMs: number,
    invalidActions: number
  }
}
```

## Frame Types (client → server)

### READY
```typescript
{
  type: "READY",
  agentId: string,
  agentVersion: string
}
```

### ACTION
```typescript
{
  type: "ACTION",
  action: "move" | "attack" | "pass",
  from?: { q: number, r: number, s: number },  // Cube coord
  to?:   { q: number, r: number, s: number },
  confidence: number,                           // 0.0 - 1.0
  metadata?: {
    reasoning?: string,                         // Shown in spectator UI
    [k: string]: any
  }
}
```

Validation rules:
- `confidence` ∈ [0, 1]
- `from` required for `move` and `attack`; must refer to a unit owned by the agent
- `to` required for `move` and `attack`; must be a valid cube coord on the board
- `move` range: adjacent hex (distance == 1)
- `attack` range: adjacent hex (distance == 1)
- `pass` has no `from`/`to`

## Budget Enforcement

| Budget | Limit | On exceed |
|---|---|---|
| Time per action | 5000 ms | ACK `budget_exceeded`, action treated as `pass` |
| Match time total | 120000 ms | Forfeit, opponent wins |
| Invalid actions per match | 10 | Forfeit |
| Unanswered turns | 3 | Forfeit |

## Coordinate System

Cube coordinates: `{q, r, s}` where `q + r + s = 0`.

Conversions:
- Axial → cube: `{q, r, s: -q-r}`
- Distance: `(|q1-q2| + |r1-r2| + |s1-s2|) / 2`
- Neighbors: 6 directions — `(+1,-1,0), (+1,0,-1), (0,+1,-1), (-1,+1,0), (-1,0,+1), (0,-1,+1)`

Board origin: top-left hex is `{q:0, r:0, s:0}`. Board is axis-aligned flat-top orientation.

## Unit Schema

```typescript
interface Unit {
  id: string;
  owner: "A" | "B";
  position: { q: number, r: number, s: number };
  strength: number;        // 1-10
  hp: number;              // 1-10
  type: "infantry" | "scout" | "heavy";
}
```

v1 has only `infantry` type. Starting units: 3 per side.

## Cell Schema

```typescript
interface HexCell {
  position: { q: number, r: number, s: number };
  terrain: "plain" | "forest" | "mountain" | "water";
  controlledBy?: "A" | "B";
  unit?: Unit;
}
```

Terrain effects:
- `plain`: no modifier
- `forest`: blocks LOS, +1 defense
- `mountain`: blocks LOS, +2 defense, impassable
- `water`: impassable

## Determinism Guarantees

Given identical:
- `seed`
- Initial board config
- Action sequence from both agents

The engine MUST produce byte-identical state transitions and final match hash. No use of `Math.random()`; all randomness seeded from `seed` via a deterministic PRNG (xorshift32 or equivalent).

## Fairness Invariants

1. Both agents receive identical starting unit counts and strengths.
2. Initial placements are mirror-symmetric across the board midline.
3. Time budgets are identical.
4. Visibility (fog) is computed identically for both sides.
5. Combat resolution favors neither side systematically (attacker/defender identity does not give a bonus; only terrain does).

## Versioning

Contract version is pinned on HELLO. Breaking changes bump major (`2.0`). Agents connecting with an unsupported version receive `END {reason: "forfeit", ...}` immediately.

---

**Status**: FROZEN
