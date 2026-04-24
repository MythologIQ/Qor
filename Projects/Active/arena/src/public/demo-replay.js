// HexaWars Plan D v2 Phase 6 — Demo Replay
// Pre-baked 12-round sequence demonstrating RoundPlan mechanics.
// Covers: bid-win interrupt, reserve_fired, boosted_ability,
// second_attack, defensive_stance, rushed-shot retarget,
// forced pass with bid burn.

import { projectPublicMatch } from "../projection/public-match.ts";

export const DEMO_MATCH_ID = "demo-siege-at-kestrel-gate";

const ROUND_CAP = 50;
const BASE_TS = Date.UTC(2026, 3, 18, 16, 0, 0);
const STEP_MS = 1100;

// Unit factory
function unit(id, owner, q, r, hp, str, type = "infantry", facing = "N") {
  return { id, owner, position: { q, r, s: -q - r }, hp, strength: str, type, facing };
}

// Board: 9x9 axial hex grid
const BOARD = [
  [-4,0],[-4,1],[-4,2],[-4,3],[-4,4],
  [-3,-1],[-3,0],[-3,1],[-3,2],[-3,3],[-3,4],
  [-2,-2],[-2,-1],[-2,0],[-2,1],[-2,2],[-2,3],[-2,4],
  [-1,-3],[-1,-2],[-1,-1],[-1,0],[-1,1],[-1,2],[-1,3],[-1,4],
  [0,-4],[0,-3],[0,-2],[0,-1],[0,0],[0,1],[0,2],[0,3],[0,4],
  [1,-4],[1,-3],[1,-2],[1,-1],[1,0],[1,1],[1,2],[1,3],[1,4],
  [2,-4],[2,-3],[2,-2],[2,-1],[2,0],[2,1],[2,2],[2,3],[2,4],
  [3,-4],[3,-3],[3,-2],[3,-1],[3,0],[3,1],[3,2],[3,3],[3,4],
  [4,-4],[4,-3],[4,-2],[4,-1],[4,0],[4,1],[4,2],[4,3],[4,4],
];

const TERRAIN = {
  "-4,0":"PLAINS","-4,1":"FOREST","-4,2":"HILLS","-4,3":"PLAINS","-4,4":"FOREST",
  "-3,-1":"HILLS","-3,0":"FOREST","-3,1":"PLAINS","-3,2":"HILLS","-3,3":"FOREST","-3,4":"FOREST",
  "-2,-2":"PLAINS","-2,-1":"PLAINS","-2,0":"FOREST","-2,1":"PLAINS","-2,2":"HILLS","-2,3":"PLAINS","-2,4":"WATER",
  "-1,-3":"PLAINS","-1,-2":"PLAINS","-1,-1":"HILLS","-1,0":"PLAINS","-1,1":"FOREST","-1,2":"PLAINS","-1,3":"MOUNTAIN","-1,4":"WATER",
  "0,-4":"WATER","0,-3":"WATER","0,-2":"PLAINS","0,-1":"HILLS","0,0":"PLAINS","0,1":"PLAINS","0,2":"FOREST","0,3":"HILLS","0,4":"WATER",
  "1,-4":"WATER","1,-3":"PLAINS","1,-2":"FOREST","1,-1":"PLAINS","1,0":"HILLS","1,1":"PLAINS","1,2":"FOREST","1,3":"WATER","1,4":"WATER",
  "2,-4":"WATER","2,-3":"MOUNTAIN","2,-2":"PLAINS","2,-1":"HILLS","2,0":"PLAINS","2,1":"FOREST","2,2":"HILLS","2,3":"WATER","2,4":"WATER",
  "3,-4":"FOREST","3,-3":"PLAINS","3,-2":"HILLS","3,-1":"PLAINS","3,0":"FOREST","3,1":"MOUNTAIN","3,2":"WATER","3,3":"WATER","3,4":"WATER",
  "4,-4":"HILLS","4,-3":"PLAINS","4,-2":"FOREST","4,-1":"PLAINS","4,0":"PLAINS","4,1":"WATER","4,2":"WATER","4,3":"WATER","4,4":"WATER",
};

