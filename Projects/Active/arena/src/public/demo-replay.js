export const DEMO_MATCH_ID = "demo-siege-at-kestrel-gate";

const TURN_CAP = 18;
const BASE_TS = Date.UTC(2026, 3, 18, 16, 0, 0);
const STEP_MS = 1350;

function cell(q, r, terrain, control = null) {
  return { coord: { q, r, s: -q - r }, terrain, control };
}

function unit(id, owner, q, r, hp, strength, type = "infantry", facing = "N") {
  return {
    id,
    owner,
    position: { q, r, s: -q - r },
    hp,
    strength,
    type,
    facing,
  };
}

function board(cells) {
  return cells.map(([q, r, terrain, control]) => cell(q, r, terrain, control ?? null));
}

const BOARD = board([
  [-3, 0, "FOREST", "A"],
  [-3, 1, "PLAINS", "A"],
  [-3, 2, "HILLS", "A"],
  [-3, 3, "FOREST", "A"],
  [-2, -1, "PLAINS", "A"],
  [-2, 0, "FOREST", "A"],
  [-2, 1, "PLAINS", "A"],
  [-2, 2, "HILLS", null],
  [-2, 3, "PLAINS", null],
  [-1, -2, "PLAINS", null],
  [-1, -1, "HILLS", null],
  [-1, 0, "PLAINS", null],
  [-1, 1, "FOREST", null],
  [-1, 2, "PLAINS", null],
  [-1, 3, "MOUNTAIN", null],
  [0, -3, "WATER", null],
  [0, -2, "PLAINS", null],
  [0, -1, "HILLS", null],
  [0, 0, "PLAINS", null],
  [0, 1, "PLAINS", null],
  [0, 2, "FOREST", null],
  [0, 3, "HILLS", "B"],
  [1, -3, "PLAINS", null],
  [1, -2, "FOREST", null],
  [1, -1, "PLAINS", null],
  [1, 0, "HILLS", null],
  [1, 1, "PLAINS", null],
  [1, 2, "FOREST", null],
  [2, -3, "MOUNTAIN", null],
  [2, -2, "PLAINS", null],
  [2, -1, "HILLS", null],
  [2, 0, "PLAINS", "B"],
  [2, 1, "FOREST", "B"],
  [3, -3, "PLAINS", "B"],
  [3, -2, "HILLS", "B"],
  [3, -1, "PLAINS", "B"],
  [3, 0, "FOREST", "B"],
]);

function buildBoard(controlMap = {}) {
  return BOARD.map((tile) => {
    const key = `${tile.coord.q},${tile.coord.r}`;
    return {
      ...tile,
      control: key in controlMap ? controlMap[key] : tile.control,
    };
  });
}

function agents(aStatus, bStatus, aMs, bMs, aModel = "minimax/m2.7", bModel = "minimax/m2.7") {
  return [
    {
      id: "demo_blue_horizon",
      side: "A",
      status: aStatus,
      invalidCount: 0,
      totalMs: aMs,
      totalActions: Math.max(1, Math.round(aMs / 120)),
      modelId: aModel,
      operator: "Blue Horizon",
    },
    {
      id: "demo_red_morrow",
      side: "B",
      status: bStatus,
      invalidCount: 1,
      totalMs: bMs,
      totalActions: Math.max(1, Math.round(bMs / 135)),
      modelId: bModel,
      operator: "Red Morrow",
    },
  ];
}

function reasoning(turn, aText, bText) {
  return [
    {
      agentId: "demo_red_morrow",
      side: "B",
      reasoning: `Turn ${turn}: ${bText}`,
    },
    {
      agentId: "demo_blue_horizon",
      side: "A",
      reasoning: `Turn ${turn}: ${aText}`,
    },
  ];
}

function event(turn, side, move, offsetMs, detail = "") {
  return {
    turn,
    side,
    move,
    detail,
    timestamp: BASE_TS + offsetMs,
  };
}

