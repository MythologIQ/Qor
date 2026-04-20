import { createMatch, stepMatch } from "./src/engine/match.ts";
import { checkVictory } from "./src/engine/victory.ts";
const state = createMatch("test-seed", "A", "B");
console.log("Initial victory check:", checkVictory(state));
console.log("After 0 steps - state.turn:", state.turn);
const r1 = stepMatch(state, { type: "pass" }, { type: "pass" });
console.log("After 1 step - state.turn:", state.turn, "ended:", r1.ended);
const r2 = stepMatch(state, { type: "pass" }, { type: "pass" });
console.log("After 2 steps - state.turn:", state.turn, "ended:", r2.ended);