// R1: Opening — scouts probe, no AP spent
const R1 = {
  turn: 1, phase: "Opening Scan", pressure: 23,
  headline: "Blue Horizon takes the initiative — scout claims center plains.",
  featuredEvent: "Both agents receive 3 AP + 1 free move + 1 free action.",
  territories: { A: 8, B: 7 },
  units: [
    unit("A-captain","A",-3,1,8,5,"captain","E"),
    unit("A-siege","A",-3,2,6,7,"siege","E"),
    unit("A-scout","A",0,0,3,2,"scout","E"),
    unit("A-raider","A",-2,-1,4,4,"raider","E"),
    unit("A-interceptor","A",-2,1,5,4,"interceptor","E"),
    unit("B-captain","B",3,-1,8,5,"captain","W"),
    unit("B-siege","B",3,-2,6,7,"siege","W"),
    unit("B-scout","B",1,-1,3,2,"scout","W"),
    unit("B-raider","B",2,1,4,4,"raider","W"),
    unit("B-interceptor","B",2,-1,5,4,"interceptor","W"),
  ],
  aStatus: "acting", bStatus: "observing",
  aMs: 180, bMs: 205,
  aReason: "Own the center; scout advance wins tempo.",
  bReason: "Mirror the scout; don't cede the center alone.",
  side: "A",
  move: "Blue scout advances to center plains.",
  detail: "A scout takes the initiative.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"A"
  },
  eventTypes: ["round_started", "free_move", "free_action", "round_ended"],
};

// R2: Bid win — Red bids 2 to win resolution priority
const R2 = {
  turn: 2, phase: "Opening Scan", pressure: 25,
  headline: "Red Morrow matches — scout reaches the opposing ridge.",
  featuredEvent: "Bid win: Red bid 2 > Blue bid 1. Red wins resolution priority.",
  territories: { A: 8, B: 8 },
  units: [
    unit("A-captain","A",-3,1,8,5,"captain","E"),
    unit("A-siege","A",-3,2,6,7,"siege","E"),
    unit("A-scout","A",0,0,3,2,"scout","E"),
    unit("A-raider","A",-2,-1,4,4,"raider","E"),
    unit("A-interceptor","A",-2,1,5,4,"interceptor","E"),
    unit("B-captain","B",3,-1,8,5,"captain","W"),
    unit("B-siege","B",3,-2,6,7,"siege","W"),
    unit("B-scout","B",1,0,3,2,"scout","W"),
    unit("B-raider","B",2,1,4,4,"raider","W"),
    unit("B-interceptor","B",2,-1,5,4,"interceptor","W"),
  ],
  aStatus: "observing", bStatus: "acting",
  aMs: 270, bMs: 300,
  aReason: "Hold shape; Red's turn.",
  bReason: "Bid 2 wins priority — strike first.",
  side: "B",
  move: "Red scout advances to center hills.",
  detail: "Bid winner: Red (2 vs 1). Resolution priority: Red.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"A","1,0":"B","2,-1":"B"
  },
  eventTypes: ["round_started", "bid_resolved", "free_move", "free_action", "round_ended"],
};

// R3: boosted_ability — captain sight boost
const R3 = {
  turn: 3, phase: "Posture", pressure: 30,
  headline: "Blue captain activates boosted ability — sight radius extends.",
  featuredEvent: "Blue spends boosted_ability (1 AP). Captain reveals radius-2 zone.",
  territories: { A: 9, B: 8 },
  units: [
    unit("A-captain","A",-2,1,8,5,"captain","E"),
    unit("A-siege","A",-3,2,6,7,"siege","E"),
    unit("A-scout","A",0,0,3,2,"scout","E"),
    unit("A-raider","A",-2,-1,4,4,"raider","E"),
    unit("A-interceptor","A",-2,1,5,4,"interceptor","E"),
    unit("B-captain","B",3,-1,8,5,"captain","W"),
    unit("B-siege","B",3,-2,6,7,"siege","W"),
    unit("B-scout","B",1,0,3,2,"scout","W"),
    unit("B-raider","B",2,1,4,4,"raider","W"),
    unit("B-interceptor","B",2,-1,5,4,"interceptor","W"),
  ],
  aStatus: "acting", bStatus: "observing",
  aMs: 360, bMs: 395,
  aReason: "Boost the captain — vision advantage is decisive early.",
  bReason: "Watch Blue's commit; plan counter.",
  side: "A",
  move: "Blue captain boosts — reveals hidden map section.",
  detail: "boosted_ability: mode=range, radius+1. AP spent: 1.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A","-1,0":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"A","1,0":"B","2,-1":"B"
  },
  eventTypes: ["round_started", "boosted_ability", "free_move", "free_action", "round_ended"],
};

