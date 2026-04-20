import { createMatch, stepMatch } from "./src/engine/match.ts";
import { checkVictory } from "./src/engine/victory.ts";
const state = createMatch("test-seed", "A", "B");
console.log("Initial state.phase:", state.phase);
console.log("Initial victory:", checkVictory(state));
// Step once
const r1 = stepMatch(state, { type: "pass" }, { type: "pass" });
console.log("After 1 step - phase:", state.phase, "turn:", state.turn, "ended:", r1.ended, "events:", r1.events.map(e => e.type));
console.log("After 1 step victory:", checkVictory(state));
