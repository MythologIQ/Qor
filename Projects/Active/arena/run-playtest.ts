import { createMatch, stepMatch } from "./src/engine/match.ts";
import type { CubeCoord } from "./src/shared/types.ts";

function cubeKey(c: CubeCoord) { return `${c.q},${c.r},${c.s}`; }

function greedyAgent(state: any) {
  const myUnits = state.units.filter((u: any) => u.owner === "B");
  if (myUnits.length === 0) return { type: "pass" };
  const unit = myUnits.reduce((best: any, u: any) => u.strength > best.strength ? u : best, myUnits[0]);
  const cell = state.visible.find((c: any) => c.position.q === unit.position.q && c.position.r === unit.position.r && c.position.s === unit.position.s);
  if (!cell) return { type: "pass" };
  const dq = -unit.position.q, dr = -unit.position.r;
  const stepQ = dq !== 0 ? Math.sign(dq) : 0;
  const stepR = dr !== 0 ? Math.sign(dr) : 0;
  const to = { q: unit.position.q + stepQ, r: unit.position.r + stepR, s: -unit.position.q - stepQ - unit.position.r - stepR };
  const toCell = state.visible.find((c: any) => c.position.q === to.q && c.position.r === to.r && c.position.s === to.s);
  const occupied = state.units.some((u: any) => u.position.q === to.q && u.position.r === to.r && u.position.s === to.s);
  if (toCell && toCell.terrain !== "water" && !occupied) {
    return { type: "move", unitId: unit.id, from: unit.position, to };
  }
  return { type: "pass" };
}

function randomAgent(state: any) {
  const myUnits = state.units.filter((u: any) => u.owner === "A");
  if (myUnits.length === 0) return { type: "pass" };
  const unit = myUnits[Math.floor(Math.random() * myUnits.length)];
  const neighbors = [
    { q: unit.position.q + 1, r: unit.position.r, s: -unit.position.q - 1 - unit.position.r },
    { q: unit.position.q - 1, r: unit.position.r, s: -unit.position.q + 1 - unit.position.r },
    { q: unit.position.q, r: unit.position.r + 1, s: -unit.position.q - unit.position.r - 1 },
    { q: unit.position.q, r: unit.position.r - 1, s: -unit.position.q - unit.position.r + 1 },
    { q: unit.position.q + 1, r: unit.position.r - 1, s: -unit.position.q - 1 - unit.position.r + 1 },
    { q: unit.position.q - 1, r: unit.position.r + 1, s: -unit.position.q + 1 - unit.position.r - 1 },
  ];
  const valid = neighbors.filter(n => {
    const c = state.visible.find((v: any) => v.position.q === n.q && v.position.r === n.r && v.position.s === n.s);
    const occupied = state.units.some((u: any) => u.position.q === n.q && u.position.r === n.r && u.position.s === n.s);
    return c && c.terrain !== "water" && !occupied;
  });
  if (valid.length === 0) return { type: "pass" };
  const to = valid[Math.floor(Math.random() * valid.length)];
  return { type: "move", unitId: unit.id, from: unit.position, to };
}

function runMatch(seed: string) {
  const state = createMatch(seed, "A", "B");
  const TURN_CAP = 150;
  for (let turn = 0; turn < TURN_CAP; turn++) {
    if (state.phase === "ended") break;
    const actionA = randomAgent(state);
    const actionB = greedyAgent(state);
    const result = stepMatch(state, actionA, actionB);
    if (result.ended) break;
  }
  const aUnits = state.units.filter((u: any) => u.owner === "A").length;
  const bUnits = state.units.filter((u: any) => u.owner === "B").length;
  const winner = aUnits > bUnits ? "A" : bUnits > aUnits ? "B" : "draw";
  return { winner, turns: state.turn, unitsA: aUnits, unitsB: bUnits };
}

const results = [];
for (let i = 0; i < 20; i++) {
  results.push({ ...runMatch(`playtest-${i}`), match: i + 1 });
}

const aWins = results.filter(r => r.winner === "A").length;
const bWins = results.filter(r => r.winner === "B").length;
const draws = results.filter(r => r.winner === "draw").length;
const avgTurns = (results.reduce((s, r) => s + r.turns, 0) / results.length).toFixed(1);
const allSeeds = results.map(r => r.match);
const aDetails = results.filter(r => r.winner === "A").map(r => `match-${r.match}: ${r.turns} turns, A:${r.unitsA} B:${r.unitsB}`);
const bDetails = results.filter(r => r.winner === "B").map(r => `match-${r.match}: ${r.turns} turns, A:${r.unitsA} B:${r.unitsB}`);

console.log(JSON.stringify({ results, aWins, bWins, draws, avgTurns, aDetails, bDetails }, null, 2));