// R4: reserve_overwatch — Red plants overwatch on interceptor
const R4 = {
  turn: 4, phase: "Screen", pressure: 35,
  headline: "Red interceptor plants overwatch — reserve armed for next round.",
  featuredEvent: "Red spends reserve_overwatch (2 AP). Reserve fires on first attack targeting interceptor.",
  territories: { A: 9, B: 9 },
  units: [
    unit("A-captain","A",-2,1,8,5,"captain","E"),
    unit("A-siege","A",-3,2,6,7,"siege","E"),
    unit("A-scout","A",0,0,3,2,"scout","E"),
    unit("A-raider","A",-1,-1,4,4,"raider","E"),
    unit("A-interceptor","A",-2,1,5,4,"interceptor","E"),
    unit("B-captain","B",3,-1,8,5,"captain","W"),
    unit("B-siege","B",3,-2,6,7,"siege","W"),
    unit("B-scout","B",1,0,3,2,"scout","W"),
    unit("B-raider","B",2,1,4,4,"raider","W"),
    unit("B-interceptor","B",1,-1,5,4,"interceptor","W"),
  ],
  aStatus: "observing", bStatus: "acting",
  aMs: 450, bMs: 490,
  aReason: "Hold shape; Red's turn.",
  bReason: "Reserve overwatch on interceptor — punish any attack.",
  side: "B",
  move: "Red interceptor plants overwatch — reserve armed.",
  detail: "reserve_overwatch (2 AP) on B-interceptor. Fires round 5.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A","-1,0":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"A","1,0":"B","2,-1":"B","-1,-1":"A","1,1":"B"
  },
  eventTypes: ["round_started", "reserve_overwatch", "free_move", "free_action", "round_ended"],
};

// R5: reserve_fired — Blue's attack is interrupted by overwatch
const R5 = {
  turn: 5, phase: "Contact", pressure: 44,
  headline: "Overwatch fires — Blue's attack intercepted before it lands.",
  featuredEvent: "reserve_fired: Blue attack on B-interceptor interrupted. wasted_action emitted. No AP refund.",
  territories: { A: 9, B: 10 },
  units: [
    unit("A-captain","A",-2,1,8,5,"captain","E"),
    unit("A-siege","A",-3,2,6,7,"siege","E"),
    unit("A-scout","A",0,0,3,2,"scout","E"),
    unit("A-raider","A",-1,-1,4,4,"raider","E"),
    unit("A-interceptor","A",-2,1,5,4,"interceptor","E"),
    unit("B-captain","B",3,-1,8,5,"captain","W"),
    unit("B-siege","B",3,-2,6,7,"siege","W"),
    unit("B-scout","B",1,0,3,2,"scout","W"),
    unit("B-raider","B",2,1,4,4,"raider","W"),
    unit("B-interceptor","B",1,-1,5,4,"interceptor","W"),
  ],
  aStatus: "acting", bStatus: "observing",
  aMs: 540, bMs: 585,
  aReason: "Attack the interceptor — force the reserve to fire.",
  bReason: "Watch Blue commit into the overwatch.",
  side: "A",
  move: "Blue raider attacks Red interceptor — OVERWATCH INTERRUPT.",
  detail: "reserve_fired: Blue attack on B-interceptor wasted. AP not refunded.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A","-1,0":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"A","1,0":"B","2,-1":"B","-1,-1":"A","1,1":"B","-2,2":"A"
  },
  eventTypes: ["round_started", "reserve_fired", "wasted_action", "free_move", "free_action", "round_ended"],
};

