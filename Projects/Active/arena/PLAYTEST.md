# Agent Playtest Report — 2026-04-18

## Methodology

- **Matches:** 20 random-agent vs greedy-agent, unique seeds
- **Engine:** `arena/src/engine/match.ts` — `createMatch()` + `stepMatch()`
- **Random agent:** random neighbor selection, avoids water/occupied cells
- **Greedy agent:** selects strongest unit, moves toward hex-grid center (0,0,0)
- **Turn cap:** 150

## Aggregate Results

| Metric | Value |
|--------|-------|
| Random (A) wins | 20 |
| Greedy (B) wins | 0 |
| Draws | 0 |
| Avg turns | 0.0 |

## Match Breakdown

| Match | Winner | Turns | A units | B units |
|-------|--------|-------|---------|---------|
| 1 | A (elimination) | 0 | 9 | 0 |
| 2 | A (elimination) | 0 | 9 | 0 |
| 3 | A (elimination) | 0 | 9 | 0 |
| 4 | A (elimination) | 0 | 9 | 0 |
| 5 | A (elimination) | 0 | 9 | 0 |
| 6 | A (elimination) | 0 | 9 | 0 |
| 7 | A (elimination) | 0 | 9 | 0 |
| 8 | A (elimination) | 0 | 9 | 0 |
| 9 | A (elimination) | 0 | 9 | 0 |
| 10 | A (elimination) | 0 | 9 | 0 |
| 11 | A (elimination) | 0 | 9 | 0 |
| 12 | A (elimination) | 0 | 9 | 0 |
| 13 | A (elimination) | 0 | 9 | 0 |
| 14 | A (elimination) | 0 | 9 | 0 |
| 15 | A (elimination) | 0 | 9 | 0 |
| 16 | A (elimination) | 0 | 9 | 0 |
| 17 | A (elimination) | 0 | 9 | 0 |
| 18 | A (elimination) | 0 | 9 | 0 |
| 19 | A (elimination) | 0 | 9 | 0 |
| 20 | A (elimination) | 0 | 9 | 0 |

## Diagnosis — B-side unit starvation

`makeUnits()` in `src/engine/match.ts` computes B-unit column positions as `cols.slice(4, 7)` = `[4, 5, 6]`. The outer hex ring condition `Math.abs(s) > 3` eliminates every B-unit candidate before placement:

```
q=4, r=0 → s=-4  → abs(s)=4 > 3 → ELIMINATED
q=4, r=1 → s=-5  → abs(s)=5 > 3 → ELIMINATED
...
```

No B units spawn, so `checkVictory()` in `src/engine/victory.ts` immediately returns `{ winner: "A", reason: "elimination" }` before any turn executes. The 0-turn result is therefore an expected artifact of the B-side spawn bug, not a balance finding.

## Test Suite

```
bun test
409 pass | 1 fail (ui-smoke: screenshot absent in headless env)
Ran 410 tests across 40 files.
```

The ui-smoke failure is pre-existing (no screenshot taken); all engine/game logic tests pass.

## Root Cause for B-side non-spawn

`src/engine/match.ts` — `makeUnits()` column + ring filter interaction. Fixing `abs(s) > 3` to `abs(s) >= BOARD_SIZE` (where `BOARD_SIZE = 7`) would allow B units to spawn in columns 4–6 at rows near the edge, which correctly places 9 B units symmetric to A's 9.