function state(step) {
  return {
    board: buildBoard(step.control),
    territories: step.territories,
    turn: step.turn,
    turnCap: TURN_CAP,
    units: step.units,
    agents: agents(
      step.aStatus,
      step.bStatus,
      step.aMs,
      step.bMs,
      step.aModel,
      step.bModel,
    ),
    reasoning: reasoning(step.turn, step.aReason, step.bReason),
    headline: step.headline,
    phase: step.phase,
    pressure: step.pressure,
    featuredEvent: step.featuredEvent,
  };
}

const STEPS = [
  {
    turn: 1,
    phase: "Opening Scan",
    pressure: 22,
    headline: "Scouts fan out while both heavies anchor the ridge line.",
    featuredEvent: "Blue probes the center while Red guards the high ground.",
    territories: { A: 6, B: 6 },
    units: [
      unit("A-1", "A", -2, 1, 7, 7, "captain", "E"),
      unit("A-2", "A", -1, 1, 5, 5, "scout", "NE"),
      unit("A-3", "A", -2, 0, 6, 6, "lancer", "E"),
      unit("B-1", "B", 2, -1, 7, 7, "captain", "W"),
      unit("B-2", "B", 1, -1, 5, 5, "scout", "SW"),
      unit("B-3", "B", 2, 0, 6, 6, "lancer", "W"),
    ],
    aStatus: "mapping central routes",
    bStatus: "screening for feints",
    aMs: 180,
    bMs: 205,
    aReason: "Hold the captain back and let the scout claim first contact.",
    bReason: "Do not chase center yet; make Blue reveal the real lane.",
    event: event(1, "A", "Blue scout cuts through the central ridge.", 1000, "No contact yet, but center tempo swings blue."),
    control: { "-1,0": "A", "0,0": "A", "1,0": null },
  },
  {
    turn: 2,
    phase: "Pressure Build",
    pressure: 31,
    headline: "Red mirrors the line and threatens a pincer from the east.",
    featuredEvent: "First contested ridge hex flips back to neutral.",
    territories: { A: 7, B: 6 },
    units: [
      unit("A-1", "A", -2, 1, 7, 7, "captain", "E"),
      unit("A-2", "A", -1, 0, 5, 5, "scout", "E"),
      unit("A-3", "A", -1, 1, 6, 6, "lancer", "NE"),
      unit("B-1", "B", 2, -1, 7, 7, "captain", "W"),
      unit("B-2", "B", 1, 0, 5, 5, "scout", "W"),
      unit("B-3", "B", 2, 0, 6, 6, "lancer", "NW"),
    ],
    aStatus: "occupying ridge",
    bStatus: "setting crossfire",
    aMs: 360,
    bMs: 398,
    aReason: "The ridge matters more than damage at this stage.",
    bReason: "Touch the same lane and make Blue choose between both units.",
    event: event(2, "B", "Red scout snaps the ridge back to neutral.", 2400, "Two scouts now contest the same lane."),
    control: { "-1,0": "A", "0,0": null, "1,0": "B" },
  },
  {
    turn: 3,
    phase: "First Contact",
    pressure: 42,
    headline: "Both scouts trade in the center and expose the heavies behind them.",
    featuredEvent: "The first strike lands and the crowd finally gets a fight.",
    territories: { A: 7, B: 7 },
    units: [
      unit("A-1", "A", -1, 1, 7, 7, "captain", "E"),
      unit("A-2", "A", 0, 0, 3, 5, "scout", "E"),
      unit("A-3", "A", -1, 0, 6, 6, "lancer", "NE"),
      unit("B-1", "B", 2, -1, 7, 7, "captain", "W"),
      unit("B-2", "B", 1, 0, 2, 5, "scout", "W"),
      unit("B-3", "B", 1, -1, 6, 6, "lancer", "NW"),
    ],
    aStatus: "absorbing contact",
    bStatus: "forcing exchange",
    aMs: 590,
    bMs: 645,
    aReason: "My scout survives just long enough to pin the lancer.",
    bReason: "Force the trade while Blue's captain is a step short.",
    event: event(3, "B", "Red lancer spikes the center and bloodies the scout.", 3800, "Blue keeps position but loses hit points."),
    control: { "-1,0": "A", "0,0": null, "1,0": "B", "1,-1": "B" },
  },
  {
    turn: 4,
    phase: "Counter Swing",
    pressure: 51,
    headline: "Blue captain crashes into midboard and stabilizes the lane.",
    featuredEvent: "The first captain commit turns the replay from setup into battle.",
    territories: { A: 8, B: 7 },
    units: [
      unit("A-1", "A", 0, 0, 6, 7, "captain", "E"),
      unit("A-2", "A", 0, 1, 3, 5, "scout", "NE"),
      unit("A-3", "A", -1, 0, 5, 6, "lancer", "E"),
      unit("B-1", "B", 2, -1, 7, 7, "captain", "W"),
      unit("B-2", "B", 1, 0, 2, 5, "scout", "SW"),
      unit("B-3", "B", 1, -1, 3, 6, "lancer", "W"),
    ],
    aStatus: "reclaiming center",
    bStatus: "bracing front",
    aMs: 790,
    bMs: 812,
    aReason: "If the captain reaches center now, the whole map tilts.",
    bReason: "Don't give the ridge for free; hold until reinforcements arrive.",
    event: event(4, "A", "Blue captain slams onto the ridge and resets the fight.", 5200, "Red's lancer is suddenly exposed."),
    control: { "-1,0": "A", "0,0": "A", "0,1": "A", "1,0": null },
  },
  {
    turn: 5,
    phase: "Line Break",
    pressure: 58,
    headline: "Blue converts the center hold into a right-flank break.",
    featuredEvent: "Red's scout is forced off the board edge and control starts snowballing.",
    territories: { A: 9, B: 6 },
    units: [
      unit("A-1", "A", 1, 0, 6, 7, "captain", "E"),
      unit("A-2", "A", 0, 1, 3, 5, "scout", "N"),
      unit("A-3", "A", 0, 0, 5, 6, "lancer", "E"),
      unit("B-1", "B", 2, -1, 6, 7, "captain", "W"),
      unit("B-3", "B", 1, -1, 2, 6, "lancer", "SW"),
    ],
    aStatus: "rolling the edge",
    bStatus: "triaging losses",
    aMs: 980,
    bMs: 1040,
    aReason: "Don't chase the scout; take the lane and let the board pay me.",
    bReason: "Captain must cover the collapse before all outer control is lost.",
    event: event(5, "A", "Blue lancer catches the red scout retreating through open ground.", 6600, "First elimination of the match."),
    control: { "-1,0": "A", "0,0": "A", "0,1": "A", "1,0": "A", "2,0": "B" },
  },
  {
    turn: 6,
    phase: "Counter Battery",
    pressure: 63,
    headline: "Red captain answers with a sharp hit that reopens the center.",
    featuredEvent: "Momentum swings back just enough to keep the match alive.",
    territories: { A: 9, B: 7 },
    units: [
      unit("A-1", "A", 1, 0, 4, 7, "captain", "E"),
      unit("A-2", "A", 0, 1, 3, 5, "scout", "N"),
      unit("A-3", "A", 0, 0, 5, 6, "lancer", "E"),
      unit("B-1", "B", 1, -1, 4, 7, "captain", "W"),
      unit("B-3", "B", 1, 0, 2, 6, "lancer", "NW"),
    ],
    aStatus: "holding after impact",
    bStatus: "re-entering center",
    aMs: 1200,
    bMs: 1245,
    aReason: "Take the hit if it keeps my scout free to expand control north.",
    bReason: "Center is still the only square that matters.",
    event: event(6, "B", "Red captain drives Blue back and cracks the center open.", 8000, "The lane is contested again."),
    control: { "-1,0": "A", "0,0": null, "0,1": "A", "1,0": null, "1,-1": "B" },
  },
  {
    turn: 7,
    phase: "Fog Raid",
    pressure: 68,
    headline: "Blue scout vanishes north and flips an unattended hill cluster.",
    featuredEvent: "The scoreboard spikes while the fight stays unresolved.",
    territories: { A: 11, B: 7 },
    units: [
      unit("A-1", "A", 1, 0, 4, 7, "captain", "E"),
      unit("A-2", "A", -1, 2, 3, 5, "scout", "E"),
      unit("A-3", "A", 0, 0, 5, 6, "lancer", "NE"),
      unit("B-1", "B", 1, -1, 4, 7, "captain", "W"),
      unit("B-3", "B", 1, 0, 2, 6, "lancer", "W"),
    ],
    aStatus: "harvesting outer ring",
    bStatus: "late to rotate",
    aMs: 1390,
    bMs: 1472,
    aReason: "Make Red choose between the scoreboard and the fight.",
    bReason: "Ignore the raid one more turn and the map is gone.",
    event: event(7, "A", "Blue scout slips into fog and steals the northern hills.", 9400, "A quiet move with loud scoreboard consequences."),
    control: { "-2,2": "A", "-2,3": "A", "-1,2": "A", "0,0": null, "1,0": null, "1,-1": "B" },
  },
  {
    turn: 8,
    phase: "Split Decision",
    pressure: 72,
    headline: "Red sends the lancer north, conceding central damage for territorial survival.",
    featuredEvent: "The chase creates two separate theaters on a single tiny map.",
    territories: { A: 11, B: 8 },
    units: [
      unit("A-1", "A", 1, 0, 4, 7, "captain", "E"),
      unit("A-2", "A", -1, 2, 3, 5, "scout", "S"),
      unit("A-3", "A", 0, 0, 5, 6, "lancer", "E"),
      unit("B-1", "B", 1, -1, 4, 7, "captain", "W"),
      unit("B-3", "B", 0, 1, 2, 6, "lancer", "NW"),
    ],
    aStatus: "holding two fronts",
    bStatus: "chasing raid unit",
    aMs: 1605,
    bMs: 1710,
    aReason: "If Red peels off, the captain gets center uncontested.",
    bReason: "The scoreboard leak is now worse than the lane fight.",
    event: event(8, "B", "Red lancer peels north to stop the hill raid.", 10800, "Center and north become separate fights."),
    control: { "-2,2": "A", "-2,3": "A", "-1,2": "A", "0,0": "A", "1,0": null, "1,-1": "B" },
  },
  {
    turn: 9,
    phase: "Execution Window",
    pressure: 78,
    headline: "Blue captain finds the isolated red lancer and punishes the split.",
    featuredEvent: "Red's map-saving rotation costs too much material.",
    territories: { A: 12, B: 7 },
    units: [
      unit("A-1", "A", 1, -1, 4, 7, "captain", "SE"),
      unit("A-2", "A", -1, 2, 3, 5, "scout", "S"),
      unit("A-3", "A", 0, 0, 5, 6, "lancer", "E"),
      unit("B-1", "B", 1, -2, 2, 7, "captain", "W"),
      unit("B-3", "B", 0, 1, 1, 6, "lancer", "NW"),
    ],
    aStatus: "isolating red core",
    bStatus: "scrambling retreat",
    aMs: 1825,
    bMs: 1910,
    aReason: "Hit the captain now before the northern unit reconnects.",
    bReason: "One precise retreat still keeps this alive.",
    event: event(9, "A", "Blue captain cuts inside and nearly deletes the red core.", 12200, "A clean punish on the split defense."),
    control: { "-2,2": "A", "-2,3": "A", "-1,2": "A", "0,0": "A", "1,-1": "A", "1,0": "A" },
  },
  {
    turn: 10,
    phase: "Last Stand",
    pressure: 82,
    headline: "Red survives the swing and turns the north chase into a knife fight.",
    featuredEvent: "The replay peaks here instead of ending on the first kill.",
    territories: { A: 12, B: 8 },
    units: [
      unit("A-1", "A", 1, -1, 3, 7, "captain", "E"),
      unit("A-2", "A", -1, 1, 1, 5, "scout", "S"),
      unit("A-3", "A", 0, 0, 5, 6, "lancer", "NE"),
      unit("B-1", "B", 1, -2, 2, 7, "captain", "W"),
      unit("B-3", "B", -1, 2, 1, 6, "lancer", "W"),
    ],
    aStatus: "low-hp conversion",
    bStatus: "contesting in extremis",
    aMs: 2050,
    bMs: 2144,
    aReason: "The scout can die if the flank stays blue.",
    bReason: "Kill the scout, stall the bleed, and maybe steal one more fight.",
    event: event(10, "B", "Red lancer catches the raiding scout in the hills.", 13600, "Blue keeps the land but loses the raider."),
    control: { "-2,2": "A", "-2,3": "A", "-1,2": null, "0,0": "A", "1,-1": "A", "1,0": "A" },
  },
  {
    turn: 11,
    phase: "Collapse",
    pressure: 86,
    headline: "Blue cashes the map lead into a measured encirclement.",
    featuredEvent: "Red is alive on pieces, but dead on space.",
    territories: { A: 13, B: 7 },
    units: [
      unit("A-1", "A", 1, -1, 3, 7, "captain", "E"),
      unit("A-3", "A", 1, 0, 5, 6, "lancer", "E"),
      unit("B-1", "B", 1, -2, 2, 7, "captain", "W"),
      unit("B-3", "B", -1, 2, 1, 6, "lancer", "W"),
    ],
    aStatus: "closing perimeter",
    bStatus: "looking for escape hex",
    aMs: 2262,
    bMs: 2358,
    aReason: "No heroics. Just close exits and let the score climb.",
    bReason: "Need one breakthrough lane or the next four turns are automatic.",
    event: event(11, "A", "Blue rotates the lancer behind Red and seals the southern exits.", 15000, "Red's captain is boxed in."),
    control: { "-2,2": "A", "-2,3": "A", "-1,2": "A", "0,0": "A", "1,-1": "A", "1,0": "A", "2,-1": "A" },
  },
  {
    turn: 12,
    phase: "Cut Off",
    pressure: 89,
    headline: "Red loses the final open lane and the board starts paying out relentlessly.",
    featuredEvent: "This is the point where spectators can feel the inevitability.",
    territories: { A: 14, B: 6 },
    units: [
      unit("A-1", "A", 2, -1, 3, 7, "captain", "E"),
      unit("A-3", "A", 1, 0, 5, 6, "lancer", "NE"),
      unit("B-1", "B", 1, -2, 1, 7, "captain", "W"),
      unit("B-3", "B", -1, 2, 1, 6, "lancer", "S"),
    ],
    aStatus: "locking exits",
    bStatus: "desperation routing",
    aMs: 2470,
    bMs: 2588,
    aReason: "One last advance and the captain can never reconnect to the map.",
    bReason: "I'm playing for a miracle fork now.",
    event: event(12, "A", "Blue captain takes the last contested hill and shuts the trap.", 16400, "Red is one tempo from collapse."),
    control: { "-2,2": "A", "-2,3": "A", "-1,2": "A", "0,0": "A", "1,-1": "A", "1,0": "A", "2,-1": "A", "2,0": "A" },
  },
  {
    turn: 13,
    phase: "Final Clash",
    pressure: 93,
    headline: "Red throws the captain into a doomed charge just to break the monotony.",
    featuredEvent: "The last direct collision lands with almost no strategic upside.",
    territories: { A: 14, B: 5 },
    units: [
      unit("A-1", "A", 2, -1, 2, 7, "captain", "E"),
      unit("A-3", "A", 1, 0, 4, 6, "lancer", "NE"),
      unit("B-1", "B", 2, -2, 1, 7, "captain", "SW"),
      unit("B-3", "B", -1, 2, 1, 6, "lancer", "S"),
    ],
    aStatus: "absorbing last charge",
    bStatus: "all-in strike",
    aMs: 2690,
    bMs: 2815,
    aReason: "Trade hit points if it means the laddered score keeps ticking.",
    bReason: "Only a knockout changes the result now.",
    event: event(13, "B", "Red captain lunges downhill for one final clash.", 17800, "Spectacular, but strategically empty."),
    control: { "-2,2": "A", "-2,3": "A", "-1,2": "A", "0,0": "A", "1,-1": "A", "1,0": "A", "2,-1": "A", "2,0": "A", "3,-1": "A" },
  },
  {
    turn: 14,
    phase: "Sweep",
    pressure: 95,
    headline: "Blue survives the charge and answers with a clean removal.",
    featuredEvent: "The last meaningful red piece comes off the board.",
    territories: { A: 15, B: 4 },
    units: [
      unit("A-1", "A", 2, -1, 2, 7, "captain", "SE"),
      unit("A-3", "A", 2, -2, 4, 6, "lancer", "E"),
      unit("B-3", "B", -1, 2, 1, 6, "lancer", "S"),
    ],
    aStatus: "sweeping survivors",
    bStatus: "single unit left",
    aMs: 2908,
    bMs: 3040,
    aReason: "Remove the captain and there is no comeback line left.",
    bReason: "Only the northern lancer remains, and it's nowhere near the score.",
    event: event(14, "A", "Blue lancer finishes the exposed red captain.", 19200, "The result is functionally sealed."),
    control: { "-2,2": "A", "-2,3": "A", "-1,2": "A", "0,0": "A", "1,-1": "A", "1,0": "A", "2,-1": "A", "2,0": "A", "3,-1": "A", "3,0": "A" },
  },
  {
    turn: 15,
    phase: "Runout",
    pressure: 91,
    headline: "Red's last lancer keeps moving, but the board has already been lost.",
    featuredEvent: "The ending now reads as domination rather than a lucky finish.",
    territories: { A: 16, B: 3 },
    units: [
      unit("A-1", "A", 2, -1, 2, 7, "captain", "SE"),
      unit("A-3", "A", 2, -2, 4, 6, "lancer", "E"),
      unit("B-3", "B", -2, 3, 1, 6, "lancer", "W"),
    ],
    aStatus: "coasting on lead",
    bStatus: "evading only",
    aMs: 3115,
    bMs: 3240,
    aReason: "Do not chase. Keep acquiring space and let the clock work.",
    bReason: "Survival is all that remains.",
    event: event(15, "A", "Blue ignores the survivor and captures the outer ring.", 20600, "The score gap turns terminal."),
    control: { "-3,2": "A", "-2,2": "A", "-2,3": "A", "-1,2": "A", "0,0": "A", "1,-1": "A", "1,0": "A", "2,-1": "A", "2,0": "A", "3,-1": "A", "3,0": "A" },
  },
  {
    turn: 16,
    phase: "Endgame Seal",
    pressure: 84,
    headline: "Blue seals Kestrel Gate and leaves Red with no legal route to parity.",
    featuredEvent: "The crowd sees the finish two turns before the engine calls it.",
    territories: { A: 17, B: 2 },
    units: [
      unit("A-1", "A", 2, -1, 2, 7, "captain", "SE"),
      unit("A-3", "A", 1, -1, 4, 6, "lancer", "E"),
      unit("B-3", "B", -2, 3, 1, 6, "lancer", "W"),
    ],
    aStatus: "seal in progress",
    bStatus: "no comeback path",
    aMs: 3330,
    bMs: 3474,
    aReason: "Every path to parity is gone now. Just hold shape.",
    bReason: "No legal line flips enough terrain in time.",
    event: event(16, "A", "Blue locks the gate and makes parity mathematically impossible.", 22000, "The engine is just catching up to reality."),
    control: { "-3,2": "A", "-2,2": "A", "-2,3": "A", "-1,2": "A", "0,-1": "A", "0,0": "A", "1,-1": "A", "1,0": "A", "2,-1": "A", "2,0": "A", "3,-1": "A", "3,0": "A" },
  },
  {
    turn: 17,
    phase: "Victory Lap",
    pressure: 67,
    headline: "Blue re-centers both surviving units while the last red lancer fades into fog.",
    featuredEvent: "The board state now looks like a conquest map, not a duel.",
    territories: { A: 17, B: 2 },
    units: [
      unit("A-1", "A", 1, -1, 2, 7, "captain", "E"),
      unit("A-3", "A", 0, -1, 4, 6, "lancer", "E"),
      unit("B-3", "B", -3, 3, 1, 6, "lancer", "W"),
    ],
    aStatus: "re-centering",
    bStatus: "ghosting in fog",
    aMs: 3548,
    bMs: 3660,
    aReason: "Show control, not aggression. The map already says enough.",
    bReason: "Nothing left but delaying the call.",
    event: event(17, "B", "Red's last lancer disappears into the corner fog.", 23400, "A symbolic retreat more than a tactical one."),
    control: { "-3,2": "A", "-2,2": "A", "-2,3": "A", "-1,2": "A", "0,-1": "A", "0,0": "A", "1,-1": "A", "1,0": "A", "2,-1": "A", "2,0": "A", "3,-1": "A", "3,0": "A" },
  },
  {
    turn: 18,
    phase: "Resolution",
    pressure: 48,
    headline: "Blue wins by overwhelming territory control after a 16-turn grind.",
    featuredEvent: "The match ends with the board painted blue, not with a cheap knockout.",
    territories: { A: 18, B: 1 },
    units: [
      unit("A-1", "A", 1, -1, 2, 7, "captain", "E"),
      unit("A-3", "A", 0, -1, 4, 6, "lancer", "E"),
    ],
    aStatus: "victory locked",
    bStatus: "eliminated",
    aMs: 3770,
    bMs: 3844,
    aReason: "No chase needed. The map itself ends the story.",
    bReason: "The replay was lost on space, not on a single bad fight.",
    event: event(18, "A", "Blue holds eighteen control hexes and the engine calls it.", 24800, "Territory victory at turn cap pressure."),
    control: { "-3,2": "A", "-2,2": "A", "-2,3": "A", "-1,2": "A", "0,-1": "A", "0,0": "A", "1,-1": "A", "1,0": "A", "2,-1": "A", "2,0": "A", "3,-1": "A", "3,0": "A", "-3,1": "A" },
  },
];