// R6: defensive_stance
const R6 = {
  turn: 6, phase: "Posture", pressure: 48,
  headline: "Blue captain enters defensive stance — +1 STR bonus next round.",
  featuredEvent: "defensive_stance recorded for round 7. AP spent: 1.",
  territories: { A: 10, B: 10 },
  units: [
    unit("A-captain","A",-2,1,8,5,"captain","E"),
    unit("A-siege","A",-2,2,6,7,"siege","E"),
    unit("A-scout","A",0,0,3,2,"scout","E"),
    unit("A-raider","A",-1,-1,4,4,"raider","E"),
    unit("A-interceptor","A",-2,1,5,4,"interceptor","E"),
    unit("B-captain","B",3,-1,8,5,"captain","W"),
    unit("B-siege","B",3,-2,6,7,"siege","W"),
    unit("B-scout","B",1,0,3,2,"scout","W"),
    unit("B-raider","B",1,1,4,4,"raider","W"),
    unit("B-interceptor","B",1,-1,5,4,"interceptor","W"),
  ],
  aStatus: "acting", bStatus: "observing",
  aMs: 630, bMs: 680,
  aReason: "Defensive stance on captain — prepare for next-round clash.",
  bReason: "Watch Blue's commit; plan counter.",
  side: "A",
  move: "Blue captain enters defensive stance.",
  detail: "defensive_stance: captain gets +1 STR on round 7. AP spent: 1.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A","-1,0":"A","-1,-1":"A","-2,2":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"A","1,0":"B","2,-1":"B","1,1":"B","1,-1":"B"
  },
  eventTypes: ["round_started", "defensive_stance", "free_move", "free_action", "round_ended"],
};

// R7: second_attack — captains trade
const R7 = {
  turn: 7, phase: "Captain Clash", pressure: 56,
  headline: "Second attack volleys — both captains trade heavy blows.",
  featuredEvent: "second_attack: both sides spend 2 AP. Captains exchange at full STR.",
  territories: { A: 10, B: 11 },
  units: [
    unit("A-captain","A",-1,1,6,5,"captain","E"),
    unit("A-siege","A",-2,2,6,7,"siege","E"),
    unit("A-scout","A",0,0,3,2,"scout","E"),
    unit("A-raider","A",-1,-1,4,4,"raider","E"),
    unit("A-interceptor","A",-2,1,5,4,"interceptor","E"),
    unit("B-captain","B",2,-1,6,5,"captain","W"),
    unit("B-siege","B",3,-2,6,7,"siege","W"),
    unit("B-scout","B",1,0,3,2,"scout","W"),
    unit("B-raider","B",1,1,4,4,"raider","W"),
    unit("B-interceptor","B",1,-1,5,4,"interceptor","W"),
  ],
  aStatus: "acting", bStatus: "observing",
  aMs: 720, bMs: 775,
  aReason: "Second attack trades evenly — pressure Red.",
  bReason: "Match the second attack — captains trade cleanly.",
  side: "A",
  move: "Blue captain fires second attack — full STR damage.",
  detail: "second_attack (2 AP) from Blue captain. Defender retaliation applied. Both captains: 8→6 HP.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A","-1,0":"A","-1,-1":"A","-2,2":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"A","1,0":"B","2,-1":"B","1,1":"B","1,-1":"B","0,1":"A"
  },
  eventTypes: ["round_started", "second_attack", "unit_attacked", "round_ended"],
};

// R8: action_retargeted — rushed shot
const R8 = {
  turn: 8, phase: "Engagement", pressure: 61,
  headline: "Target displaced — rushed shot retargets the nearest enemy.",
  featuredEvent: "action_retargeted: original target gone. Nearest enemy in range: B-scout. rushed_shot damage = floor(4/2)=2.",
  territories: { A: 10, B: 11 },
  units: [
    unit("A-captain","A",-1,1,6,5,"captain","E"),
    unit("A-siege","A",-1,2,6,7,"siege","E"),
    unit("A-scout","A",0,0,3,2,"scout","E"),
    unit("A-raider","A",0,-1,4,4,"raider","E"),
    unit("A-interceptor","A",-2,1,5,4,"interceptor","E"),
    unit("B-captain","B",2,-1,6,5,"captain","W"),
    unit("B-siege","B",3,-2,6,7,"siege","W"),
    unit("B-scout","B",1,0,2,2,"scout","W"),
    unit("B-raider","B",1,1,4,4,"raider","W"),
    unit("B-interceptor","B",1,-1,5,4,"interceptor","W"),
  ],
  aStatus: "acting", bStatus: "observing",
  aMs: 810, bMs: 865,
  aReason: "Attack the captain — it moved into range.",
  bReason: "Watch Blue's commit; plan counter.",
  side: "A",
  move: "Blue raider attacks — TARGET MOVED. Rushed shot retargets B-scout.",
  detail: "action_retargeted: originalTarget=(2,-1), actualTarget=(1,0), damage=2, reason=rushed_shot.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A","-1,0":"A","-1,-1":"A","-2,2":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"A","1,0":"B","2,-1":"B","1,1":"B","1,-1":"B","0,1":"A","0,-1":"A"
  },
  eventTypes: ["round_started", "action_retargeted", "free_move", "free_action", "round_ended"],
};

