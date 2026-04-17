// Simulate 100 RandomA vs RandomB matches to check side bias
// Win rate for A should be within [0.4, 0.6]

import { createMatch, stepMatch } from "/home/workspace/Projects/continuous/Qor/arena/src/engine/match.ts";

function seededRand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function runMatch(seed: string): "A" | "B" | "draw" {
  const state = createMatch(seed, "sessionA", "sessionB");
  const rand = seededRand(seed + "-A");
  let loopState = state;
  let loopEnded = false;
  let totalTurns = 0;
  const TURN_CAP = 50;

  while (!loopEnded && totalTurns < TURN_CAP) {
    totalTurns++;

    const myUnitsA = loopState.units.filter((u: any) => u.owner === "A");
    const myUnitsB = loopState.units.filter((u: any) => u.owner === "B");

    let actionA: any = { type: "pass" };
    let actionB: any = { type: "pass" };

    if (myUnitsA.length > 0) {
      const unit = myUnitsA[Math.floor(rand() * myUnitsA.length)];
      const q = unit.position.q + 1;
      const r = unit.position.r;
      const s = -q - r;
      actionA = { type: "move", unitId: unit.id, from: unit.position, to: { q, r, s } };
    }

    if (myUnitsB.length > 0) {
      const unit = myUnitsB[Math.floor(rand() * myUnitsB.length)];
      const q = unit.position.q - 1;
      const r = unit.position.r;
      const s = -q - r;
      actionB = { type: "move", unitId: unit.id, from: unit.position, to: { q, r, s } };
    }

    const result = stepMatch(loopState, actionA, actionB);
    loopState = result.state;
    loopEnded = result.ended;

    if (loopEnded) {
      const victoryEvent = result.events.find((e: any) => e.type === "victory");
      if (victoryEvent && victoryEvent.data) {
        const d = victoryEvent.data as { winner?: string };
        if (d.winner === "A") return "A";
        if (d.winner === "B") return "B";
      }
      return "draw";
    }

    if (loopState.turn >= 50) {
      loopEnded = true;
      return "draw";
    }
  }

  return "draw";
}

let winsA = 0;
let winsB = 0;
let draws = 0;

for (let i = 0; i < 100; i++) {
  const seed = `fairness-sim-${i}`;
  const result = runMatch(seed);
  if (result === "A") winsA++;
  else if (result === "B") winsB++;
  else draws++;
}

const winRateA = winsA / 100;
console.log(`Wins A: ${winsA}, Wins B: ${winsB}, Draws: ${draws}`);
console.log(`Win rate A: ${winRateA.toFixed(3)}`);

if (winRateA >= 0.4 && winRateA <= 0.6) {
  console.log("PASS: Win rate within [0.4, 0.6]");
  process.exit(0);
} else {
  console.log("FAIL: Win rate outside [0.4, 0.6] — side bias detected");
  process.exit(1);
}