export function buildDemoFrames() {
  const frames = [];
  const first = STEPS[0];

  frames.push({
    type: "HELLO",
    mode: "demo",
    matchId: DEMO_MATCH_ID,
    state: state(first),
  });

  STEPS.forEach((step, index) => {
    if (index > 0) {
      frames.push({
        type: "STATE",
        mode: "demo",
        state: state(step),
      });
    }

    frames.push({
      type: "EVENT",
      event: step.event,
    });
  });

  const last = STEPS.at(-1);
  frames.push({
    type: "END",
    mode: "demo",
    winner: "A",
    reason: "territory_control",
    state: state(last),
  });

  return frames;
}

export function playDemoReplay(handlers = {}, opts = {}) {
  const frames = buildDemoFrames();
  const stepMs = opts.stepMs ?? STEP_MS;
  let timer = null;
  let index = 0;
  let paused = false;

  const emit = () => {
    if (paused || index >= frames.length) return;
    const frame = frames[index++];
    handlers.onFrame?.(frame, { index, total: frames.length });
    if (frame.type === "HELLO") handlers.onHello?.(frame);
    if (frame.type === "STATE") handlers.onState?.(frame);
    if (frame.type === "EVENT") handlers.onEvent?.(frame);
    if (frame.type === "END") handlers.onEnd?.(frame);
    if (index < frames.length && !paused) {
      timer = setTimeout(emit, stepMs);
    }
  };

  const start = () => {
    clearTimeout(timer);
    timer = setTimeout(emit, 60);
  };

  start();

  return {
    disconnect() {
      clearTimeout(timer);
      paused = true;
    },
    pause() {
      paused = true;
      clearTimeout(timer);
    },
    resume() {
      if (!paused) return;
      paused = false;
      start();
    },
    restart() {
      clearTimeout(timer);
      paused = false;
      index = 0;
      start();
    },
    getFrames() {
      return frames.slice();
    },
  };
}