// R9: plan_rejected — invalid plan, bid burn
const R9 = {
  turn: 9, phase: "Breach", pressure: 65,
  headline: "Blue's plan rejected — bid burn enforces initiative integrity.",
  featuredEvent: "Invalid plan from Blue. Original bid (3) burned. Forced pass issued. AP not refunded.",
  territories: { A: 10, B: 12 },
  units: [
    unit("A-captain","A",-1,1,6,5,"captain","E"),
    unit("A-siege","A",-1,2,6,7,"siege","E"),
    unit("A-scout","A",0,0,3,2,"scout","E"),
    unit("A-raider","A",0,-1,4,4,"raider","E"),
    unit("A-interceptor","A",-2,1,5,4,"interceptor","E"),
    unit("B-captain","B",2,-1,6,5,"captain","W"),
    unit("B-siege","B",2,-2,6,7,"siege","W"),
    unit("B-scout","B",1,0,2,2,"scout","W"),
    unit("B-raider","B",1,1,4,4,"raider","W"),
    unit("B-interceptor","B",1,-1,5,4,"interceptor","W"),
  ],
  aStatus: "acting", bStatus: "observing",
  aMs: 900, bMs: 955,
  aReason: "Plan looks valid — this round tests bid burn enforcement.",
  bReason: "Watch Blue's commit; plan counter.",
  side: "A",
  move: "Blue plan rejected — invalid action in plan.",
  detail: "plan_rejected: agent=A, reason=out_of_range, originalBid=3, apBurned=3. Forced pass.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A","-1,0":"A","-1,-1":"A","-2,2":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"A","1,0":"B","2,-1":"B","1,1":"B","1,-1":"B","0,1":"A","0,-1":"A","1,-2":"B"
  },
  eventTypes: ["round_started", "plan_rejected", "round_ended"],
};

// R10: second_attack eliminates scout
const R10 = {
  turn: 10, phase: "Consolidation", pressure: 55,
  headline: "Red siege lands a second attack — Blue scout eliminated.",
  featuredEvent: "second_attack (2 AP) from Red siege. Scout HP 3→0. unit_destroyed.",
  territories: { A: 9, B: 12 },
  units: [
    unit("A-captain","A",-1,1,6,5,"captain","E"),
    unit("A-siege","A",-1,2,6,7,"siege","E"),
    unit("A-raider","A",0,-1,4,4,"raider","E"),
    unit("A-interceptor","A",-2,1,5,4,"interceptor","E"),
    unit("B-captain","B",2,-1,6,5,"captain","W"),
    unit("B-siege","B",2,-2,6,7,"siege","W"),
    unit("B-scout","B",1,0,2,2,"scout","W"),
    unit("B-raider","B",1,1,4,4,"raider","W"),
    unit("B-interceptor","B",1,-1,5,4,"interceptor","W"),
  ],
  aStatus: "observing", bStatus: "acting",
  aMs: 990, bMs: 1045,
  aReason: "Hold shape; Red's turn.",
  bReason: "Second attack on scout — eliminate it.",
  side: "B",
  move: "Red siege fires second attack — Blue scout destroyed.",
  detail: "second_attack (2 AP). unit_destroyed: A-scout. AP spent: 2.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A","-1,0":"A","-1,-1":"A","-2,2":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"A","1,0":"B","2,-1":"B","1,1":"B","1,-1":"B","0,1":"A","0,-1":"A","1,-2":"B"
  },
  eventTypes: ["round_started", "second_attack", "unit_destroyed", "round_ended"],
};

