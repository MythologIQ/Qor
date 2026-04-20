import { createMatch } from "./src/engine/match.ts";
const state = createMatch("test-seed", "A", "B");
console.log("turn:", state.turn);
console.log("phase:", state.phase);
console.log("units:", JSON.stringify(state.units, null, 2));
console.log("visible cells:", state.visible.length);
const bUnits = state.units.filter(u => u.owner === "B");
const aUnits = state.units.filter(u => u.owner === "A");
console.log("A units:", aUnits.length, "B units:", bUnits.length);