// R11: boosted_ability damage mode on siege
const R11 = {
  turn: 11, phase: "Siege War", pressure: 60,
  headline: "Blue siege activates boosted ability — damage amplified.",
  featuredEvent: "boosted_ability: mode=damage, siege damage +1. AP spent: 1.",
  territories: { A: 10, B: 12 },
  units: [
    unit("A-captain","A",-1,1,6,5,"captain","E"),
    unit("A-siege","A",0,1,6,7,"siege","E"),
    unit("A-raider","A",0,-1,4,4,"raider","E"),
    unit("A-interceptor","A",-2,1,5,4,"interceptor","E"),
    unit("B-captain","B",2,-1,6,5,"captain","W"),
    unit("B-siege","B",2,-2,6,7,"siege","W"),
    unit("B-scout","B",1,0,2,2,"scout","W"),
    unit("B-raider","B",1,1,4,4,"raider","W"),
    unit("B-interceptor","B",1,-1,5,4,"interceptor","W"),
  ],
  aStatus: "acting", bStatus: "observing",
  aMs: 1080, bMs: 1135,
  aReason: "Boost the siege — amplify damage on Red's siege.",
  bReason: "Watch Blue's commit; plan counter.",
  side: "A",
  move: "Blue siege boosts — damage +1 for this attack.",
  detail: "boosted_ability: mode=damage, siege STR+1 for this action. AP spent: 1.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A","-1,0":"A","-1,-1":"A","-2,2":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"A","1,0":"B","2,-1":"B","1,1":"B","1,-1":"B","0,1":"A","0,-1":"A","1,-2":"B","-1,2":"A"
  },
  eventTypes: ["round_started", "boosted_ability", "free_move", "free_action", "round_ended"],
};

// R12: Decisive — both sides commit all AP
const R12 = {
  turn: 12, phase: "Decisive", pressure: 70,
  headline: "Final exchanges — Blue claims the center and the match tilts.",
  featuredEvent: "Both agents spend 3+ AP. Blue siege attacks Red captain at boosted damage.",
  territories: { A: 11, B: 11 },
  units: [
    unit("A-captain","A",0,1,6,5,"captain","E"),
    unit("A-siege","A",1,-1,5,7,"siege","E"),
    unit("A-raider","A",0,-1,4,4,"raider","E"),
    unit("B-captain","B",1,-1,5,5,"captain","W"),
    unit("B-siege","B",2,-2,6,7,"siege","W"),
    unit("B-raider","B",0,0,3,4,"raider","W"),
    unit("B-interceptor","B",1,-1,4,4,"interceptor","W"),
  ],
  aStatus: "acting", bStatus: "observing",
  aMs: 1170, bMs: 1225,
  aReason: "All-in: boosted siege + second attack on captain.",
  bReason: "Counter with raider strike on interceptor.",
  side: "A",
  move: "Blue siege boosted attack on Red captain — 8 damage.",
  detail: "Boosted siege attack (mode=damage). Captain: 6→5 HP. Defender retaliation: 5→4 HP.",
  control: {
    "-3,0":"A","-3,1":"A","-3,2":"A","-3,3":"A",
    "-2,-1":"A","-2,0":"A","-2,1":"A","-1,0":"A","-1,-1":"A","-2,2":"A",
    "2,0":"B","2,1":"B","3,-3":"B","3,-2":"B","3,-1":"B","3,0":"B",
    "0,0":"B","1,0":"B","2,-1":"B","1,1":"B","1,-1":"B","0,1":"A","0,-1":"A","1,-2":"B","-1,2":"A","1,-1":"A"
  },
  eventTypes: ["round_started", "boosted_ability", "second_attack", "unit_attacked", "round_ended"],
};

const ROUNDS = [R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12];

function buildBoardCells() {
  return BOARD.map(([q, r]) => ({
    q, r, s: -q - r,
    terrain: TERRAIN[`${q},${r}`] ?? "PLAINS",
    controlledBy: null,
  }));
}

function buildProjection(step, index, outcome = null) {
  const boardCells = buildBoardCells();
  return projectPublicMatch({
    matchId: DEMO_MATCH_ID,
    mode: "demo",
    round: step.turn,
    roundCap: ROUND_CAP,
    phase: step.phase,
    pressure: step.pressure,
    headline: step.headline,
    featuredEvent: step.featuredEvent,
    board: boardCells,
    units: step.units.map((u) => ({
      id: u.id,
      side: u.owner,
      q: u.position.q,
      r: u.position.r,
      s: u.position.s,
      hp: u.hp,
      strength: u.strength,
      type: u.type,
      facing: u.facing,
    })),
    territories: step.territories,
    agents: [
      {
        id: "demo_blue_horizon",
        side: "A",
        status: step.aStatus,
        invalidCount: step.aReason.includes("rejected") ? 1 : 0,
        totalMs: step.aMs,
        totalActions: Math.max(1, Math.round(step.aMs / 120)),
        modelId: "minimax/m2.7",
        operator: "Blue Horizon",
      },
      {
        id: "demo_red_morrow",
        side: "B",
        status: step.bStatus,
        invalidCount: 0,
        totalMs: step.bMs,
        totalActions: Math.max(1, Math.round(step.bMs / 135)),
        modelId: "minimax/m2.7",
        operator: "Red Morrow",
      },
    ],
    reasoning: [
      { agentId: "demo_blue_horizon", side: "A", text: `Round ${step.turn}: ${step.aReason}` },
      { agentId: "demo_red_morrow", side: "B", text: `Round ${step.turn}: ${step.bReason}` },
    ],
    feed: [{
      round: step.turn,
      side: step.side,
      kind: step.move.toLowerCase().includes("attack") || step.move.includes("strike") ? "attack"
        : step.move.toLowerCase().includes("advance") || step.move.toLowerCase().includes("move") ? "move"
        : "system",
      headline: step.move,
      detail: step.detail,
      timestamp: BASE_TS + 1000 + index * STEP_MS,
    }],
    outcome,
  });
}

function buildEvent(step, index) {
  return {
    round: step.turn,
    side: step.side,
    kind: step.move.toLowerCase().includes("attack") || step.move.includes("strike") ? "attack"
      : step.move.toLowerCase().includes("advance") || step.move.toLowerCase().includes("move") ? "move"
      : "system",
    headline: step.move,
    detail: step.detail,
    timestamp: BASE_TS + 1000 + index * STEP_MS,
  };
}

export function buildDemoFrames() {
  const frames = [{
    type: "MATCH_HELLO",
    mode: "demo",
    matchId: DEMO_MATCH_ID,
    projection: buildProjection(ROUNDS[0], 0),
  }];

  ROUNDS.forEach((step, index) => {
    const projection = buildProjection(step, index);
    if (index > 0) {
      frames.push({ type: "MATCH_STATE", mode: "demo", matchId: DEMO_MATCH_ID, projection });
    }
    frames.push({ type: "MATCH_EVENT", mode: "demo", matchId: DEMO_MATCH_ID, event: buildEvent(step, index), projection });
  });

  const outcome = { winner: "A", reason: "territory_control" };
  frames.push({
    type: "MATCH_END",
    mode: "demo",
    matchId: DEMO_MATCH_ID,
    outcome,
    projection: buildProjection(ROUNDS.at(-1), ROUNDS.length - 1, outcome),
  });

  return frames;
}

export function playDemoReplay(handlers = {}, opts = {}) {
  const frames = buildDemoFrames();
  const stepMs = opts.stepMs ?? STEP_MS;
  let index = 0;
  let paused = false;
  let timer = null;

  const emit = () => {
    if (paused || index >= frames.length) return;
    const frame = frames[index++];
    handlers.onFrame?.(frame, { index, total: frames.length });
    const t = frame?.type;
    if (t === "MATCH_HELLO") handlers.onHello?.(frame);
    if (t === "MATCH_STATE") handlers.onState?.(frame);
    if (t === "MATCH_EVENT") handlers.onEvent?.(frame);
    if (t === "MATCH_END") handlers.onEnd?.(frame);
    if (index < frames.length && !paused) timer = setTimeout(emit, stepMs);
  };

  timer = setTimeout(emit, 60);

  return {
    disconnect() { paused = true; clearTimeout(timer); },
    pause() { paused = true; clearTimeout(timer); },
    resume() { if (!paused) return; paused = false; emit(); },
    restart() { paused = false; index = 0; emit(); },
    getFrames() { return frames; },
    getStepMs() { return stepMs; },
  };
}